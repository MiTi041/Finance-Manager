"use strict";

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  nativeTheme,
} = require("electron");

// ─── App identity (must be first) ───────────────────────────────────────────
app.name = "Finance-Manager";
app.setName("Finance-Manager");

const path = require("path");
app.setPath("userData", path.join(app.getPath("appData"), "Finance-Manager"));

const { spawn, exec } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

// ─── Config ────────────────────────────────────────────────────
const APPLE_DEVELOPER = false;
let pendingUpdateVersion = null;

// ─── Single-instance lock ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// ─── Logging ─────────────────────────────────────────────────────────────────
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────
let pythonProcess = null;

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0] ?? null;
}
function sendToRenderer(channel, data) {
  getMainWindow()?.webContents.send(channel, data);
}

function getDbDir() {
  return app.isPackaged
    ? path.join(app.getPath("userData"), "db")
    : path.join(__dirname, "../backend/finance_server/db/state");
}
function getDbPath() {
  return path.join(getDbDir(), "finance.db");
}

// ─── Backend lifecycle ────────────────────────────────────────────────────────
function getBackendBinaryName() {
  const base = "finance_server_bin";
  return process.platform === "win32" ? `${base}.exe` : base;
}

function getBackendBinaryDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "finance_server_bin")
    : path.join(__dirname, "../backend/dist/finance_server_bin");
}

function startBackend() {
  const binaryPath = path.join(getBackendBinaryDir(), getBackendBinaryName());

  if (!fs.existsSync(binaryPath)) {
    log.error(`Backend not found: ${binaryPath}`);
    return;
  }

  const dbDir = getDbDir();
  log.info(`Starting backend: ${binaryPath}`);

  pythonProcess = spawn(binaryPath, [], {
    cwd: path.dirname(binaryPath),
    env: {
      ...process.env,
      FINANCE_DB_FILE: path.join(dbDir, "finance.db"),
      FINANCE_CREDENTIALS_KEY_FILE: path.join(dbDir, ".credentials.key"),
    },
  });

  pythonProcess.stdout.on("data", (d) => {
    const s = d.toString().trim();
    if (s) log.info(`[backend] ${s}`);
  });
  pythonProcess.stderr.on("data", (d) => {
    const s = d.toString().trim();
    if (s) log.warn(`[backend] ${s}`);
  });
  pythonProcess.on("error", (err) => {
    log.error("Backend spawn error:", err.message);
    pythonProcess = null;
  });
  pythonProcess.on("exit", (code, signal) => {
    log.warn(`Backend exited code=${code} signal=${signal}`);
    pythonProcess = null;
  });
}

function waitForBackend(retries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    function check(n) {
      if (n <= 0) {
        reject(new Error("Backend did not start in time"));
        return;
      }
      let settled = false;
      const req = http.get("http://127.0.0.1:8112/health", (res) => {
        if (settled) return;
        settled = true;
        res.statusCode === 200
          ? resolve()
          : setTimeout(() => check(n - 1), interval);
      });
      req.on("error", () => {
        if (settled) return;
        settled = true;
        setTimeout(() => check(n - 1), interval);
      });
      req.setTimeout(1000, () => {
        if (settled) return;
        settled = true;
        req.destroy();
        setTimeout(() => check(n - 1), interval);
      });
    }
    check(retries);
  });
}

function stopBackend() {
  if (pythonProcess) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pythonProcess.pid), "/f", "/t"]);
    } else {
      pythonProcess.kill("SIGTERM");
    }
    pythonProcess = null;
  }
}

