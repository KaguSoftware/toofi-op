import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { RopBridge, StationInfo, UpdateReadyInfo } from '../bridge-types';
import { IPC } from '../ipc-channels';

// Exposes window.rop. Renderer-side type: RopBridge in ../bridge-types.ts.

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const rop: RopBridge = {
  getStation: () => ipcRenderer.sendSync(IPC.getStation) as StationInfo,
  saveStation: (req) => ipcRenderer.invoke(IPC.saveStation, req),
  print: (job) => ipcRenderer.invoke(IPC.print, job),
  quitApp: () => ipcRenderer.invoke(IPC.quitApp),
  exitFullscreen: () => ipcRenderer.invoke(IPC.exitFullscreen),

  // The rail mounts long after the window settled, so a subscriber is told
  // where things stand instead of waiting for the next transition.
  onFullscreenState: (cb) => {
    const off = subscribe<boolean>(IPC.fullscreenState, cb);
    void ipcRenderer.invoke(IPC.fullscreenState).then((v: boolean) => cb(v));
    return off;
  },
  onCloseRequested: (cb) => subscribe<void>(IPC.closeRequested, () => cb()),
  onUpdateReady: (cb) => {
    void ipcRenderer.invoke(IPC.updateState).then((info: UpdateReadyInfo | null) => {
      if (info) cb(info);
    });
    return subscribe<UpdateReadyInfo | null>(IPC.updateReady, cb);
  },
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
};

contextBridge.exposeInMainWorld('rop', rop);
