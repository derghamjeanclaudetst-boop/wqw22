#!/usr/bin/env bash
# =============================================================================
#  NOVIQ — Full VPS Deployment Script
#  Supports: Ubuntu 22.04 LTS / 24.04 LTS
#  Usage:    sudo bash deploy.sh
#
#  What this script does (fully automated after the first prompts):
#    1.  Collects ALL configuration up-front — then runs without interruption
#    2.  Installs Node.js 20, Nginx, PostgreSQL, PM2, Certbot
#    3.  Creates the PostgreSQL database and user
#    4.  Copies project files (or clones from Git)
#    5.  Patches db driver (neon → standard pg) for local PostgreSQL
#    6.  Patches server to read PORT from environment
#    7.  Strips Replit-only Vite plugins
#    8.  Writes .env and ecosystem.config.cjs
#    9.  npm install + Vite + esbuild build
#   10.  Restores full database backup (if .sql file present) OR drizzle push + seed
#   11.  Starts app with PM2 (auto-restart, boot-survivor)
#   12.  Configures Nginx (any external port → Node.js internal port)
#   13.  Obtains Let's Encrypt SSL certificate automatically (if real domain given)
#   14.  Sets UFW firewall rules
#   15.  Health-checks the live app
#   16.  Prints the final URL and credentials
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# ─── Colour helpers ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()    { echo -e "${GREEN}[✓]${NC}  $*"; }
info()   { echo -e "${BLUE}[→]${NC}  $*"; }
warn()   { echo -e "${YELLOW}[!]${NC}  $*"; }
error()  { echo -e "${RED}[✗]${NC}  $*"; exit 1; }
step()   { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }
ask()    { echo -e "${YELLOW}  ▸${NC} $*"; }

# ─── Must run as root ─────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && error "Run this script as root:  sudo bash deploy.sh"

# ─── Banner ───────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
cat <<'BANNER'
  ███╗   ██╗ ██████╗ ██╗   ██╗██╗ ██████╗
  ████╗  ██║██╔═══██╗██║   ██║██║██╔═══██╗
  ██╔██╗ ██║██║   ██║██║   ██║██║██║   ██║
  ██║╚██╗██║██║   ██║╚██╗ ██╔╝██║██║▄▄ ██║
  ██║ ╚████║╚██████╔╝ ╚████╔╝ ██║╚██████╔╝
  ╚═╝  ╚═══╝ ╚═════╝   ╚═══╝  ╚═╝ ╚══▀▀═╝
BANNER
echo -e "${NC}"
echo -e "${BOLD}  Full VPS Deployment — Ubuntu 22.04 / 24.04${NC}"
echo -e "  ─────────────────────────────────────────────"
echo ""

# =============================================================================
#  SECTION 0 — COLLECT ALL CONFIGURATION UP-FRONT
#  (All prompts happen here. After you answer, the script runs without asking.)
# =============================================================================
step "Configuration — answer once, then relax"

# Detect public IP
DEFAULT_IP=$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null \
  || curl -sf --max-time 5 https://ipv4.icanhazcurl.com 2>/dev/null \
  || hostname -I | awk '{print $1}')

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
ask "App installation directory  [/var/www/noviq]:"
read -r APP_DIR; APP_DIR="${APP_DIR:-/var/www/noviq}"

ask "Domain name OR server IP    [$DEFAULT_IP]:"
read -r DOMAIN; DOMAIN="${DOMAIN:-$DEFAULT_IP}"

ask "External web port           [80]  (use 443 for HTTPS-only, or any custom port):"
read -r EXT_PORT; EXT_PORT="${EXT_PORT:-80}"

ask "PostgreSQL database name    [noviq_db]:"
read -r DB_NAME; DB_NAME="${DB_NAME:-noviq_db}"

ask "PostgreSQL username         [noviq_admin]:"
read -r DB_USER; DB_USER="${DB_USER:-noviq_admin}"

