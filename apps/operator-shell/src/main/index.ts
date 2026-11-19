import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, Menu, app, dialog, globalShortcut, ipcMain, screen, session, shell } from 'electron';
import type { LeaveResult, PrintResult } from '../bridge-types';
import { brand, supabaseUrl } from '../brand';
import { IPC } from '../ipc-channels';
import { completeFirstRun } from './first-run';
import { IpcValidationError, guardIpc, validatePrintJob, validateStationSetup } from './ipc-validate';
import { printReceiptHtml } from './print/print-receipt';
import { canTrade, loadStation } from './station';
import { startUpdater, type UpdaterHandle } from './updater';
import {
  REFOCUS_DELAY_MS,
  LAYOUT_MIN_HEIGHT,
  LAYOUT_MIN_WIDTH,
  buildCsp,
  clampWindowMinimum,
  hardenSession,
  kioskHardening,
  mayNavigateTo,
  mayOpenExternally,
  openingWindowSize,
  shouldRecoverToRenderer,
  shouldRefocusOnBlur,
  shouldShowTrafficLights,
  type NavigationPolicy,
} from './window-security';

const devServerUrl = process.env.VITE_DEV_SERVER_URL; // e.g. http://localhost:5174 (apps/operator `pnpm dev`)
const isDev = !!devServerUrl || !app.isPackaged;
const navPolicy: NavigationPolicy = { devServerUrl, isDev };

/** Height in CSS px that `titleBarStyle: 'hiddenInset'` reserves for the macOS traffic lights. */
const TRAFFIC_LIGHT_INSET = 52;

// Single-instance lock. `app.quit()` is asynchronous, so module evaluation
// carries on below: everything that matters is behind `gotTheLock`.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let updater: UpdaterHandle | null = null;
/**
 * Set once an update install's quit is under way: every close is that quit, so
 * the red-light guard must let it through and window-all-closed must not quit
 * on top of it.
 */
let closingForUpdate = false;

/**
 * A throw during boot used to vanish into an unhandled rejection and leave a
 * process with no window that ate every later launch through the single-
 * instance lock. Now it is a dialog, a line in userData/startup-error.log, and
 * an exit.
 */
