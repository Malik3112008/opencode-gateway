#!/usr/bin/env bash
set -euo pipefail

OPENCODE_BIN="/home/someone/.opencode/bin/opencode"
AUTH_FILE="/home/someone/.local/share/opencode/auth.json"

# Pastikan config torsocks khusus untuk proxy listen ada
TORSOCKS_CONF="/etc/tor/torsocks-opencode.conf"
if [ ! -f "$TORSOCKS_CONF" ]; then
    cat > /tmp/torsocks-opencode.conf <<'EOF'
TorAddress 127.0.0.1
TorPort 9050
OnionAddrRange 127.42.42.0/24
AllowInbound 1
IsolatePID 1
EOF
    TORSOCKS_CONF="/tmp/torsocks-opencode.conf"
fi

export OPENCODE_API_KEY
OPENCODE_API_KEY="$(python3 - <<'PY'
import json
p="/home/someone/.local/share/opencode/auth.json"
try:
    with open(p) as f:
        print(json.load(f)["opencode"]["key"])
except Exception:
    print("")
PY
)"

export TORSOCKS_CONF_FILE="$TORSOCKS_CONF"
exec torsocks "$OPENCODE_BIN" "$@"
