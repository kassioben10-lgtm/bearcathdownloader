const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = process.env.PORT || 48291;

function startBackendServer() {
  return new Promise((resolve) => {
    // Check if server is already running
    const testReq = http.get(`http://127.0.0.1:${SERVER_PORT}/api/health`, (res) => {
      resolve();
    });

    testReq.on("error", () => {
      // Start server.js as a child process
      const serverScript = path.join(__dirname, "..", "server.js");
      serverProcess = spawn(process.execPath, [serverScript], {
        env: {
          ...process.env,
          PORT: String(SERVER_PORT),
          HOST: "127.0.0.1",
          ELECTRON_RUN: "true",
        },
        stdio: "ignore",
      });

      // Wait a moment for server to listen
      const checkInterval = setInterval(() => {
        const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/health`, (res) => {
          clearInterval(checkInterval);
          resolve();
        });
        req.on("error", () => {});
      }, 300);

      // Max timeout fallback
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 4000);
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: "Bear Catch Downloader",
    backgroundColor: "#0d1117",
    icon: path.join(__dirname, "..", "public", "favicon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  await startBackendServer();

  // Load the running server
  mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}/#/`);

  // Open external links in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
  }
});
