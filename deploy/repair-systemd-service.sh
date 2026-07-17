#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/madu/domex-report-bot"
PM2_BIN="/usr/lib/node_modules/pm2/bin/pm2"
SERVICE_NAME="domex-report-bot.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

if [[ ! -f "${APP_DIR}/deploy/domex-report-bot.service" ]]; then
  echo "Service template is missing from ${APP_DIR}/deploy."
  exit 1
fi

if [[ -e "${SERVICE_FILE}" ]]; then
  echo "Refusing to overwrite existing ${SERVICE_FILE}."
  exit 1
fi

install -m 0644 "${APP_DIR}/deploy/domex-report-bot.service" "${SERVICE_FILE}"
systemctl daemon-reload

# The PM2 audit confirmed this account contains only domex-report-bot.
if sudo -u madu env PM2_HOME=/home/madu/.pm2 "${PM2_BIN}" describe domex-report-bot >/dev/null 2>&1; then
  sudo -u madu env PM2_HOME=/home/madu/.pm2 "${PM2_BIN}" delete domex-report-bot
  sudo -u madu env PM2_HOME=/home/madu/.pm2 "${PM2_BIN}" save --force
fi

sudo -u madu env PM2_HOME=/home/madu/.pm2 "${PM2_BIN}" kill || true
systemctl disable pm2-madu.service >/dev/null 2>&1 || true
systemctl reset-failed pm2-madu.service >/dev/null 2>&1 || true

systemctl enable --now "${SERVICE_NAME}"
sleep 3
systemctl is-active "${SERVICE_NAME}"
curl --fail --silent --show-error http://127.0.0.1:3101/api/health
echo
echo "Direct systemd service repair completed."
