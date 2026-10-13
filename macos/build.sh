#!/bin/sh
# Builds Traductio.app and a zip for GitHub releases into macos/build/.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
BUILD="$HERE/build"
APP="$BUILD/Traductio.app"

rm -rf "$BUILD"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swift build --package-path "$HERE" -c release --arch arm64
cp "$HERE/.build/arm64-apple-macosx/release/Traductio" "$APP/Contents/MacOS/Traductio"

ICONSET="$BUILD/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ROOT/assets/icon-macos.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$ROOT/assets/icon-macos.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Traductio</string>
  <key>CFBundleDisplayName</key><string>Traductio</string>
  <key>CFBundleIdentifier</key><string>io.github.brian-rey-development.traductio</string>
  <key>CFBundleExecutable</key><string>Traductio</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeName</key><string>EPUB book</string>
      <key>CFBundleTypeRole</key><string>Viewer</string>
      <key>LSHandlerRank</key><string>Alternate</string>
      <key>LSItemContentTypes</key><array><string>org.idpf.epub-container</string></array>
    </dict>
  </array>
</dict>
</plist>
PLIST

# Ad-hoc signing is what Apple Silicon requires to launch at all. It is not notarization,
# so a downloaded copy still needs one "Open Anyway" in System Settings the first time.
codesign --force --deep --sign - "$APP"

(cd "$BUILD" && ditto -c -k --keepParent Traductio.app "Traductio-$VERSION-macOS.zip")
echo "Built $APP and $BUILD/Traductio-$VERSION-macOS.zip"
