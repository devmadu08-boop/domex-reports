#!/usr/bin/env bash
# ==========================================================
# DOMEX Report System - Automated Ubuntu VPS Setup Script
# ==========================================================
set -e

echo -e "\033[0;32m==========================================\033[0m"
echo -e "\033[0;32m   DOMEX Report System - Ubuntu Setup     \033[0m"
echo -e "\033[0;32m==========================================\033[0m"

# 1. Ensure Root / Sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "\033[0;31mPlease run this script as root or with sudo:\033[0m"
  echo "sudo bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/devmadu08-boop/domex-reports/codex/linux-vps-deployment/deploy-ubuntu-vps.sh)\""
  exit 1
fi

APP_DIR="/var/www/domex-report-bot"
DOMAIN="bot.domex.work.gd"

# 2. System updates & basic dependencies
echo -e "\033[0;36m[1/7] Updating apt repositories and installing prerequisites...\033[0m"
apt-get update -y
apt-get install -y curl git ufw unzip build-essential debian-keyring debian-archive-keyring apt-transport-https ca-certificates gnupg

# 3. Configure Firewall (UFW)
echo -e "\033[0;36m[2/7] Configuring UFW Firewall (SSH, HTTP 80, HTTPS 443, 3001)...\033[0m"
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw allow 3001/tcp || true
ufw --force enable || true

# 4. Install Node.js LTS (v22.x)
echo -e "\033[0;36m[3/7] Checking and installing Node.js v22 LTS...\033[0m"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 5. Install PM2 process manager
echo -e "\033[0;36m[4/7] Installing PM2...\033[0m"
npm install -g pm2

# 6. Install Caddy (for Auto-SSL reverse proxy)
echo -e "\033[0;36m[5/7] Installing Caddy Web Server for automatic SSL...\033[0m"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# 7. Clone / Update Repository
echo -e "\033[0;36m[6/7] Setting up project repository at ${APP_DIR}...\033[0m"
mkdir -p /var/www
if [ ! -d "$APP_DIR" ]; then
  git clone -b codex/linux-vps-deployment https://github.com/devmadu08-boop/domex-reports.git "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch origin
  git checkout codex/linux-vps-deployment
  git pull origin codex/linux-vps-deployment
fi

cd "$APP_DIR"
echo "Installing project dependencies..."
npm install
echo "Building frontend..."
npm run build

# 8. Configure Caddyfile
cat <<EOF > /etc/caddy/Caddyfile
${DOMAIN} {
    reverse_proxy 127.0.0.1:3001
}
EOF

systemctl restart caddy
systemctl enable caddy

# 9. Start PM2 daemon
echo -e "\033[0;36m[7/7] Starting application with PM2...\033[0m"
pm2 delete domex-bot 2>/dev/null || true
pm2 start backend/server.js --name domex-bot --time
pm2 save
pm2 startup systemd -u root --hp /root || true
pm2 save

echo -e "\033[0;32m====================================================\033[0m"
echo -e "\033[0;32m  DOMEX Report System Setup Completed Successfully! \033[0m"
echo -e "\033[0;32m====================================================\033[0m"
echo ""
echo -e "Web Application URL: \033[1;34mhttps://${DOMAIN}\033[0m"
echo -e "Backend Port: \033[1;33m3001\033[0m"
echo -e "Project Path: \033[1;33m${APP_DIR}\033[0m"
echo ""
echo "Useful Commands:"
echo "  pm2 status          - Check bot status"
echo "  pm2 logs domex-bot  - View live logs"
echo "  pm2 restart domex-bot - Restart bot"
echo "  systemctl status caddy - Check SSL/Caddy status"
echo ""