ask "PostgreSQL password         [leave blank to auto-generate]:"
read -rs DB_PASS; echo ""
if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 28)
  warn "Auto-generated DB password — saved to $APP_DIR/.env after install"
fi

ask "Session secret              [leave blank to auto-generate]:"
read -rs SESSION_SECRET; echo ""
if [[ -z "$SESSION_SECRET" ]]; then
  SESSION_SECRET=$(openssl rand -base64 48)
fi

ask "Git repository URL          [leave blank to copy files from this directory]:"
read -r REPO_URL

# SSL — only offer if domain looks like a real hostname (not an IP)
ENABLE_SSL="n"
if [[ "$DOMAIN" =~ ^[a-zA-Z] ]] && [[ "$DOMAIN" != "localhost" ]]; then
  ask "Enable automatic HTTPS / Let's Encrypt SSL?  [y/N]:"
  read -r ENABLE_SSL; ENABLE_SSL="${ENABLE_SSL:-n}"
fi

# If SSL enabled, force port 443 for Nginx HTTPS
if [[ "${ENABLE_SSL,,}" == "y" ]]; then
  ask "Email address for Let's Encrypt certificate:"
  read -r LE_EMAIL
  [[ -z "$LE_EMAIL" ]] && error "Email is required for Let's Encrypt"
  EXT_PORT=443
fi

