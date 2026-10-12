#!/usr/bin/env bash
# Builds kiosk/build/homehq.apk without Gradle. Needs JDK 17 + Android build-tools 34 + platform 34:
#   brew install --cask android-commandlinetools
#   sdkmanager --sdk_root=$ANDROID_HOME "build-tools;34.0.0" "platforms;android-34"
# Install on the tablet: adb install -r kiosk/build/homehq.apk
#
# The committed default is http://DASHBOARD_HOST:4173. To bake a real address
# into the APK, create gitignored local.properties next to this script:
#   dashboard.url=http://your-host:4173
# Without that file, the APK keeps the placeholder.
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
BT="$ANDROID_HOME/build-tools/34.0.0"
JAR="$ANDROID_HOME/platforms/android-34/android.jar"
KS="$HOME/.android/debug.keystore"
PLACEHOLDER="http://DASHBOARD_HOST:4173"

dashboard_url() {
  local line value=""
  if [ ! -f local.properties ]; then
    printf '%s' "$PLACEHOLDER"
    return
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|\#*) continue ;;
      dashboard.url=*)
        value="${line#dashboard.url=}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        ;;
    esac
  done < local.properties
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  if [ -z "$value" ]; then
    printf '%s' "$PLACEHOLDER"
  else
    printf '%s' "$value"
  fi
}

rm -rf build && mkdir -p build/gen build/classes build/src
cp -R src/com build/src/com
URL="$(dashboard_url)"
case "$URL" in
  *\"*|*'\\'*|*$'\n'*|*$'\r'*)
    echo "build.sh: dashboard.url must be a plain URL without quotes or backslashes" >&2
    exit 1
    ;;
esac
if [ "$URL" = "$PLACEHOLDER" ]; then
  echo "Kiosk URL is the placeholder ${PLACEHOLDER}. Set dashboard.url in kiosk/local.properties to override it."
else
  DASHBOARD_URL="$URL" perl -i -pe 's/\Qhttp:\/\/DASHBOARD_HOST:4173\E/$ENV{DASHBOARD_URL}/g' \
    build/src/com/wesbos/homehq/MainActivity.java
  grep -q -F "$URL" build/src/com/wesbos/homehq/MainActivity.java
  echo "Kiosk URL taken from local.properties"
fi

"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$JAR" --manifest AndroidManifest.xml build/res.zip \
  --java build/gen --min-sdk-version 23 --target-sdk-version 23 --version-code 1 --version-name 1.0

javac -nowarn -source 8 -target 8 -classpath "$JAR" -d build/classes \
  build/src/com/wesbos/homehq/*.java build/gen/com/wesbos/homehq/R.java 2>&1 | grep -v "^warning\|^Note\|bootstrap" || true

"$BT/d8" --min-api 23 --lib "$JAR" --output build $(find build/classes -name '*.class')
(cd build && zip -qj base.apk classes.dex)
"$BT/zipalign" -f 4 build/base.apk build/aligned.apk

if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --out build/homehq.apk build/aligned.apk
echo "Built kiosk/build/homehq.apk"
