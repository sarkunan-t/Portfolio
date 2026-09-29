#!/usr/bin/env bash
# Full Android build, run by .github/workflows/android.yml on GitHub.
# Kept here (not in the workflow) so changes don't need the workflow file edited.
# Env from the workflow: RUN_NUMBER, GOOGLE_SERVICES_JSON, KS_B64, KS_PASS, KEY_ALIAS
set -euo pipefail
cd "$(dirname "$0")"
V="1.0.${RUN_NUMBER}"

npm ci --no-audit --no-fund
bash build-www.sh
npx cap add android
npx @capacitor/assets generate --android --assetPath resources

M=android/app/src/main/AndroidManifest.xml
# no cloud backups of app data (login session)
sed -i 's/android:allowBackup="true"/android:allowBackup="false"/' $M
grep -q 'allowBackup="false"' $M
# Android 13+ notification permission (price alerts)
sed -i 's#<uses-permission android:name="android.permission.INTERNET" />#&\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />#' $M
grep -q POST_NOTIFICATIONS $M

# every build installs over the previous one
sed -i "s/versionCode 1$/versionCode ${RUN_NUMBER}/" android/app/build.gradle
sed -i "s/versionName \"1.0\"/versionName \"${V}\"/" android/app/build.gradle

# Firebase config for push notifications
if [ -n "${GOOGLE_SERVICES_JSON:-}" ]; then
  printf '%s' "$GOOGLE_SERVICES_JSON" > android/app/google-services.json
  grep -q '"com.sarkunan.marketssuite"' android/app/google-services.json || { echo "google-services.json is not for com.sarkunan.marketssuite"; exit 1; }
else
  echo "::warning::GOOGLE_SERVICES_JSON secret not set — app builds without push alerts"
fi

npx cap sync android
(cd android && ./gradlew assembleRelease --no-daemon)

# sign
KS="$RUNNER_TEMP/release.jks"
echo "$KS_B64" | base64 -d > "$KS"
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
"$BT/zipalign" -f -p 4 android/app/build/outputs/apk/release/app-release-unsigned.apk "$RUNNER_TEMP/aligned.apk"
mkdir -p out
"$BT/apksigner" sign --ks "$KS" --ks-pass env:KS_PASS --ks-key-alias "$KEY_ALIAS" --key-pass env:KS_PASS \
  --out "out/UnicornHunter-${V}.apk" "$RUNNER_TEMP/aligned.apk"
"$BT/apksigner" verify "out/UnicornHunter-${V}.apk"
rm -f "$KS"
echo "Built out/UnicornHunter-${V}.apk"
