// IPC channel names shared by main and preload. Wire types: ./bridge-types.ts.

export const IPC = {
  /** sendSync: StationInfo. */
  getStation: 'rop:get-station',
  /** invoke (first run only): write station.json, then relaunch. */
  saveStation: 'rop:save-station',
  /** invoke: render the receipt HTML and send it to the station's printer. */
  print: 'rop:print',
  /** invoke: quit to desktop (the renderer checked the manager PIN). */
  quitApp: 'rop:quit-app',
  /** invoke: leave kiosk (the renderer checked the manager PIN). */
  exitFullscreen: 'rop:exit-fullscreen',
  /** main -> renderer push, and invoke for the current value. */
  fullscreenState: 'rop:fullscreen-state',
  /** main -> renderer push: the macOS red traffic light was pressed. */
  closeRequested: 'rop:close-requested',
  /** main -> renderer push: an update has downloaded (null withdraws it). */
  updateReady: 'rop:update-ready',
  /** invoke: the updateReady payload or null, for a renderer that mounted late. */
  updateState: 'rop:update-state',
  /** invoke: quit and install the downloaded update. */
  installUpdate: 'rop:install-update',
} as const;
