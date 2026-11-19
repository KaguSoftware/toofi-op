import { BrowserWindow } from 'electron';
import { receiptJob } from './escpos';
import { bgraToMonochrome } from './raster';
import { networkTransport } from './transport';
import { withReceiptCsp } from './receipt-csp';

/**
 * The rendered-image receipt pipeline:
 * renderer-built HTML → hidden offscreen BrowserWindow at the printer's pixel
 * width → capturePage → luminance threshold → GS v 0 bands → transport.
 * Chromium composes the Arabic; the printer only ever sees pixels.
 */

/** 80mm printhead at 203dpi = 576 dots. */
export const RECEIPT_WIDTH_PX = 576;

export interface PrinterConfig {
  host: string;
  port?: number;
}

async function renderToBitmap(html: string): Promise<{ bgra: Buffer; width: number; height: number }> {
  const win = new BrowserWindow({
    show: false,
    width: RECEIPT_WIDTH_PX,
    height: 800,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Own throwaway session: its permission handler cannot touch the main window.
      partition: 'receipt-render',
      // javascript stays on only because the main process measures the page height with
      // executeJavaScript; the page's own scripts are blocked by the CSP (default-src 'none').
    },
  });
  // The receipt page must never navigate, open windows or be granted a permission.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('will-redirect', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(withReceiptCsp(html))}`);
    // Let fonts settle; the receipt is local text, nothing streams in.
    await new Promise((r) => setTimeout(r, 150));
    const contentHeight = (await win.webContents.executeJavaScript(
      'document.documentElement.scrollHeight',
    )) as number;
    win.setContentSize(RECEIPT_WIDTH_PX, Math.max(64, Math.min(contentHeight, 20_000)));
    await new Promise((r) => setTimeout(r, 100));
    const image = await win.webContents.capturePage();
    const sized = image.getSize().width === RECEIPT_WIDTH_PX
      ? image
      : image.resize({ width: RECEIPT_WIDTH_PX });
    const { width, height } = sized.getSize();
    return { bgra: sized.toBitmap(), width, height };
  } finally {
    win.destroy();
  }
}

export async function printReceiptHtml(html: string, printer: PrinterConfig): Promise<void> {
  const { bgra, width, height } = await renderToBitmap(html);
  const mono = bgraToMonochrome(bgra, width, height);
  const job = receiptJob(mono.bits, mono.widthBytes, mono.height);
  await networkTransport(printer.host, printer.port ?? 9100).write(job);
}
