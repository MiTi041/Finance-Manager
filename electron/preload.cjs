"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const RECEIVE_CHANNELS = new Set([
  "fromMain",
  "update:available",
  "update:not-available",
  "update:downloading",
  "update:downloaded",
  "update:error",
  "db:imported",
]);

contextBridge.exposeInMainWorld("api", {
  // ── Renderer → main (fire & forget) ─────────────────────
  send(channel, data) {
    const allowed = new Set(["toMain"]);
    if (allowed.has(channel)) ipcRenderer.send(channel, data);
  },

  // ── Main → renderer (subscribe) ─────────────────────────
  receive(channel, callback) {
    if (!RECEIVE_CHANNELS.has(channel)) return;
    ipcRenderer.removeAllListeners(channel);
    ipcRenderer.on(channel, (_e, ...args) => callback(...args));
  },

  removeListener(channel, callback) {
    if (RECEIVE_CHANNELS.has(channel))
      ipcRenderer.removeListener(channel, callback);
  },

  // ── Database ─────────────────────────────────────────────
  dbExport: () => ipcRenderer.invoke("db:export"),
  dbImport: () => ipcRenderer.invoke("db:import"),

  // ── App / Updates ─────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke("app:version"),
  checkForUpdates: () => ipcRenderer.invoke("app:checkForUpdates"),
  installUpdate: () => ipcRenderer.invoke("app:installUpdate"),

  // ── Shell ─────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openLogs: () => ipcRenderer.invoke("shell:openLogs"),
  openUserData: () => ipcRenderer.invoke("shell:openUserData"),

});
