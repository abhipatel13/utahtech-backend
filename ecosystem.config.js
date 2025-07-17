module.exports = {
  apps: [
    {
      name: "utahtech-backend",
      script: "server.js",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        HTTPS_PORT: "3003"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "3002",
        HTTPS_PORT: "3003"
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      watch: false,
      max_memory_restart: "1G",
      restart_delay: 1000
    }
  ]
}; 