module.exports = {
  apps: [
    {
      name: "finance-server",
      script: "start_server.sh",
      cwd: "./server",
      watch: false,
    },
    {
      name: "finance-client",
      script: "npm",
      args: "start",
      cwd: "./client",
      watch: false,
    },
  ],
};
