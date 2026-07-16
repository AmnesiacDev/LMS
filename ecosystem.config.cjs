module.exports = {
  apps: [
    {
      name: "lms-backend",
      script: "./server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        SCHEDULER_ENABLED: "true",
      },
      env_production: {
        NODE_ENV: "production",
        SCHEDULER_ENABLED: "true",
      },
      autorestart: true,
      max_memory_restart: "1G",
      restart_delay: 4000,
      listen_timeout: 8000,
      kill_timeout: 15000,
      time: true,
    },
  ],
};