// ─── Auto-Updater ─────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  if (!app.isPackaged) {
    log.info("Auto-updater disabled in dev");
    return;
  }

  // NOTE: "checking" is intentionally NOT forwarded to the renderer
  // to avoid persistent loading toasts on every launch.
  autoUpdater.on("checking-for-update", () =>
    log.info("Checking for updates…"),
  );

  autoUpdater.on("update-available", (info) => {
    log.info("Update available:", info.version);
    pendingUpdateVersion = info.version;
    sendToRenderer("update:available", info);
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("Up to date:", info.version);
    // Only surface this if the user manually triggered the check
    sendToRenderer("update:not-available", info);
  });

  autoUpdater.on("download-progress", (p) => {
    const pct = Math.round(p.percent);
    log.info(`Download ${pct}%`);
    sendToRenderer("update:downloading", {
      percent: pct,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded:", info.version);
    sendToRenderer("update:downloaded", info);
  });

  autoUpdater.on("error", (err) => {
    log.error("Updater error:", err);

    const isCodeSignError =
      err.message?.includes("Code signature") ||
      err.message?.includes("code signature");

    if (isCodeSignError && !app.isPackaged) {
      // Dev mode — not relevant
      return;
    }

    sendToRenderer("update:error", {
      message: isCodeSignError
        ? "Update konnte nicht automatisch installiert werden."
        : err.message,
      manualInstall: isCodeSignError,
    });

    if (isCodeSignError) {
      dialog
        .showMessageBox(getMainWindow(), {
          type: "info",
          title: "Update verfügbar",
          message: "Ein Update wurde heruntergeladen, aber die automatische Installation ist fehlgeschlagen.",
          detail:
            "Lade die neueste Version manuell von GitHub herunter und ersetze die App.",
          buttons: ["Zu GitHub", "Schließen"],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0)
            shell.openExternal(
              "https://github.com/MiTi041/Finance-Manager/releases/latest",
            );
        });
    }

    // Clear broken pending update cache on macOS to prevent retry loops
    if (process.platform === "darwin") {
      const shipItCache = path.join(
        app.getPath("cache"),
        "com.finance-manager.app.ShipIt",
      );
      try {
        fs.rmSync(shipItCache, { recursive: true, force: true });
        log.info("Cleared ShipIt cache after updater error");
      } catch (e) {
        log.warn("Could not clear ShipIt cache:", e.message);
      }
    }
  });

  // Delay initial check — window must be visible first
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 8000);
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function handleDbExport() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath))
    return { success: false, error: "Keine Datenbank gefunden" };

  const { canceled, filePath } = await dialog.showSaveDialog(getMainWindow(), {
    title: "Datenbank exportieren",
    defaultPath: `Finance-Manager-backup-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: "SQLite-Datenbank", extensions: ["db"] }],
  });
  if (canceled || !filePath) return { success: false, error: "Abgebrochen" };

  stopBackend();
  try {
    fs.copyFileSync(dbPath, filePath);
    log.info(`DB exported → ${filePath}`);
    return { success: true };
  } catch (err) {
    log.error("Export error:", err);
    return { success: false, error: err.message };
  } finally {
    startBackend();
  }
}

async function handleDbImport() {
  const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
    title: "Datenbank importieren",
    filters: [{ name: "SQLite-Datenbank", extensions: ["db"] }],
    properties: ["openFile"],
  });
  if (canceled || !filePaths.length)
    return { success: false, error: "Abgebrochen" };

  const { response: confirm } = await dialog.showMessageBox(getMainWindow(), {
    type: "warning",
    title: "Datenbank überschreiben?",
    message:
      "Die aktuelle Datenbank wird ersetzt. Das kann nicht rückgängig gemacht werden.",
    buttons: ["Importieren", "Abbrechen"],
    defaultId: 0,
    cancelId: 1,
  });
  if (confirm !== 0) return { success: false, error: "Abgebrochen" };

  stopBackend();
  try {
    fs.copyFileSync(filePaths[0], getDbPath());
    log.info(`DB imported ← ${filePaths[0]}`);
    startBackend();
    await waitForBackend(20, 500);
    sendToRenderer("db:imported", null);
    return { success: true };
  } catch (err) {
    log.error("Import error:", err);
    startBackend();
    return { success: false, error: err.message };
  }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle("db:export", () => handleDbExport());
ipcMain.handle("db:import", () => handleDbImport());
ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("app:checkForUpdates", () => {
  if (!app.isPackaged) return { status: "dev" };
  if (!autoUpdater) return { status: "unavailable" };
  autoUpdater.checkForUpdates();
  return { status: "checking" };
});

ipcMain.handle("app:downloadUpdate", async () => {
  if (APPLE_DEVELOPER || !pendingUpdateVersion) {
    sendToRenderer("update:downloading", { percent: 0 });
    autoUpdater.downloadUpdate();
    return { success: true };
  }
  return downloadReleaseManually();
});

ipcMain.handle("app:installUpdate", async () => {
  if (APPLE_DEVELOPER) {
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return;
  }
  const dmgPath = path.join(
    app.getPath("downloads"),
    `Finance-Manager-${pendingUpdateVersion}.dmg`,
  );
  if (fs.existsSync(dmgPath)) {
    shell.openPath(dmgPath);
  }
});

ipcMain.handle("shell:openExternal", (_e, url) => {
  try {
    const parsed = new URL(url);
    if (["https:", "http:"].includes(parsed.protocol))
      return shell.openExternal(url);
  } catch {
    /* ignore */
  }
});

ipcMain.handle("shell:openLogs", () =>
  shell.openPath(log.transports.file.getFile().path),
);
ipcMain.handle("shell:openUserData", () =>
  shell.openPath(app.getPath("userData")),
);

// ─── Mail with attachment (macOS) ─────────────────────────────
ipcMain.handle("mail:openWithAttachment", async (_e, { subject, body, to }) => {
  const pdfPath = getRegistrationPdfPath();
  if (!pdfPath) {
    return { success: false, error: "PDF nicht gefunden" };
  }

  if (process.platform === "darwin") {
    return openMailOnMac(to, subject, body, pdfPath);
  }

  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  shell.openExternal(mailto);
  return { success: true, warning: "Anhang wird nur auf macOS unterstützt" };
});

function getRegistrationPdfPath() {
  const candidates = [
    path.join(app.getAppPath(), "frontend", "dist", "assets", "FinTS-Produktregistrierung_V1.0.4.pdf"),
    path.join(__dirname, "..", "frontend", "dist", "assets", "FinTS-Produktregistrierung_V1.0.4.pdf"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function openMailOnMac(to, subject, body, filePath) {
  return new Promise((resolve, reject) => {
    const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:"${esc(subject)}", content:"${esc(body)}" & return}
  tell newMessage
    make new to recipient at end of to recipients with properties {address:"${esc(to)}"}
    try
      make new attachment with properties {file name:"${esc(filePath)}"} at after last paragraph
    end try
    set visible to true
  end tell
  activate
end tell
`;
    const tmpFile = path.join(app.getPath("temp"), `finance-mail-${Date.now()}.applescript`);
    fs.writeFileSync(tmpFile, script, "utf-8");
    exec(`osascript "${tmpFile}"`, (error, stdout, stderr) => {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
      if (error) {
        log.error("Mail AppleScript failed:", error.message, stderr);
        reject(error);
      } else {
        resolve({ success: true });
      }
    });
  });
}

