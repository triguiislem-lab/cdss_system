#!/usr/bin/env bash
set -euo pipefail

cd /opt/cdss_system

if [[ ! -f .env ]]; then
  echo "Refusing to create .env: provision the Supabase/PostgreSQL connection and secrets first." >&2
  exit 1
fi

required_keys=(DATABASE_TYPE DATABASE_HOST DATABASE_PORT DATABASE_NAME JWT_SECRET JWT_REFRESH_SECRET)
for key in "${required_keys[@]}"; do
  if ! grep -q "^${key}=" .env; then
    echo "Missing ${key} in .env; refusing to overwrite the deployment configuration." >&2
    exit 1
  fi
done

if grep -q '^DATABASE_HOST=postgres$' .env; then
  echo "DATABASE_HOST=postgres points to the local Compose database; use the Supabase host for EC2." >&2
  exit 1
fi

set_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s\n' "${key}=${value}" >> .env
  fi
}

set_env FRONTEND_PORT 80
set_env DATABASE_SYNC false
set_env DATABASE_SSL true
set_env DATABASE_SSL_REJECT_UNAUTHORIZED false
set_env MEDICINE_CATALOG_SOURCE firebase
set_env FIREBASE_PROJECT_ID test-5d752
set_env FIREBASE_API_KEY AIzaSyC-VQrD3RPiZyqCLqweGk86ptPAGWzB-qU
set_env FIREBASE_APP_ID 1:1049284848818:web:2818c155ad602bf1882dab
set_env FIREBASE_DATACONNECT_LOCATION us-east4
set_env FIREBASE_DATACONNECT_SERVICE test-5d752-service
set_env FIREBASE_DATACONNECT_CONNECTOR tn-med-connector
set_env FIREBASE_MEDICINES_FETCH_LIMIT 6093
set_env FIREBASE_MEDICINES_CACHE_TTL_MS 300000
set_env FIREBASE_DATACONNECT_TIMEOUT_MS 15000
set_env FIREBASE_MEDICINES_DATABASE_FALLBACK false
set_env KAGGLE_ENABLE_GPU true

chmod 600 .env
echo "env-ready"
