export interface WindowState {
  maximized: boolean;
}

export interface WindowControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  getState(): Promise<WindowState>;
  onStateChange(callback: (state: WindowState) => void): () => void;
}

declare global {
  interface Window {
    windowControls?: WindowControls;
  }
}
