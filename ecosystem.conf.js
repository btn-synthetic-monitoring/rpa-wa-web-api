module.exports = {
  apps: [
    {
      name: "rpa-wa-web-api",
      script: "dist/server.js",
      interpreter: "node",
      cwd: __dirname,

      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,

      max_memory_restart: "1G",
      min_uptime: "30s",
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,

      env: {
        NODE_ENV: "production"
      },

      time: true,
      merge_logs: true,
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};
