import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createAppServer, type AppHandler } from "../../packages/shared/server.ts";
import { setPlatform } from "./src/lib/platform.ts";

const isDev = process.argv.includes("--dev");
let mainWindow: BrowserWindow | null = null;
let stopServer: (() => Promise<void>) | undefined;
let quitting = false;
let serverUrl: string;

for (const action of ["minimize", "toggle-maximize", "close", "state"] as const) {
  ipcMain.handle(`window:${action}`, (event) => {
    const window = mainWindow;
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      new URL(event.senderFrame.url).origin !== serverUrl
    ) {
      throw new Error("Window controls require the trusted application main frame.");
    }
    switch (action) {
      case "minimize":
        window.minimize();
        break;
      case "toggle-maximize":
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        break;
      case "close":
        window.close();
        break;
      case "state":
        return { maximized: window.isMaximized() };
    }
  });
}

setPlatform({
  exit: () => app.quit(),
  async openFile(options) {
    const result = await dialog.showOpenDialog({ ...options, properties: ["openFile"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  },
  async saveFile(options) {
    const result = await dialog.showSaveDialog(options);
    return result.canceled ? null : (result.filePath ?? null);
  },
  async chooseDirectory(options) {
    const result = await dialog.showOpenDialog({ ...options, properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  },
});

async function startServer(): Promise<string> {
  if (isDev) {
    const { dev } = await import("astro");
    const server = await dev({
      root: fileURLToPath(new URL("../", import.meta.url)),
      server: { host: "127.0.0.1", port: 8000 },
    });
    stopServer = () => server.stop();
    return `http://127.0.0.1:${server.address.port}`;
  }
  const entry = new URL("../dist/server/entry.mjs", import.meta.url).href;
  const { handler } = (await import(entry)) as { handler: AppHandler };
  const server = createAppServer(handler, new URL("../dist/client/", import.meta.url));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  stopServer = () =>
    new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => (error ? reject(error) : resolve()));
    });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing desktop server address.");
  return `http://127.0.0.1:${address.port}`;
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: "Writasaurus",
    width: 1000,
    height: 700,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  const window = mainWindow;
  const sendState = () => {
    window.webContents.send("window:state-changed", { maximized: window.isMaximized() });
  };
  window.on("maximize", sendState);
  window.on("unmaximize", sendState);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url).catch((error) => console.error("Could not open link.", error));
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== serverUrl) event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(serverUrl);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (!mainWindow && serverUrl) {
    void createWindow().catch((error) => {
      console.error("Could not create desktop window.", error);
      app.quit();
    });
  }
});
app.on("before-quit", (event) => {
  if (quitting || !stopServer) return;
  event.preventDefault();
  quitting = true;
  void stopServer().then(
    () => app.quit(),
    (error) => {
      console.error("Could not stop desktop server.", error);
      app.exit(1);
    },
  );
});

void app
  .whenReady()
  .then(async () => {
    serverUrl = await startServer();
    await createWindow();
  })
  .catch((error: unknown) => {
    console.error("Could not start Writasaurus.", error);
    dialog.showErrorBox("Could not start Writasaurus", String(error));
    app.exit(1);
  });
