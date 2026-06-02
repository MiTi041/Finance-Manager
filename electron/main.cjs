"use strict";

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  nativeTheme,
} = require("electron");

// ─────────────────────────────────────────────
// App identity & paths  (set BEFORE anything else)
// ─────────────────────────────────────────────
app.name = "Finance-Manager";
app.setName("Finance-Manager");

const path = require("path");
app.setPath("userData", path.join(app.getPath("appData"), "Finance-Manager"));

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

// ─────────────────────────────────────────────
// Single-instance lock
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = false;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
let pythonProcess = null;
let updateState = { status: "idle", info: null }; // track for menu label

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

// ─────────────────────────────────────────────
// Backend lifecycle
// ─────────────────────────────────────────────
function startBackend() {
  const binaryPath = app.isPackaged
    ? path.join(
        process.resourcesPath,
        "finance_server_bin",
        "finance_server_bin",
      )
    : path.join(
        __dirname,
        "../backend/dist/finance_server_bin",
        "finance_server_bin",
      );

  if (!fs.existsSync(binaryPath)) {
    log.error(`Backend binary not found: ${binaryPath}`);
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
    log.warn(`Backend exited — code=${code} signal=${signal}`);
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
      let settled = false;
      const req = http.get("http://127.0.0.1:8112/health", (res) => {
        if (settled) return;
        settled = true;
        res.statusCode === 200
          ? resolve()
          : setTimeout(() => check(remaining - 1), interval);
      });
      req.on("error", () => {
        if (settled) return;
        settled = true;
        setTimeout(() => check(remaining - 1), interval);
      });
      req.setTimeout(1000, () => {
        if (settled) return;
        settled = true;
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

// ─────────────────────────────────────────────
// Auto-Updater
// ─────────────────────────────────────────────
function setupAutoUpdater() {
  if (!app.isPackaged) {
    log.info("Auto-updater disabled in dev mode");
    return;
  }

  autoUpdater.on("checking-for-update", () => {
    log.info("Checking for updates…");
    updateState = { status: "checking", info: null };
    sendToRenderer("update:checking", null);
    refreshMenu();
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Update available:", info.version);
    updateState = { status: "available", info };
    sendToRenderer("update:available", info);
    refreshMenu();

    dialog
      .showMessageBox(getMainWindow(), {
        type: "info",
        title: "Update verfügbar",
        message: `Version ${info.version} ist verfügbar`,
        detail: "Möchten Sie das Update jetzt herunterladen und installieren?",
        buttons: ["Jetzt herunterladen", "Später"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          updateState = { status: "downloading", info };
          sendToRenderer("update:downloading", { percent: 0 });
          refreshMenu();
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("No update available:", info.version);
    updateState = { status: "idle", info };
    sendToRenderer("update:not-available", info);
    refreshMenu();
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent);
    log.info(`Download ${pct}%`);
    updateState = { status: "downloading", info: { percent: pct } };
    sendToRenderer("update:downloading", {
      percent: pct,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded:", info.version);
    updateState = { status: "downloaded", info };
    sendToRenderer("update:downloaded", info);
    refreshMenu();

    dialog
      .showMessageBox(getMainWindow(), {
        type: "info",
        title: "Update bereit zur Installation",
        message: `Version ${info.version} wurde heruntergeladen`,
        detail:
          "Die App wird neu gestartet und das Update installiert. Nicht gespeicherte Änderungen gehen verloren.",
        buttons: ["Jetzt neu starten", "Beim nächsten Start"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
      });
  });

  autoUpdater.on("error", (err) => {
    log.error("Auto-updater error:", err);
    updateState = { status: "error", info: { message: err.message } };
    sendToRenderer("update:error", { message: err.message });
    refreshMenu();
  });

  // Initial check after a short delay so the window is visible
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5000);
}

// ─────────────────────────────────────────────
// Application Menu
// ─────────────────────────────────────────────
function buildUpdateLabel() {
  switch (updateState.status) {
    case "checking":
      return "Nach Updates suchen… (wird geprüft)";
    case "available":
      return `Update ${updateState.info?.version ?? ""} herunterladen`;
    case "downloading":
      return `Update wird geladen (${updateState.info?.percent ?? 0}%)…`;
    case "downloaded":
      return `Update installieren & neu starten`;
    default:
      return "Nach Updates suchen";
  }
}

function buildMenu() {
  const isMac = process.platform === "darwin";

  const fileMenu = {
    label: "Datei",
    submenu: [
      {
        label: "Datenbank exportieren…",
        accelerator: isMac ? "Cmd+Shift+E" : "Ctrl+Shift+E",
        click: () => handleDbExport(),
      },
      {
        label: "Datenbank importieren…",
        accelerator: isMac ? "Cmd+Shift+I" : "Ctrl+Shift+I",
        click: () => handleDbImport(),
      },
      { type: "separator" },
      isMac
        ? { role: "close", label: "Fenster schließen" }
        : { role: "quit", label: "Beenden" },
    ],
  };

  const editMenu = {
    label: "Bearbeiten",
    submenu: [
      { role: "undo", label: "Rückgängig" },
      { role: "redo", label: "Wiederholen" },
      { type: "separator" },
      { role: "cut", label: "Ausschneiden" },
      { role: "copy", label: "Kopieren" },
      { role: "paste", label: "Einfügen" },
      { role: "selectAll", label: "Alles auswählen" },
    ],
  };

  const viewMenu = {
    label: "Ansicht",
    submenu: [
      { role: "reload", label: "Neu laden" },
      { role: "forceReload", label: "Erzwungen neu laden" },
      { type: "separator" },
      { role: "resetZoom", label: "Zoom zurücksetzen" },
      { role: "zoomIn", label: "Vergrößern" },
      { role: "zoomOut", label: "Verkleinern" },
      { type: "separator" },
      { role: "togglefullscreen", label: "Vollbild" },
      ...(app.isPackaged
        ? []
        : [
            { type: "separator" },
            { role: "toggleDevTools", label: "Entwicklertools" },
          ]),
    ],
  };

  const helpMenu = {
    label: "Hilfe",
    submenu: [
      {
        label: buildUpdateLabel(),
        id: "check-updates",
        enabled:
          updateState.status === "idle" || updateState.status === "error",
        click: () => {
          if (updateState.status === "downloaded") {
            setImmediate(() => autoUpdater.quitAndInstall(false, true));
          } else if (app.isPackaged) {
            autoUpdater.checkForUpdates();
          } else {
            dialog.showMessageBox(getMainWindow(), {
              type: "info",
              title: "Updates",
              message: "Auto-Updates sind im Entwicklungsmodus deaktiviert.",
            });
          }
        },
      },
      { type: "separator" },
      {
        label: "Logs öffnen",
        click: () => shell.openPath(log.transports.file.getFile().path),
      },
      {
        label: "Datenpfad öffnen",
        click: () => shell.openPath(app.getPath("userData")),
      },
      { type: "separator" },
      {
        label: `Über Finance-Manager`,
        click: () => {
          dialog.showMessageBox(getMainWindow(), {
            type: "info",
            title: "Über Finance-Manager",
            message: "Finance-Manager",
            detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nPfad: ${app.getPath("userData")}`,
            buttons: ["OK"],
          });
        },
      },
    ],
  };

  const macAppMenu = {
    label: app.name,
    submenu: [
      { role: "about", label: `Über ${app.name}` },
      { type: "separator" },
      { role: "services", label: "Dienste" },
      { type: "separator" },
      { role: "hide", label: `${app.name} ausblenden` },
      { role: "hideOthers", label: "Andere ausblenden" },
      { role: "unhide", label: "Alle einblenden" },
      { type: "separator" },
      { role: "quit", label: `${app.name} beenden` },
    ],
  };

  const template = [
    ...(isMac ? [macAppMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    helpMenu,
  ];

  return Menu.buildFromTemplate(template);
}

function refreshMenu() {
  Menu.setApplicationMenu(buildMenu());
}

// ─────────────────────────────────────────────
// DB export / import (shared logic used by IPC + menu)
// ─────────────────────────────────────────────
async function handleDbExport() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    await dialog.showMessageBox(getMainWindow(), {
      type: "warning",
      title: "Export fehlgeschlagen",
      message: "Keine Datenbank gefunden.",
    });
    return { success: false, error: "Keine Datenbank gefunden" };
  }

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
    await dialog.showMessageBox(getMainWindow(), {
      type: "info",
      title: "Export erfolgreich",
      message: `Datenbank wurde gesichert nach:\n${filePath}`,
    });
    return { success: true };
  } catch (err) {
    log.error("Export failed:", err);
    await dialog.showMessageBox(getMainWindow(), {
      type: "error",
      title: "Export fehlgeschlagen",
      message: err.message,
    });
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
  if (canceled || filePaths.length === 0)
    return { success: false, error: "Abgebrochen" };

  const { response: confirm } = await dialog.showMessageBox(getMainWindow(), {
    type: "warning",
    title: "Datenbank überschreiben?",
    message:
      "Die aktuelle Datenbank wird durch die importierte Datei ersetzt.\nDieser Vorgang kann nicht rückgängig gemacht werden.",
    buttons: ["Importieren", "Abbrechen"],
    defaultId: 0,
    cancelId: 1,
  });
  if (confirm !== 0) return { success: false, error: "Abgebrochen" };

  stopBackend();
  try {
    fs.copyFileSync(filePaths[0], getDbPath());
    log.info(`DB imported ← ${filePaths[0]}`);
    // Wait for backend to come back up before signalling success
    startBackend();
    await waitForBackend(20, 500);
    sendToRenderer("db:imported", null);
    return { success: true };
  } catch (err) {
    log.error("Import failed:", err);
    startBackend(); // always try to restart
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────
ipcMain.handle("db:export", () => handleDbExport());
ipcMain.handle("db:import", () => handleDbImport());

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("app:checkForUpdates", () => {
  if (!app.isPackaged) return { status: "dev" };
  if (updateState.status === "downloaded") {
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { status: "installing" };
  }
  autoUpdater.checkForUpdates();
  return { status: "checking" };
});

ipcMain.handle("shell:openExternal", (_e, url) => {
  const allowedProtocols = ["https:", "http:"];
  try {
    const parsed = new URL(url);
    if (allowedProtocols.includes(parsed.protocol)) {
      return shell.openExternal(url);
    }
  } catch {
    /* ignore */
  }
});

// ─────────────────────────────────────────────
// Window creation
// ─────────────────────────────────────────────
function createWindow() {
  const isMac = process.platform === "darwin";
  const isWin = process.platform === "win32";

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false, // show only when ready-to-show

    // ── Modern frame styling ──────────────────
    ...(isMac && {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
      vibrancy: "under-window",
      visualEffectState: "active",
    }),
    ...(isWin && {
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: nativeTheme.shouldUseDarkColors ? "#1a1a2e" : "#f8f9fa",
        symbolColor: nativeTheme.shouldUseDarkColors ? "#e0e0ff" : "#1a1a2e",
        height: 40,
      },
    }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1a1a2e" : "#f8f9fa",

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: true,
    },
  });

  // Smooth fade-in instead of white flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Keep titlebar overlay in sync with system theme changes
  nativeTheme.on("updated", () => {
    if (isWin) {
      mainWindow.setTitleBarOverlay({
        color: nativeTheme.shouldUseDarkColors ? "#1a1a2e" : "#f8f9fa",
        symbolColor: nativeTheme.shouldUseDarkColors ? "#e0e0ff" : "#1a1a2e",
      });
    }
  });

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

// ─────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(async () => {
  // Build menu before window so it's ready immediately
  refreshMenu();
  setupAutoUpdater();
  startBackend();

  try {
    await waitForBackend();
    log.info("Backend ready");
  } catch (err) {
    log.error("Backend failed to start:", err.message);
    dialog.showErrorBox(
      "Backend-Fehler",
      `Der Backend-Prozess konnte nicht gestartet werden:\n${err.message}`,
    );
  }

  createWindow();

  app.on("activate", () => {
    // macOS: re-create window if dock icon clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBackend();
});
