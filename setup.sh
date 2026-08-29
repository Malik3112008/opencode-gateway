#!/usr/bin/env bash
# Deploy per-key Tor instances for the OpenCode gateway.
# Run as root:  sudo bash setup.sh
set -euo pipefail

GW=/home/someone/Documents/malik/opencode-gateway
cd "$GW"
TS="$(date +%Y%m%d-%H%M%S)"

echo "[1/4] stopping leftover tor-key units"
for u in /etc/systemd/system/opencode-tor-key-*.service; do
    [ -e "$u" ] || continue
    base="$(basename "$u")"
    systemctl disable --now "$base" >/dev/null 2>&1 || true
    rm -f "$u"
done
systemctl daemon-reload

echo "[2/4] writing per-key systemd units (${GW}/dist/tor-manager.js)"
node -e "
const { torManager } = require('./dist/tor-manager');
const { keys } = require('./dist/keys');
keys.init();
const all = keys.getAll();
console.log('keys in pool:', all.length);
for (const k of all) {
    const { torrc } = torManager.makeTorrc(k);
    const ok = torManager.writeUnit(k, torrc);
    console.log((ok ? '  OK ' : '  FAIL ') + torManager.unitName(k));
    if (!ok) process.exit(1);
}
"
systemctl daemon-reload
echo "  enabled+started:"
for u in /etc/systemd/system/opencode-tor-key-*.service; do
    [ -e "$u" ] || continue
    base="$(basename "$u")"
    systemctl enable "$base" >/dev/null 2>&1 || true
    systemctl start "$base" || true
    echo "    $base"
done

echo "[3/4] stripping torsocks from gateway unit (per-key routing now internal)"
UNIT=/etc/systemd/system/opencode-gateway.service
if [ -e "$UNIT" ]; then cp -a "$UNIT" "$UNIT.bak-$TS"; echo "  backed up -> $UNIT.bak-$TS"; fi
sed -i 's|^ExecStart=.*|ExecStart=/usr/bin/node dist/index.js|' "$UNIT"
sed -i '/^Environment=TORSOCKS_CONF_FILE=/d' "$UNIT"
sed -i 's|^\(After=network-online.target\) tor.service|\1|; s|^\(Wants=network-online.target\) tor.service|\1|' "$UNIT"
systemctl daemon-reload

echo "[4/4] restarting gateway"
systemctl restart opencode-gateway.service

echo "done. units:"
systemctl list-units 'opencode-tor-key*' --no-legend 2>/dev/null | awk '{print "  "$1" "$4}' | sort || true
echo "gateway:"
systemctl is-active opencode-gateway.service