// ─── Manual download (non‑developer builds) ────────────────────
function downloadReleaseManually() {
  return new Promise((resolve) => {
    const version = pendingUpdateVersion;
    if (!version) {
      resolve({ success: false, error: "Keine Update-Informationen" });
      return;
    }

    const dest = path.join(
      app.getPath("downloads"),
      `Finance-Manager-${version}.dmg`,
    );

    if (fs.existsSync(dest)) {
      shell.openPath(dest);
      sendToRenderer("update:downloaded", { version });
      resolve({ success: true });
      return;
    }

    const url = `https://github.com/MiTi041/Finance-Manager/releases/download/v${version}/Finance-Manager-${version}.dmg`;
    log.info(`Downloading update: ${url}`);

    sendToRenderer("update:downloading", { percent: 0 });

    https
      .get(url, (res) => {
        const total = parseInt(res.headers["content-length"] ?? "0", 10);
        let downloaded = 0;
        const fileStream = fs.createWriteStream(dest);

        res.on("data", (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100);
            sendToRenderer("update:downloading", { percent: pct });
          }
        });

        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          sendToRenderer("update:downloaded", { version });
          shell.openPath(dest);
          log.info(`Update downloaded → ${dest}`);
          resolve({ success: true });
        });
      })
      .on("error", (err) => {
        log.error("Manual download failed:", err.message);
        sendToRenderer("update:error", {
          message: `Download fehlgeschlagen: ${err.message}`,
        });
        resolve({ success: false, error: err.message });
      });
  });
}

// ─── Window creation ──────────────────────────────────────────────────────────
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  if (app.isPackaged) {
    mainWindow
      .loadFile(path.join(__dirname, "../frontend/dist/index.html"))
      .catch((err) => log.error("Failed to load index.html:", err));
  } else {
    mainWindow.loadURL("http://localhost:8113");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  return mainWindow;
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  setupAutoUpdater();
  startBackend();

  try {
    await waitForBackend();
    log.info("Backend ready");
  } catch (err) {
    log.error("Backend failed:", err.message);
    dialog.showErrorBox(
      "Backend-Fehler",
      `Backend konnte nicht gestartet werden:\n${err.message}`,
    );
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => stopBackend());
