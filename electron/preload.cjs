const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  send: (channel, data) => {
    const validChannels = ["toMain"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = [
      "fromMain",
      "update:checking",
      "update:available",
      "update:downloading",
      "update:downloaded",
      "update:error",
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  dbExport: () => ipcRenderer.invoke("db:export"),
  dbImport: () => ipcRenderer.invoke("db:import"),
});
