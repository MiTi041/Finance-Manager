const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let pythonProcess = null;

function startBackend() {
  const binaryPath = app.isPackaged
    ? path.join(process.resourcesPath, "finance_server_bin")
    : path.join(__dirname, "../backend/dist/finance_server_bin");

  pythonProcess = spawn(binaryPath, [], {
    cwd: path.dirname(binaryPath),
    shell: true,
  });

  pythonProcess.on("error", (err) => {
    console.error("Failed to start backend process:", err);
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    mainWindow
      .loadFile(path.join(__dirname, "../frontend/dist/index.html"))
      .catch((err) => console.error("Failed to load index.html:", err));
  } else {
    mainWindow.loadURL("http://localhost:8113");
  }

  // Open DevTools for debugging the white screen
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
