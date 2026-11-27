#!/bin/sh
# Set up the Excel report on the connector Mac. Run from the checkout the connector runs from.
#   sh integrations/feishu/xlsx-report/install.sh              Python environment only
#   sh integrations/feishu/xlsx-report/install.sh --schedule   also install the launchd job
# The job wakes at :40 every hour (any timezone, any DST) and sends only the first time in a
# Beijing weekday after 16:30 (see createXlsxReporter); other wake-ups exit without work.
set -eu
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
PY=${PYTHON:-$(command -v python3.12 || command -v python3)}
VENV="$ROOT/build/feishu/xlsx-venv"
"$PY" -m venv "$VENV"
"$VENV/bin/pip" install --quiet -r "$ROOT/integrations/feishu/xlsx-report/requirements.txt"
echo "Python environment ready: $VENV"
[ "${1:-}" = "--schedule" ] || exit 0

NODE=$(command -v node)
LABEL=com.osbornalpha.feishu-xlsx-report
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$ROOT/build/reports/xlsx"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--env-file-if-exists=build/feishu/feishu-app.env</string>
    <string>integrations/feishu/generate-xlsx-report.mjs</string>
    <string>--scheduled</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Minute</key><integer>40</integer></dict>
  <key>StandardOutPath</key><string>$ROOT/build/reports/xlsx/launchd.log</string>
  <key>StandardErrorPath</key><string>$ROOT/build/reports/xlsx/launchd.log</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "launchd job installed: $PLIST"
