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

cleanup() {
    rm -f "${COOKIE_JAR:-}"
}
trap cleanup EXIT

log() {
    printf '[run-tor] %s %s\n' "$(date '+%H:%M:%S')" "$*"
}

get_ip() {
    curl -sS --max-time 10 "$1" || true
}

read_pool() {
    local pool=()
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        if [ -n "$line" ]; then
            pool+=("$line")
        fi
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
        local tmp
        tmp="$(mktemp)"
        awk -v key="$new_key" '
            BEGIN { replaced=0 }
            {
                if (!replaced && $0 ~ /"key"[[:space:]]*:/) {
                    sub(/("key"[[:space:]]*:[[:space:]]*")[^"]+(")/, "\\1" key "\\2")
                    replaced=1
                }
                print
            }
        ' "$AUTH_FILE" > "$tmp" && mv "$tmp" "$AUTH_FILE"
    else
        printf '{\n  "opencode": {\n    "type": "api",\n    "key": "%s"\n  }\n}\n' "$new_key" > "$AUTH_FILE"
    fi

    chmod 600 "$AUTH_FILE" 2>/dev/null || true
}

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

rotate_key() {
    log "Rotasi API key..."

    if [ ! -f "$API_KEY_FILE" ]; then
        log "ERROR: File API key tidak ditemukan: $API_KEY_FILE"
        return 1
    fi

    mapfile -t pool < <(read_pool)
    if [ ${#pool[@]} -eq 0 ]; then
        log "ERROR: Tidak ada API key valid di $API_KEY_FILE"
        return 1
    fi

    local current_key
    current_key="$(read_current_auth_key)"

    local candidates=()
    if [ -n "$current_key" ]; then
        local k
        for k in "${pool[@]}"; do
            if [ "$k" != "$current_key" ]; then
                candidates+=("$k")
            fi
        done
    fi

    if [ ${#candidates[@]} -eq 0 ]; then
        candidates=("${pool[@]}")
    fi

    if [ ${#candidates[@]} -eq 0 ]; then
        log "ERROR: Tidak ada kandidat key untuk dipakai"
        return 1
    fi

    local random_index=$((RANDOM % ${#candidates[@]}))
    local new_key="${candidates[$random_index]}"
    write_auth_key "$new_key"

    log "API key diganti menjadi: ...${new_key: -8}"
    log "File key  : $API_KEY_FILE"
    log "File auth : $AUTH_FILE"
}

rotate_ip_via_gateway() {
    log "Rotasi IP Tor via gateway..."

    if ! gateway_login; then
        log "ERROR: Gagal login ke gateway $GATEWAY_URL"
        return 1
    fi

    local advance_res
    advance_res="$(gateway_request POST /api/key/advance || true)"
    log "Response advance: ${advance_res:-kosong}"

    local restart_res
    restart_res="$(gateway_request POST /api/tor/restart || true)"
    log "Response tor restart: ${restart_res:-kosong}"

    local ip=""
    local attempt=0
    local max_attempts=10
    while [ "$ip" = "" ] && [ $attempt -lt $max_attempts ]; do
        ip="$(get_ip https://api.ipify.org)"
        [ -z "$ip" ] && sleep 1
        attempt=$((attempt + 1))
    done

    log "IP sekarang: ${ip:-tidak terdeteksi}"
    [ "$ip" != "" ]
}

usage() {
    cat <<EOF
run-tor - Rotasi API key + IP Tor untuk OpenCode

Penggunaan:
  ./run-tor.sh                        Ganti key + IP lalu tetap aktif
  ./run-tor.sh rotate-key             Ganti API key saja
  ./run-tor.sh rotate-ip              Ganti IP Tor via gateway
  ./run-tor.sh rotate-all             Ganti key + IP
  ./run-tor.sh <perintah> [args...]   Ganti key + IP lalu jalankan perintah

Contoh:
  ./run-tor.sh opencode-api start
  ./run-tor.sh claude
EOF
}

case "${1:-}" in
    rotate-key)
        rotate_key
        ;;
    rotate-ip)
        rotate_ip_via_gateway
        ;;
    rotate-all)
        rotate_key
        rotate_ip_via_gateway
        ;;
    help|--help|-h|"")
        usage
        ;;
    *)
        rotate_key
        rotate_ip_via_gateway
        printf '\nMenjalankan: %s\n' "$*"
        exec "$@"
        ;;
esac
