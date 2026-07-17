module.exports = {
  apps: [
    {
      name: "domex-report-bot",
      script: "backend/server.js",
      cwd: "/home/madu/domex-report-bot",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: "3101",
        ALLOWED_ORIGINS: "https://bot.domex.work.gd",
      },
    },
  ],
};
