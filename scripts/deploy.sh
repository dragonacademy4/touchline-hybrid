#!/usr/bin/env bash
# Builds and deploys Touchline to Cloudflare Workers static assets.
# Reads the public reCAPTCHA Enterprise site key and the Cloudflare token from
# ~/.config/dylan-projects (never committed, never printed).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
. ~/.config/dylan-projects/touchline/appcheck.env
. ~/.config/dylan-projects/mkt/cloudflare.env
set +a
export VITE_RECAPTCHA_ENTERPRISE_SITE_KEY="$RECAPTCHA_ENTERPRISE_SITE_KEY"
APPCHECK_DEBUG_TOKEN_CHECK="${APPCHECK_DEBUG_TOKEN:-}"; unset APPCHECK_DEBUG_TOKEN VITE_APPCHECK_DEBUG_TOKEN
npm run build
if [ -n "$APPCHECK_DEBUG_TOKEN_CHECK" ] && grep -rqF "$APPCHECK_DEBUG_TOKEN_CHECK" dist; then echo "debug token found in build"; exit 1; fi
npx wrangler deploy
