const { app, BrowserWindow, dialog, ipcMain } = require("electron");

app.name = "Finance-Manager";

app.setName("Finance-Manager");

const path = require("path");
app.setPath("userData", path.join(app.getPath("appData"), "Finance-Manager"));

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

let pythonProcess = null;

// -------------------------------------------------
// Auto-Updater Configuration (electron-updater)
// -------------------------------------------------
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = false;

function setupAutoUpdater() {
  if (!app.isPackaged) {
    log.info("Skipping auto-updater in development mode");
    return;
  }

  autoUpdater.on("checking-for-update", () => {
    log.info("Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Update available:", info);
    dialog
      .showMessageBox({
        type: "info",
        title: "Update verfügbar",
        message: `Version ${info.version} ist verfügbar. Möchten Sie jetzt aktualisieren?`,
        buttons: ["Ja", "Später"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("No update available:", info);
  });

  autoUpdater.on("download-progress", (progress) => {
    log.info(
      `Download progress: ${Math.round(progress.percent)}% (${progress.bytesPerSecond} B/s)`,
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded:", info);
    dialog
      .showMessageBox({
        type: "info",
        title: "Update bereit",
        message: `Version ${info.version} wurde heruntergeladen. App wird neu gestartet...`,
        buttons: ["Jetzt neu starten"],
      })
      .then(() => {
        autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    log.error("Auto-updater error:", err);
  });

  autoUpdater.checkForUpdatesAndNotify();
}

function getDbDir() {
  return app.isPackaged
    ? path.join(app.getPath("userData"), "db")
    : path.join(__dirname, "../backend/finance_server/db/state");
}

function getDbPath() {
  return path.join(getDbDir(), "finance.db");
}

function startBackend() {
  let binaryPath;
  if (app.isPackaged) {
    binaryPath = path.join(
      process.resourcesPath,
      "finance_server_bin",
      "finance_server_bin",
    );
  } else {
    binaryPath = path.join(
      __dirname,
      "../backend/dist/finance_server_bin",
      "finance_server_bin",
    );
  }

  const dbDir = getDbDir();

  if (!fs.existsSync(binaryPath)) {
    console.error(`Backend binary not found at: ${binaryPath}`);
    return;
  }

  console.log(`Starting backend: ${binaryPath}`);

  pythonProcess = spawn(binaryPath, [], {
    cwd: path.dirname(binaryPath),
    env: {
      ...process.env,
      FINANCE_DB_FILE: path.join(dbDir, "finance.db"),
      FINANCE_CREDENTIALS_KEY_FILE: path.join(dbDir, ".credentials.key"),
    },
  });

  pythonProcess.stdout.on("data", (data) => {
    const lines = data.toString().trim();
    if (lines) console.log(`[backend] ${lines}`);
  });

  pythonProcess.stderr.on("data", (data) => {
    const lines = data.toString().trim();
    if (lines) console.error(`[backend] ${lines}`);
  });

  pythonProcess.on("error", (err) => {
    console.error("Failed to start backend process:", err.message);
    pythonProcess = null;
  });

  pythonProcess.on("exit", (code, signal) => {
    console.error(`Backend process exited with code ${code}, signal ${signal}`);
    pythonProcess = null;
  });
}

function waitForBackend(retries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    function check(remaining) {
      if (remaining <= 0) {
        reject(new Error("Backend did not start in time"));
        return;
      }
      let done = false;
      const req = http.get("http://127.0.0.1:8112/health", (res) => {
        if (done) return;
        done = true;
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(() => check(remaining - 1), interval);
        }
      });
      req.on("error", () => {
        if (done) return;
        done = true;
        setTimeout(() => check(remaining - 1), interval);
      });
      req.setTimeout(1000, () => {
        if (done) return;
        done = true;
        req.destroy();
        setTimeout(() => check(remaining - 1), interval);
      });
    }
    check(retries);
  });
}

function stopBackend() {
  if (pythonProcess) {
    pythonProcess.kill("SIGTERM");
    pythonProcess = null;
  }
}

// -------------------------------------------------
// IPC Handlers – Database Export / Import
// -------------------------------------------------
ipcMain.handle("db:export", async () => {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    return { success: false, error: "Keine Datenbank gefunden" };
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Datenbank exportieren",
    defaultPath: `Finance-Manager-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: "SQLite Database", extensions: ["db"] }],
  });
  if (canceled || !filePath) return { success: false, error: "Abgebrochen" };

  stopBackend();
  try {
    fs.copyFileSync(dbPath, filePath);
    log.info(`Database exported to: ${filePath}`);
    return { success: true };
  } catch (err) {
    log.error("Export failed:", err);
    return { success: false, error: err.message };
  } finally {
    startBackend();
  }
});

ipcMain.handle("db:import", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Datenbank importieren",
    filters: [{ name: "SQLite Database", extensions: ["db"] }],
    properties: ["openFile"],
  });
  if (canceled || filePaths.length === 0)
    return { success: false, error: "Abgebrochen" };

  if (!fs.existsSync(filePaths[0])) {
    return { success: false, error: "Datei nicht gefunden" };
  }

  stopBackend();
  try {
    fs.copyFileSync(filePaths[0], getDbPath());
    log.info(`Database imported from: ${filePaths[0]}`);
    return { success: true };
  } catch (err) {
    log.error("Import failed:", err);
    return { success: false, error: err.message };
  } finally {
    startBackend();
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
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

  mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  setupAutoUpdater();

  startBackend();

  try {
    await waitForBackend();
    log.info("Backend is ready");
  } catch (err) {
    log.error("Backend failed to start:", err.message);
  }

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
