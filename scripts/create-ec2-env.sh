#!/usr/bin/env bash
set -euo pipefail

cd /opt/cdss_system

{
  grep '^VITE_' .env.frontend 2>/dev/null || true
  printf 'FRONTEND_PORT=80\n'
  printf 'DATABASE_TYPE=postgres\n'
  printf 'DATABASE_HOST=postgres\n'
  printf 'DATABASE_PORT=5432\n'
  printf 'DATABASE_USER=medcity\n'
  printf 'DATABASE_PASSWORD=medcity\n'
  printf 'DATABASE_NAME=medcity_connect\n'
  printf 'DATABASE_SYNC=true\n'
  printf 'DATABASE_SSL=false\n'
  printf 'DATABASE_SSL_REJECT_UNAUTHORIZED=false\n'
  printf 'JWT_SECRET=%s\n' "$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  printf 'JWT_REFRESH_SECRET=%s\n' "$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
} > .env

chmod 600 .env
rm -f .env.frontend
echo "env-ready"
