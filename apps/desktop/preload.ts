import { contextBridge, ipcRenderer } from "electron";
import type { WindowControls, WindowState } from "./src/lib/window-controls.ts";

const controls: WindowControls = {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  getState: () => ipcRenderer.invoke("window:state"),
  onStateChange(callback) {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowState) => callback(state);
    ipcRenderer.on("window:state-changed", listener);
    return () => ipcRenderer.removeListener("window:state-changed", listener);
  },
};

contextBridge.exposeInMainWorld("windowControls", controls);
