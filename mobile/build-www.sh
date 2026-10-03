#!/usr/bin/env bash
# Builds mobile/www — the Android app's files.
# The app screens live in mobile/app/ and reuse assets/common.js + assets/shares.js for data + maths.
# The web site (repo root index.html) runs the SAME mobile/app/ screens with a desktop layer
# (mobile/app/web.css, window.WEB_SITE=true), so a feature added here reaches both.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..

rm -rf www
mkdir -p www/assets www/vendor www/app

# 1. shared data/maths from the web app (unchanged copies)
cp "$ROOT"/assets/common.js "$ROOT"/assets/shares.js www/assets/

# 2. app screens
cp app/*.js app/*.css www/app/
cp app/index.html www/index.html

# 2b. metals outlook (bundled fallback; the app also fetches the latest copy from GitHub Pages)
mkdir -p www/data
cp "$ROOT"/data/*.json www/data/

# 3. libraries bundled locally (no CDN)
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js www/vendor/supabase.js
cp node_modules/@capacitor/core/dist/capacitor.js www/vendor/capacitor.js

# 4. push alerts registration
cp app-push.js www/assets/app-push.js
sed -i 's#</body>#<script src="vendor/capacitor.js"></script>\n<script src="assets/app-push.js"></script>\n</body>#' www/index.html

test -f www/index.html
echo "www built: app UI + $(ls www/app | wc -l) app files"
