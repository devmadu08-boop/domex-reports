#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/madu/domex-report-bot"
SITE_NAME="domex-report-bot"
DOMAIN_NAME="bot.domex.work.gd"
AVAILABLE_SITE="/etc/nginx/sites-available/${SITE_NAME}"
ENABLED_SITE="/etc/nginx/sites-enabled/${SITE_NAME}"
WEB_ROOT="/var/www/${SITE_NAME}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

if [[ ! -f "${APP_DIR}/nginx.bot.domex.work.gd.conf" ]]; then
  echo "Nginx template is missing from ${APP_DIR}."
  exit 1
fi

if [[ -e "${AVAILABLE_SITE}" || -e "${ENABLED_SITE}" || -e "${WEB_ROOT}" ]]; then
  echo "Refusing to overwrite existing ${SITE_NAME} deployment files."
  exit 1
fi

if grep -Rqs "server_name[[:space:]].*${DOMAIN_NAME}" /etc/nginx/sites-enabled /etc/nginx/conf.d; then
  echo "Refusing to continue because ${DOMAIN_NAME} already exists in an enabled Nginx config."
  exit 1
fi

install -d -o root -g www-data -m 0755 "${WEB_ROOT}"
cp -a "${APP_DIR}/dist/." "${WEB_ROOT}/"
chown -R root:www-data "${WEB_ROOT}"
find "${WEB_ROOT}" -type d -exec chmod 0755 {} +
find "${WEB_ROOT}" -type f -exec chmod 0644 {} +

install -m 0644 "${APP_DIR}/nginx.bot.domex.work.gd.conf" "${AVAILABLE_SITE}"
ln -s "${AVAILABLE_SITE}" "${ENABLED_SITE}"

nginx -t
systemctl reload nginx

certbot --nginx \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --redirect \
  -d "${DOMAIN_NAME}"

nginx -t
systemctl reload nginx

install -m 0644 "${APP_DIR}/deploy/domex-report-bot.service" /etc/systemd/system/domex-report-bot.service
systemctl daemon-reload
systemctl enable --now domex-report-bot.service

echo "Deployment root setup completed for https://${DOMAIN_NAME}."
