#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
API_KEY_FILE="/home/someone/Documents/malik/API-KEY"
AUTH_FILE="/home/someone/.local/share/opencode/auth.json"
GATEWAY_URL="http://127.0.0.1:4143"
ADMIN_USER="admin"
ADMIN_PASS="admin-123"
SESSION_COOKIE="gw_session"
COOKIE_JAR="$(mktemp)"
TOR_SERVICE="tor"
TOR_RESTART_CMD="systemctl restart ${TOR_SERVICE}"
IP_CHECK_URLS=("https://api.ipify.org" "https://ifconfig.me" "https://icanhazip.com")
MAX_IP_ATTEMPTS=15

cleanup() {
    rm -f "${COOKIE_JAR:-}"
}
trap cleanup EXIT

log() {
    printf '[restart-tor] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
    log "ERROR: $*"
    exit 1
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Perintah tidak ditemukan: $1"
}

# ---------- IP ----------
looks_like_ip() {
    local value="$1"
    [[ "$value" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

get_ip() {
    local url=""
    local value=""
    local attempt=0
    local max_attempts=${#IP_CHECK_URLS[@]}
    while [ $attempt -lt $max_attempts ]; do
        url="${IP_CHECK_URLS[$attempt]}"
        value="$(curl -sS --max-time 12 -x socks5h://127.0.0.1:9050 "$url" 2>/dev/null || true)"
        if [ -n "$value" ] && looks_like_ip "$value"; then
            printf '%s' "$value"
            return 0
        fi
        attempt=$((attempt + 1))
    done
    return 1
}

# ---------- API key ----------
read_pool() {
    local pool=()
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [ -n "$line" ] && pool+=("$line")
    done < "$API_KEY_FILE"
    printf '%s\n' "${pool[@]+"${pool[@]}"}"
}

read_current_auth_key() {
    local key=""
    if [ -f "$AUTH_FILE" ]; then
        key="$(grep -oP '(?<="key"[[:space:]]*:[[:space:]]*")[^"]+' "$AUTH_FILE" 2>/dev/null || true)"
    fi
    printf '%s' "$key"
}

write_auth_key() {
    local new_key="$1"
    if [ ! -d "$(dirname "$AUTH_FILE")" ]; then
        mkdir -p "$(dirname "$AUTH_FILE")"
    fi

    if [ -f "$AUTH_FILE" ]; then
        python3 - <<'PY' "$AUTH_FILE" "$new_key"
import json, sys
path, new_key = sys.argv[1], sys.argv[2]
with open(path) as f:
    cfg = json.load(f)
cfg.setdefault("opencode", {})["key"] = new_key
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
PY
    else
        printf '{\n  "opencode": {\n    "type": "api",\n    "key": "%s"\n  }\n}\n' "$new_key" > "$AUTH_FILE"
    fi

    chmod 600 "$AUTH_FILE" 2>/dev/null || true
}

pick_new_key() {
    mapfile -t pool < <(read_pool)
    [ "${#pool[@]}" -gt 0 ] || die "Tidak ada API key di ${API_KEY_FILE}"

    local current_key
    current_key="$(read_current_auth_key)"

    local candidates=()
    local k
    for k in "${pool[@]}"; do
        [ -n "$current_key" ] && [ "$k" = "$current_key" ] && continue
        candidates+=("$k")
    done
    [ "${#candidates[@]}" -gt 0 ] || candidates=("${pool[@]}")

    local idx=$((RANDOM % ${#candidates[@]}))
    printf '%s' "${candidates[$idx]}"
}

rotate_key() {
    log "Mengganti API key..."
    local new_key
    new_key="$(pick_new_key)"
    write_auth_key "$new_key"
    log "API key diganti menjadi: ...${new_key: -8}"
    printf '%s' "$new_key"
}

# ---------- Gateway ----------
gateway_login() {
    curl -sS --cookie-jar "$COOKIE_JAR" \
         -H 'Content-Type: application/x-www-form-urlencoded' \
         --data "username=${ADMIN_USER}&password=${ADMIN_PASS}" \
         "${GATEWAY_URL}/login" >/dev/null
}

gateway_request() {
    local method="$1"
    local path="$2"
    curl -sS --cookie "$COOKIE_JAR" \
         -X "$method" \
         -H 'Content-Type: application/json' \
         "${GATEWAY_URL}${path}"
}

gateway_advance_key() {
    gateway_login >/dev/null 2>&1 || true
    gateway_request POST /api/key/advance >/dev/null 2>&1 || true
}

gateway_restart_tor() {
    gateway_login >/dev/null 2>&1 || true
    gateway_request POST /api/tor/restart >/dev/null 2>&1 || true
}

# ---------- Tor ----------
restart_tor_service() {
    log "Merestart layanan Tor..."
    if command -v systemctl >/dev/null 2>&1; then
        if systemctl is-active --quiet "$TOR_SERVICE"; then
            $TOR_RESTART_CMD
        else
            systemctl start "$TOR_SERVICE"
        fi
    else
        # fallback manual
        pkill -x tor >/dev/null 2>&1 || true
        (tor --runasdaemon 1 >/tmp/tor.out 2>&1 &) || true
    fi
}

wait_tor_ready() {
    log "Menunggu SOCKS Tor siap di 127.0.0.1:9050..."
    local attempt=0
    while [ $attempt -lt 60 ]; do
        if curl -sS --max-time 3 -x socks5h://127.0.0.1:9050 "https://api.ipify.org" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    return 1
}

new_identity() {
    local script="$PROJECT_DIR/bin/tor.newnym.sh"
    if [ ! -x "$script" ]; then
        chmod +x "$script" >/dev/null 2>&1 || true
    fi
    if [ -x "$script" ]; then
        "$script" >/dev/null 2>&1 || true
    fi
    sleep 5
}

refresh_ip() {
    log "Memperbarui identitas Tor..."
    new_identity
    log "Memverifikasi IP baru..."
    local ip=""
    local attempt=0
    while [ $attempt -lt $MAX_IP_ATTEMPTS ]; do
        ip="$(get_ip)"
        if [ -n "$ip" ]; then
            log "IP Tor saat ini: ${ip}"
            printf '%s' "$ip"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    log "Peringatan: IP Tor tidak terdeteksi setelah ${MAX_IP_ATTEMPTS} percobaan"
    return 1
}

# ---------- Usage ----------
usage() {
    cat <<EOF
restart-tor - Restart Tor + ganti API key OpenCode

Penggunaan:
  $(basename "$0")                        Restart Tor + ganti key + verifikasi IP
  $(basename "$0") --key-only             Ganti API key saja, tanpa restart Tor
  $(basename "$0") --ip-only              Restart Tor / NEWNYM + cek IP, tanpa ganti key
  $(basename "$0") --gateway              Restart Tor via gateway + ganti key
  $(basename "$0") status                 Tampilkan IP saat ini dan key yang dipakai
  $(basename "$0") help                   Bantuan ini

Contoh:
  $(basename "$0")
  $(basename "$0") --key-only && opencode
  $(basename "$0") status
EOF
}

# ---------- Status ----------
status() {
    local ip=""
    if ip="$(get_ip)"; then
        log "IP via Tor : ${ip}"
    else
        log "IP via Tor : tidak terdeteksi"
    fi
    local key=""
    key="$(read_current_auth_key)"
    log "Key aktif  : ...${key: -8}"
    if [ -n "$key" ]; then
        log "File key   : ${API_KEY_FILE}"
        log "File auth  : ${AUTH_FILE}"
    fi
}

# ---------- Main ----------
case "${1:-}" in
    help|--help|-h)
        usage
        ;;
    status)
        status
        ;;
    --key-only)
        require_cmd curl
        rotate_key
        ;;
    --ip-only)
        require_cmd curl
        restart_tor_service
        wait_tor_ready || true
        refresh_ip || true
        ;;
    --gateway)
        require_cmd curl
        gateway_restart_tor
        gateway_advance_key
        rotate_key
        ;;
    *)
        require_cmd curl
        restart_tor_service
        wait_tor_ready || die "Tor tidak siap setelah restart"
        refresh_ip || true
        rotate_key
        log "Selesai. OpenCode sekarang menggunakan IP + API key baru."
        ;;
esac