function reportFatalStartup(error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error('[boot] fatal:', detail);
  let logFile = '';
  try {
    logFile = path.join(app.getPath('userData'), 'startup-error.log');
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${detail}\n\n`);
  } catch {
    logFile = ''; // userData unwritable: the dialog still carries the message
  }
  dialog.showErrorBox(
    `${brand.productName} could not start`,
    `${detail}${logFile ? `\n\nSaved to ${logFile}` : ''}`,
  );
  app.exit(1);
}

/** Windows created WITH macOS traffic lights (hiding them elsewhere is meaningless). */
const windowsWithTrafficLights = new WeakSet<BrowserWindow>();
/** Windows a manager let out of the lock (rop:exit-fullscreen). */
const released = new WeakSet<BrowserWindow>();
/** Windows kept above everything, refocusing on blur (kioskHardening). */
const hardened = new WeakSet<BrowserWindow>();
let kioskShortcutsHeld = false;

/**
 * Keep staff on Windows inside the app: always on top at the 'screen-saver'
 * level, focus taken back on blur, and the Alt+Tab / Win-key combinations
 * Electron can register taken for ourselves, each best effort. The bare
 * Windows key and Ctrl+Alt+Del stay the OS's: blocking those is Assigned
 * Access / NoWinKeys in the install runbook.
 */
function hardenKiosk(win: BrowserWindow): void {
  const plan = kioskHardening(process.platform);
  hardened.add(win);
  if (plan.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
  if (kioskShortcutsHeld) return;
  kioskShortcutsHeld = true;
  for (const accelerator of plan.shortcuts) {
    try {
      // false = the OS keeps the combination, which is expected, not an error.
      globalShortcut.register(accelerator, () => {});
    } catch {
      // an accelerator this Electron cannot parse: skip it
    }
  }
}

function softenKiosk(win: BrowserWindow): void {
  hardened.delete(win);
  if (!win.isDestroyed()) win.setAlwaysOnTop(false);
  if (!kioskShortcutsHeld) return;
  kioskShortcutsHeld = false;
  try {
    globalShortcut.unregisterAll();
  } catch {
    // before ready or after quit: nothing is held
  }
}

/**
 * Let a window out of kiosk: windowed, closable, minimisable. The renderer
 * calls this (rop:exit-fullscreen) only after it has verified a manager PIN.
 * Frameless production windows cannot grow a titlebar, so the window is also
 * shrunk and centred, which is what tells the operator they are out.
 */
function releaseWindow(win: BrowserWindow): void {
  released.add(win);
  win.setMinimizable(true);
  // Kiosk off first: on macOS leaving kiosk is itself a fullscreen transition.
  if (win.isKiosk()) win.setKiosk(false);
  if (win.isFullScreen()) win.setFullScreen(false);
  if (process.platform === 'darwin' && win.isSimpleFullScreen()) win.setSimpleFullScreen(false);
  win.setClosable(true);
  win.setMenuBarVisibility(true);
  win.setAutoHideMenuBar(false);
  win.setAlwaysOnTop(false);
  softenKiosk(win);
  if (win.isMaximized()) win.unmaximize();
  const { width, height } = screen.getDisplayMatching(win.getBounds()).workAreaSize;
  win.setBounds(
    {
      width: Math.round(width * 0.9),
      height: Math.round(height * 0.9),
      x: Math.round(width * 0.05),
      y: Math.round(height * 0.05),
    },
    true,
  );
  win.setMovable(true);
}

function isFullscreen(win: BrowserWindow): boolean {
  return win.isFullScreen() || win.isKiosk() || win.isSimpleFullScreen();
}

function createWindow(): BrowserWindow {
  const station = loadStation();
  // An UNCONFIGURED station (first run) is a normal window: a kiosk whose only
  // exit is the setup screen would be a machine nobody can close if it was
  // launched by mistake. Kiosk starts on the relaunch after setup.
  const relaxed = isDev || !station.configured;
  const locked = !relaxed;
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const floor = { width: LAYOUT_MIN_WIDTH, height: LAYOUT_MIN_HEIGHT };
  const minimum = clampWindowMinimum(floor, workArea);
  const opening = openingWindowSize(floor, workArea);
  const trafficLights = shouldShowTrafficLights({
    platform: process.platform,
    isDev,
    configured: station.configured,
    mode: station.mode,
  });
  const win = new BrowserWindow({
    kiosk: locked,
    autoHideMenuBar: true,
    width: opening.width,
    height: opening.height,
    minWidth: minimum.width,
    minHeight: minimum.height,
    // The traffic lights are drawn by the frame, so a macOS window that shows
    // them is framed even when `relaxed` is false.
    frame: relaxed || trafficLights,
    ...(trafficLights ? { titleBarStyle: 'hiddenInset' as const } : {}),
    // Production windows close only through Quit to desktop (rop:quit-app);
    // where the red traffic light exists it has to actually close (and is
    // held and handed to the renderer, below).
    closable: relaxed || trafficLights,
    // Sending the till to the Dock is leaving it.
    minimizable: !locked,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload is a single esbuild bundle, so the sandbox can be on.
      sandbox: true,
      // Order chimes (WebAudio) must play without a click on a station.
      autoplayPolicy: 'no-user-gesture-required',
      // A hidden or occluded window's timers are throttled to ~1/min, which
      // would stall realtime refetches on a till sitting behind another window.
      backgroundThrottling: false,
      // A packaged station has no DevTools: from its console anyone at the till
      // could call window.rop directly.
      devTools: !app.isPackaged,
    },
  });

  // Pin the top-level frame to our own renderer: a compromised or buggy page
  // must not navigate to remote content with the preload still attached.
  const blockNavigation = (event: Electron.Event, url: string) => {
    if (mayNavigateTo(url, navPolicy)) return;
    event.preventDefault();
    console.error('[security] blocked navigation to', url);
  };
  win.webContents.on('will-navigate', blockNavigation);
  win.webContents.on('will-redirect', blockNavigation);

  // Links the renderer opens go to the system browser (https only; http in
  // dev), never to a second Electron window inside the kiosk.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (mayOpenExternally(url, navPolicy)) {
      void shell.openExternal(url);
    } else {
      console.error('[security] refused to open externally:', url);
    }
    return { action: 'deny' };
  });

  // Nothing in this app embeds third-party frames; a webview carries its own
  // preload and its own privileges.
  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.error('[security] blocked webview attach');
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    const rendererFile = app.isPackaged
      ? // The SPA rides as extraResources/renderer: loaded from disk, never a URL.
        path.join(process.resourcesPath, 'renderer', 'index.html')
      : // Monorepo-local build of apps/operator, for `electron .` smoke runs.
        path.join(__dirname, '../../../operator/dist/index.html');
    void win.loadFile(rendererFile);

    // A reload of a URL that is not index.html would end on a white window.
    const rendererUrl = pathToFileURL(rendererFile).href;
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url, isMainFrame) => {
      if (!shouldRecoverToRenderer({ url, errorCode, isMainFrame }, rendererUrl)) return;
      console.error('[window] load failed, returning to the renderer:', url, errorDescription);
      void win.loadFile(rendererFile);
    });
  }

  // Crash recovery: renderer process gone, reload. (A React render throw is
  // caught by the renderer's own error boundary.)
  win.webContents.on('render-process-gone', () => win.webContents.reload());

  // Full screen and the traffic lights are alternatives, not companions: the
  // buttons show only while the window is windowed. Published for every window,
  // because the renderer's "Exit forced full screen" row needs the state.
  const publishFullscreen = () => {
    if (win.isDestroyed()) return;
    const fullscreen = isFullscreen(win);
    if (trafficLights) win.setWindowButtonVisibility(!fullscreen);
    win.webContents.send(IPC.fullscreenState, fullscreen);
  };
  win.on('enter-full-screen', publishFullscreen);
  win.on('leave-full-screen', publishFullscreen);
  win.webContents.on('did-finish-load', publishFullscreen);

  if (trafficLights) {
    windowsWithTrafficLights.add(win);
    // macOS closes the window the moment the red light is clicked, which would
    // end service on one mis-click. Hold it and let the renderer ask (and check
    // the PIN). quitApp exits through app.exit(), which raises no 'close'.
    win.on('close', (event) => {
      if (win.isDestroyed() || closingForUpdate) return;
      event.preventDefault();
      win.webContents.send(IPC.closeRequested);
    });
  }

  // A locked station starts hardened and takes focus back when Alt+Tab or the
  // Windows key moved it away.
  if (locked) {
    hardenKiosk(win);
    win.setMinimizable(false);
  }
  win.on('blur', () => {
    const decide = () =>
      shouldRefocusOnBlur({
        platform: process.platform,
        locked: hardened.has(win),
        released: released.has(win),
        destroyed: win.isDestroyed(),
      });
    if (!decide()) return;
    setTimeout(() => {
      if (!decide() || win.isFocused()) return;
      win.moveTop();
      win.focus();
    }, REFOCUS_DELAY_MS);
  });
  return win;
}

if (gotTheLock) {
  app
    .whenReady()
    .then(() => {
      // CSP header + deny-all permissions, before any window loads.
      hardenSession(
        session.defaultSession,
        buildCsp({ supabaseUrl: supabaseUrl || undefined, isDev, devServerUrl }),
      );

      // Electron's default menu carries Ctrl+Shift+I (DevTools) and Ctrl+R
      // (reload) as accelerators that work with the menu bar hidden. A packaged
      // station gets no menu; macOS keeps only the Edit roles so copy and paste
      // keep working in text fields.
      if (app.isPackaged) {
        Menu.setApplicationMenu(
          process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'editMenu' }]) : null,
        );
        // Launch on boot: registered on every packaged start so an install
        // moved between accounts heals itself.
        app.setLoginItemSettings({ openAtLogin: true });
      }

      const station = loadStation();
      // A dev or first-run window is an ordinary one; a configured packaged
      // station is a kiosk (createWindow).
      const stationLocked = station.configured && !isDev;

      updater = startUpdater({
        enabled: app.isPackaged,
        onReady: (info) => {
          for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.updateReady, info);
        },
        allowClose: () => {
          closingForUpdate = true;
          for (const w of BrowserWindow.getAllWindows()) w.setClosable(true);
        },
      });

      ipcMain.on(IPC.getStation, (e) => {
        e.returnValue = {
          ...station,
          appVersion: app.getVersion(),
          locked: stationLocked,
          // 'hiddenInset' draws the traffic lights INSIDE the page.
          titleBarInset: shouldShowTrafficLights({
            platform: process.platform,
            isDev,
            configured: station.configured,
            mode: station.mode,
          })
            ? TRAFFIC_LIGHT_INSET
            : 0,
        };
      });

      // First-run setup: the answer becomes station.json and the process
      // relaunches. Refused once a file exists.
      ipcMain.handle(IPC.saveStation, (_e, v: unknown) =>
        guardIpc('saveStation', () => completeFirstRun(validateStationSetup(v))),
      );

      ipcMain.handle(IPC.print, async (_e, job: unknown): Promise<PrintResult | { error: string }> => {
        let validated;
        try {
          validated = validatePrintJob(job);
        } catch (error) {
          if (error instanceof IpcValidationError) {
            console.error('[ipc:print]', error.message);
            return { error: error.message };
          }
          throw error;
        }
        // A receipt names the station that issued it: an unidentified machine
        // must not print one.
        if (!canTrade(station)) return { ok: false, error: 'not-configured' };
        // No printer: the renderer falls back to the on-screen bill / window.print().
        if (!station.printer) return { ok: false, error: 'no-printer' };
        try {
          await printReceiptHtml(validated.html, station.printer);
          return { ok: true };
        } catch (error) {
          // One retry: thermal printers drop the first connection after idling.
          try {
            await printReceiptHtml(validated.html, station.printer);
            return { ok: true };
          } catch {
            console.error('[print]', error);
            return { ok: false, error: String(error) };
          }
        }
      });

      ipcMain.handle(IPC.fullscreenState, (e) => {
        const win = BrowserWindow.fromWebContents(e.sender);
        return !!win && !win.isDestroyed() && isFullscreen(win);
      });

      // Leaving the station. Main does not check a PIN: the renderer verifies a
      // manager PIN against the server (app.verify_manager_pin) before it calls
      // these, and a packaged station has no DevTools or menu accelerators, and
      // navigates only to its own renderer.
      ipcMain.handle(IPC.quitApp, (): LeaveResult => {
        setTimeout(() => {
          // A downloaded update installs on the way out and the app reopens on
          // it; app.exit() skips will-quit, so autoInstallOnAppQuit alone
          // would never fire here. With nothing waiting this just exits.
          if (!updater?.installNow()) app.exit(0);
        }, 50); // let the reply reach the renderer
        return { ok: true };
      });
      ipcMain.handle(IPC.exitFullscreen, (e): LeaveResult => {
        const win = BrowserWindow.fromWebContents(e.sender);
        if (!win || win.isDestroyed()) return { ok: false, error: 'no-window' };
        releaseWindow(win);
        return { ok: true };
      });

      ipcMain.handle(IPC.updateState, () => updater?.ready() ?? null);
      ipcMain.handle(IPC.installUpdate, () => ({ ok: updater?.installNow() ?? false }));

      const win = createWindow();

      // A second launch surfaces the station that is already trading.
      app.on('second-instance', () => {
        if (win.isDestroyed()) return;
        if (win.isMinimized()) win.restore();
        win.focus();
      });
      win.on('closed', () => updater?.stop());
    })
    .catch(reportFatalStartup);
}

// Hand every kiosk shortcut back to the OS on the way out.
app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // nothing held
  }
});

app.on('window-all-closed', () => {
  // Not while an update installs: the updater's own quit is under way.
  if (closingForUpdate) return;
  app.quit();
});
