#!/usr/bin/env bash
# Builds mobile/www from the web app in the repo root.
# The web files are never modified — everything happens on copies in www/.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=..

rm -rf www
mkdir -p www/assets www/vendor

# 1. copy the web app (pages + shared assets only — no SQL, PDFs or patches)
cp "$ROOT"/*.html www/
cp "$ROOT"/assets/*.js "$ROOT"/assets/*.css www/assets/

# 2. bundle supabase-js locally instead of loading it from the CDN
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js www/vendor/supabase.js
sed -i 's#https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2#vendor/supabase.js#g' www/*.html

# 3. add the app-only stylesheet (safe areas, touch sizes) to every page
cp mobile-app.css www/assets/mobile-app.css
sed -i 's#</head>#<link rel="stylesheet" href="assets/mobile-app.css">\n</head>#' www/*.html

# 4. the app should open on the sign-in page
test -f www/index.html

echo "www built: $(ls www/*.html | wc -l) pages"
