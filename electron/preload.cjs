"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Whitelisted channels the renderer may listen on
const RECEIVE_CHANNELS = new Set([
  "fromMain",
  "update:checking",
  "update:available",
  "update:not-available",
  "update:downloading",
  "update:downloaded",
  "update:error",
  "db:imported",
]);

// Whitelisted channels the renderer may send on (fire-and-forget)
const SEND_CHANNELS = new Set(["toMain"]);

contextBridge.exposeInMainWorld("api", {
  // ── One-way renderer → main ───────────────────────────
  send(channel, data) {
    if (SEND_CHANNELS.has(channel)) ipcRenderer.send(channel, data);
  },

  // ── Subscribe to main → renderer events ──────────────
  receive(channel, callback) {
    if (!RECEIVE_CHANNELS.has(channel)) return;
    // Remove old listener before adding new one to prevent leaks
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },

  // Remove a specific listener
  removeListener(channel, callback) {
    if (RECEIVE_CHANNELS.has(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },

  // ── Database ─────────────────────────────────────────
  dbExport: () => ipcRenderer.invoke("db:export"),
  dbImport: () => ipcRenderer.invoke("db:import"),

  // ── App / Updates ────────────────────────────────────
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),

  // ── Shell ────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
});