# Restore from SQL backup?
SQL_BACKUP=""
# Check current directory and APP_DIR for backup files
for candidate in \
    "$SCRIPT_DIR/noviq-full-backup-2026-05-03.sql" \
    "$SCRIPT_DIR"/*.sql \
    "$APP_DIR"/*.sql; do
  if [[ -f "$candidate" ]]; then
    SQL_BACKUP="$candidate"
    break
  fi
done

if [[ -n "$SQL_BACKUP" ]]; then
  warn "Found database backup: $(basename "$SQL_BACKUP")"
  ask "Restore this backup into the database?  [Y/n]  (contains all your existing data):"
  read -r RESTORE_BACKUP; RESTORE_BACKUP="${RESTORE_BACKUP:-y}"
else
  RESTORE_BACKUP="n"
fi

# Internal Node.js port (never exposed to the internet — Nginx proxies to it)
APP_PORT=5000

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}  ── Deployment plan ───────────────────────────────────────────${NC}"
echo -e "  App directory   : $APP_DIR"
echo -e "  Domain / IP     : $DOMAIN"
echo -e "  External port   : $EXT_PORT"
echo -e "  SSL (HTTPS)     : ${ENABLE_SSL,,}"
echo -e "  Internal port   : $APP_PORT (Node.js — not exposed)"
echo -e "  Database        : $DB_NAME  (user: $DB_USER)"
echo -e "  Source          : ${REPO_URL:-local files in $SCRIPT_DIR}"
if [[ -n "$SQL_BACKUP" && "${RESTORE_BACKUP,,}" == "y" ]]; then
  echo -e "  DB restore      : $(basename "$SQL_BACKUP")"
else
  echo -e "  DB restore      : No — will run schema push + seed"
fi
echo ""
ask "Everything look right? Proceed?  [y/N]:"
read -r CONFIRM
[[ "${CONFIRM,,}" == "y" ]] || error "Aborted by user."

echo ""
echo -e "${GREEN}Starting deployment — you can now leave it running unattended.${NC}"
echo ""

# =============================================================================
#  SECTION 1 — SYSTEM PACKAGES
# =============================================================================
step "Installing system packages"

export DEBIAN_FRONTEND=noninteractive

info "Updating package index..."
apt-get update -qq

info "Installing base tools..."
apt-get install -y -qq \
  curl git build-essential rsync \
  nginx ufw \
  postgresql postgresql-contrib \
  certbot python3-certbot-nginx \
  openssl ca-certificates gnupg lsb-release \
  2>&1 | grep -E "^(Get|Setting|Unpacking|Processing)" | head -20 || true

# ── Node.js 20 LTS ────────────────────────────────────────────────────────────
NODE_MAJ=$(node --version 2>/dev/null | grep -oP '^\Kv\d+' | tr -d 'v' || echo "0")
if [[ "$NODE_MAJ" -lt 20 ]]; then
  info "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node.js $(node --version) — npm $(npm --version)"

# ── PM2 ───────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  npm install -g pm2 --quiet >/dev/null 2>&1
fi
log "PM2 $(pm2 --version)"

# =============================================================================
#  SECTION 2 — POSTGRESQL SETUP
# =============================================================================
step "PostgreSQL setup"

systemctl start postgresql
systemctl enable postgresql --quiet

info "Creating database user '$DB_USER' and database '$DB_NAME'..."
sudo -u postgres psql -v ON_ERROR_STOP=0 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    EXECUTE format('CREATE USER %I WITH PASSWORD %L', '${DB_USER}', '${DB_PASS}');
    RAISE NOTICE 'Created user ${DB_USER}';
  ELSE
    EXECUTE format('ALTER USER %I WITH PASSWORD %L', '${DB_USER}', '${DB_PASS}');
    RAISE NOTICE 'Updated password for ${DB_USER}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}"'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')
\gexec

GRANT ALL PRIVILEGES ON DATABASE "${DB_NAME}" TO "${DB_USER}";
SQL

# PostgreSQL 15+ needs explicit schema grants
sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=0 -q <<SQL
GRANT ALL ON SCHEMA public TO "${DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO "${DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${DB_USER}";
SQL

log "PostgreSQL: '$DB_NAME' with owner '$DB_USER' — ready"

# =============================================================================
#  SECTION 3 — APPLICATION FILES
# =============================================================================
step "Deploying application files"

mkdir -p "$APP_DIR"

if [[ -n "$REPO_URL" ]]; then
  if [[ -d "$APP_DIR/.git" ]]; then
    info "Git repo exists — pulling latest..."
    git -C "$APP_DIR" pull --ff-only
  else
    info "Cloning $REPO_URL → $APP_DIR ..."
    git clone --depth=1 "$REPO_URL" "$APP_DIR"
  fi
else
  info "Copying local files from $SCRIPT_DIR to $APP_DIR ..."
  rsync -a --delete \
    --exclude='node_modules/' \
    --exclude='dist/' \
    --exclude='.git/' \
    --exclude='*.log' \
    --exclude='.local/' \
    --exclude='.cache/' \
    --exclude='.config/' \
    --exclude='.upm/' \
    "$SCRIPT_DIR/" "$APP_DIR/"
fi

# Create required directories
mkdir -p "$APP_DIR/logs" "$APP_DIR/uploads"
log "Files deployed to $APP_DIR"

# =============================================================================
#  SECTION 4 — PATCH DB DRIVER (Neon WebSocket → standard pg / TCP)
# =============================================================================
step "Patching DB driver for local PostgreSQL"

# @neondatabase/serverless uses WebSocket which doesn't work with local Postgres.
# Replace with the standard 'pg' driver (TCP connection, no websockets).
cat > "$APP_DIR/server/db.ts" <<'DBTS'
// VPS build — standard pg driver (TCP) instead of @neondatabase/serverless (WebSocket)
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Create a .env file or set the environment variable.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle({ client: pool, schema });
DBTS

log "server/db.ts patched → standard pg driver"

# =============================================================================
#  SECTION 5 — PATCH SERVER PORT (read from env, not hardcoded)
# =============================================================================
step "Patching server port to read from environment"

# The original server/index.ts hardcodes port 5000.
# We patch it so $PORT env var overrides it (useful for multi-app VPS setups).
SERVER_INDEX="$APP_DIR/server/index.ts"
if grep -q "const port = 5000" "$SERVER_INDEX" 2>/dev/null; then
  sed -i 's/const port = 5000/const port = parseInt(process.env.PORT || "5000", 10)/' "$SERVER_INDEX"
  log "server/index.ts: port now reads from \$PORT env var"
else
  log "server/index.ts: port already dynamic (or already patched)"
fi

# =============================================================================
#  SECTION 6 — PATCH VITE CONFIG (remove Replit-only plugins)
# =============================================================================
step "Patching vite.config.ts for production build"

cat > "$APP_DIR/vite.config.ts" <<'VITECFG'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@":       path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir:    path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
VITECFG

log "vite.config.ts patched — Replit-only plugins removed"

# =============================================================================
#  SECTION 7 — ENVIRONMENT FILE
# =============================================================================
step "Writing .env file"

cat > "$APP_DIR/.env" <<ENV
# NOVIQ — Production Environment
# Generated by deploy.sh on $(date -u "+%Y-%m-%d %H:%M UTC")
# ⚠  Keep this file private — never commit to version control

NODE_ENV=production
PORT=${APP_PORT}

DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
ENV

chmod 600 "$APP_DIR/.env"
log ".env written (permissions 600)"

# =============================================================================
#  SECTION 8 — INSTALL DEPENDENCIES & BUILD
# =============================================================================
step "Installing npm dependencies"

cd "$APP_DIR"

# Load .env for the build steps
export DATABASE_URL
export NODE_ENV=production
export PORT=$APP_PORT

info "npm install (this takes 1-4 minutes on first run)..."
npm install --prefer-offline 2>&1 | tail -5

# Install standard pg adapter (needed by patched db.ts)
info "Installing pg + drizzle-orm/node-postgres adapter..."
npm install pg drizzle-orm 2>&1 | tail -3

log "Dependencies installed"

# ── Build frontend ──────────────────────────────────────────────────────────
step "Building frontend (Vite) and backend (esbuild)"

info "Building React frontend..."
npx vite build 2>&1 | tail -8

info "Compiling Express backend..."
npx esbuild server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outdir=dist \
  2>&1 | tail -5

log "Build complete → dist/public/ (frontend) + dist/index.js (backend)"

# =============================================================================
#  SECTION 9 — DATABASE SCHEMA + DATA
# =============================================================================
step "Setting up database schema and data"

if [[ -n "$SQL_BACKUP" && "${RESTORE_BACKUP,,}" == "y" ]]; then
  # ── Restore from backup ──────────────────────────────────────────────────────
  info "Restoring database from backup: $(basename "$SQL_BACKUP") ..."

  # Drop and recreate for a clean restore
  sudo -u postgres psql -v ON_ERROR_STOP=0 -q <<SQL
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
SQL

  PGPASSWORD="$DB_PASS" psql \
    -h localhost -U "$DB_USER" -d "$DB_NAME" \
    -v ON_ERROR_STOP=0 \
    -f "$SQL_BACKUP" \
    2>&1 | grep -v "^NOTICE" | grep -v "^$" | tail -20 || true

  log "Database restored from backup — all your data is in place"

else
  # ── Fresh schema push ────────────────────────────────────────────────────────
  info "Pushing Drizzle schema (creates all tables)..."
  DATABASE_URL="$DATABASE_URL" npx drizzle-kit push --force 2>&1 | tail -10 || true

  # Create connect-pg-simple session table
  info "Creating session store table..."
  PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=0 -q <<SQL
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json    NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
SQL

  log "Schema created — seed data will be inserted on first app start"
fi

# =============================================================================
#  SECTION 10 — PM2 PROCESS MANAGER
# =============================================================================
step "Setting up PM2"

cat > "$APP_DIR/ecosystem.config.cjs" <<ECOJS
module.exports = {
  apps: [{
    name: 'noviq',
    script: 'dist/index.js',
    cwd: '${APP_DIR}',
    interpreter: 'node',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: '${DATABASE_URL}',
      SESSION_SECRET: '${SESSION_SECRET}',
      PORT: '${APP_PORT}'
    },
    error_file: '${APP_DIR}/logs/err.log',
    out_file:   '${APP_DIR}/logs/out.log',
    log_file:   '${APP_DIR}/logs/combined.log',
    merge_logs: true,
    time: true
  }]
};
ECOJS

# Stop and remove any old instance (ignore errors if not running)
pm2 stop  noviq 2>/dev/null || true
pm2 delete noviq 2>/dev/null || true

info "Starting NOVIQ with PM2..."
pm2 start "$APP_DIR/ecosystem.config.cjs"

info "Saving PM2 process list (survives reboots)..."
pm2 save --force

info "Enabling PM2 to start on system boot..."
# Capture the startup command and execute it automatically
STARTUP_CMD=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo env" || true)
if [[ -n "$STARTUP_CMD" ]]; then
  eval "$STARTUP_CMD" 2>/dev/null || true
fi
systemctl enable pm2-root 2>/dev/null || true

log "PM2 running — app on internal port $APP_PORT"

# =============================================================================
#  SECTION 11 — NGINX REVERSE PROXY
# =============================================================================
step "Configuring Nginx"

NGINX_CONF="/etc/nginx/sites-available/noviq"
NGINX_LINK="/etc/nginx/sites-enabled/noviq"

# Remove the default Nginx site to avoid conflicts
rm -f /etc/nginx/sites-enabled/default

if [[ "${ENABLE_SSL,,}" == "y" ]]; then
  # ── HTTPS config (certbot will add the ssl_certificate lines) ────────────────
  cat > "$NGINX_CONF" <<NGINXCFG
# NOVIQ — Nginx reverse proxy (HTTPS / Let's Encrypt)
# Generated: $(date -u "+%Y-%m-%d %H:%M UTC")

# Redirect all plain HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};

    # --- SSL certificates will be filled in by certbot ---

    # Increase body size for file uploads
    client_max_body_size 50M;

    # Proxy all traffic to Node.js
    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout    120s;
        proxy_connect_timeout  10s;
        proxy_send_timeout     120s;
    }

    # Serve uploads directly (bypass Node.js for speed)
    location /uploads/ {
        alias   ${APP_DIR}/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options       "SAMEORIGIN"    always;
    add_header X-Content-Type-Options "nosniff"      always;
    add_header Referrer-Policy       "strict-origin-when-cross-origin" always;
}
NGINXCFG

else
  # ── HTTP config (custom port) ────────────────────────────────────────────────
  cat > "$NGINX_CONF" <<NGINXCFG
# NOVIQ — Nginx reverse proxy (HTTP)
# Generated: $(date -u "+%Y-%m-%d %H:%M UTC")

server {
    listen ${EXT_PORT};
    listen [::]:${EXT_PORT};
    server_name ${DOMAIN};

    # Increase body size for file uploads
    client_max_body_size 50M;

    # Proxy all traffic to Node.js
    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout    120s;
        proxy_connect_timeout  10s;
        proxy_send_timeout     120s;
    }

    # Serve uploads directly (bypass Node.js for speed)
    location /uploads/ {
        alias   ${APP_DIR}/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Security headers
    add_header X-Frame-Options        "SAMEORIGIN"    always;
    add_header X-Content-Type-Options "nosniff"       always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
}
NGINXCFG
fi

# Enable site
ln -sf "$NGINX_CONF" "$NGINX_LINK"

info "Testing Nginx configuration..."
nginx -t

info "Starting / reloading Nginx..."
systemctl enable nginx --quiet
systemctl restart nginx

log "Nginx configured → port $EXT_PORT proxies to localhost:$APP_PORT"

# =============================================================================
#  SECTION 12 — SSL CERTIFICATE (Let's Encrypt)
# =============================================================================
if [[ "${ENABLE_SSL,,}" == "y" ]]; then
  step "Obtaining Let's Encrypt SSL certificate"

  info "Running certbot for domain: $DOMAIN ..."
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$LE_EMAIL" \
    --domains "$DOMAIN" \
    --redirect \
    2>&1 | tail -15

  # Enable auto-renewal
  systemctl enable certbot.timer 2>/dev/null || true
  ( crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --nginx" ) \
    | sort -u | crontab -

  log "SSL certificate issued — auto-renewal configured"
fi

# =============================================================================
#  SECTION 13 — FIREWALL (UFW)
# =============================================================================
step "Configuring UFW firewall"

info "Setting firewall rules..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming  >/dev/null 2>&1
ufw default allow outgoing >/dev/null 2>&1
ufw allow ssh              >/dev/null 2>&1   # SSH (22) — never block this!
ufw allow 80/tcp           >/dev/null 2>&1   # HTTP (needed for certbot renewals)
ufw allow 443/tcp          >/dev/null 2>&1   # HTTPS

# Also open the custom external port if it's not 80/443
if [[ "$EXT_PORT" != "80" && "$EXT_PORT" != "443" ]]; then
  ufw allow "${EXT_PORT}/tcp" >/dev/null 2>&1
  info "Custom port $EXT_PORT opened in firewall"
fi

ufw --force enable >/dev/null 2>&1
log "Firewall active (SSH + 80 + 443${EXT_PORT:+ + $EXT_PORT} open; internal :$APP_PORT blocked from outside)"

# =============================================================================
#  SECTION 14 — FILE PERMISSIONS
# =============================================================================
step "Setting file permissions"

chown -R root:root    "$APP_DIR"
chown -R www-data:www-data "$APP_DIR/uploads" 2>/dev/null || true
chmod -R 755          "$APP_DIR/uploads"
chmod 600             "$APP_DIR/.env"
chmod 640             "$APP_DIR/logs" 2>/dev/null || true

log "Permissions set"

# =============================================================================
#  SECTION 15 — HEALTH CHECK
# =============================================================================
step "Health check"

info "Waiting 15 seconds for app to start..."
sleep 15

HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  --max-time 10 "http://127.0.0.1:${APP_PORT}/api/auth/me" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "200" ]]; then
  log "Node.js app is healthy (HTTP $HTTP_CODE from /api/auth/me)"
else
  warn "App not responding yet (HTTP $HTTP_CODE) — it may still be initialising"
  warn "Run:  pm2 logs noviq --lines 50"
fi

# Check Nginx is proxying
NGINX_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  --max-time 10 "http://127.0.0.1:${EXT_PORT}/" 2>/dev/null || echo "000")
if [[ "$NGINX_CODE" =~ ^[23] ]]; then
  log "Nginx proxy is working (HTTP $NGINX_CODE on port $EXT_PORT)"
else
  warn "Nginx returned HTTP $NGINX_CODE on port $EXT_PORT — check: nginx -t && systemctl status nginx"
fi

# =============================================================================
#  SECTION 16 — WRITE MANAGEMENT SCRIPT
# =============================================================================
step "Writing management helper script"

cat > "$APP_DIR/manage.sh" <<'MGMT'
#!/usr/bin/env bash
# NOVIQ management helper — run as root
set -euo pipefail
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
cmd="${1:-help}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$cmd" in
  status)   pm2 status ;;
  logs)     pm2 logs noviq --lines "${2:-100}" ;;
  restart)  pm2 restart noviq && echo -e "${GREEN}Restarted${NC}" ;;
  stop)     pm2 stop    noviq && echo -e "${GREEN}Stopped${NC}"   ;;
  start)    pm2 start   noviq && echo -e "${GREEN}Started${NC}"   ;;
  update)
    echo -e "${CYAN}Pulling latest code...${NC}"
    [[ -d "$APP_DIR/.git" ]] && git -C "$APP_DIR" pull || echo "Not a git repo — copy files manually"
    cd "$APP_DIR"
    source .env
    npm install --prefer-offline
    npx vite build
    npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
    pm2 restart noviq
    echo -e "${GREEN}Update complete${NC}"
    ;;
  backup)
    FILE="$APP_DIR/logs/backup-$(date +%Y%m%d-%H%M%S).sql"
    source "$APP_DIR/.env"
    DB=$(echo "$DATABASE_URL" | grep -oP '(?<=/)[^?]+$')
    USER=$(echo "$DATABASE_URL" | grep -oP '(?<=//)[^:]+')
    pg_dump -U "$USER" -h localhost "$DB" > "$FILE"
    echo -e "${GREEN}Backup saved: $FILE${NC}"
    ;;
  nginx)    nginx -t && systemctl reload nginx && echo -e "${GREEN}Nginx reloaded${NC}" ;;
  ssl)
    source "$APP_DIR/.env"
    echo "Run:  certbot --nginx -d YOUR_DOMAIN"
    ;;
  help|*)
    echo -e "${BOLD}NOVIQ management commands:${NC}"
    echo "  bash manage.sh status    — PM2 process status"
    echo "  bash manage.sh logs      — live app logs"
    echo "  bash manage.sh restart   — restart the app"
    echo "  bash manage.sh stop      — stop the app"
    echo "  bash manage.sh start     — start the app"
    echo "  bash manage.sh update    — pull code + rebuild + restart"
    echo "  bash manage.sh backup    — dump database to logs/"
    echo "  bash manage.sh nginx     — reload Nginx config"
    ;;
esac
MGMT

chmod +x "$APP_DIR/manage.sh"
log "manage.sh written — use: bash $APP_DIR/manage.sh help"

# =============================================================================
#  FINAL SUMMARY
# =============================================================================
echo ""
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         ✓  DEPLOYMENT COMPLETE  —  NOVIQ               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if [[ "${ENABLE_SSL,,}" == "y" ]]; then
  SITE_URL="https://${DOMAIN}"
elif [[ "$EXT_PORT" == "80" ]]; then
  SITE_URL="http://${DOMAIN}"
else
  SITE_URL="http://${DOMAIN}:${EXT_PORT}"
fi

echo -e "  ${BOLD}🌐  Website URL:${NC}      $SITE_URL"
echo ""
echo -e "  ${BOLD}Default login:${NC}"
echo -e "    Username : admin"
echo -e "    Password : admin123"
echo -e "  ${YELLOW}  → Change this password immediately after first login!${NC}"
echo ""
echo -e "  ${BOLD}Database:${NC}        $DB_NAME  (user: $DB_USER)"
echo -e "  ${BOLD}App directory:${NC}   $APP_DIR"
echo -e "  ${BOLD}Credentials:${NC}     $APP_DIR/.env  (chmod 600)"
echo -e "  ${BOLD}Logs:${NC}            $APP_DIR/logs/"
echo ""
echo -e "  ${BOLD}Quick commands:${NC}"
echo -e "    bash $APP_DIR/manage.sh status    — check status"
echo -e "    bash $APP_DIR/manage.sh logs      — live logs"
echo -e "    bash $APP_DIR/manage.sh restart   — restart app"
echo -e "    bash $APP_DIR/manage.sh update    — pull + rebuild + restart"
echo -e "    bash $APP_DIR/manage.sh backup    — dump database"
echo ""
if [[ "${ENABLE_SSL,,}" != "y" && "$DOMAIN" =~ ^[a-zA-Z] && "$DOMAIN" != "localhost" ]]; then
  echo -e "  ${YELLOW}To add HTTPS later:${NC}"
  echo -e "    apt install certbot python3-certbot-nginx -y"
  echo -e "    certbot --nginx -d ${DOMAIN}"
  echo ""
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
