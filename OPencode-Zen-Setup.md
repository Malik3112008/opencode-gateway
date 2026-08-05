# OpenCode Zen + DeepSeek V4 Flash Free — Setup Guide

> Dokumentasi lengkap setup bypass limit, Tor routing, dan CLI tools.
> Dibuat: 2026-07-28 · Diperbarui: 2026-08-02 (Smart Gateway deployed di Fedora)

---

## Daftar Isi

1. [Masalah](#1-masalah)
2. [Arsitektur Solusi](#2-arsitektur-solusi)
3. [Smart Gateway (baru)](#25-smart-gateway-arsitektur-baru)
4. [Setup Static IP](#3-setup-static-ip)
5. [Install & Konfigurasi Tor](#4-install--konfigurasi-tor)
6. [Wrapper opencode via Gateway](#5-wrapper-opencode-via-gateway)
7. [Alias & Functions (bash_aliases)](#6-alias--functions-bash_aliases)
8. [Rotasi API Key Otomatis](#7-rotasi-api-key-otomatis)
9. [claude-go via Gateway](#8-claude-go-via-gateway)
10. [Cara Pakai](#9-cara-pakai)
11. [Troubleshooting](#10-troubleshooting)
12. [Referensi File](#11-referensi-file)

---

## 1. Masalah

- **FreeUsageLimitError** — OpenCode Zen limit per **IP address**, bukan per API key.
- Ganti key tidak membantu karena semua key dari IP yang sama share satu quota pool.
- ISP menggunakan **CGNAT** (Carrier-Grade NAT) — IP publik tidak bisa diubah manual.
- Limit hanya reset setelah beberapa jam/hari.

### Root Cause

```
Request → IP Publik → OpenCode Zen → Hit limit
         ↳ Key A, Key B, Key C semua kena karena IP sama
```

## 2. Arsitektur Solusi

```
Terminal: opencode "prompt"
              │
              ▼
~/.local/bin/opencode (wrapper)
              │
              ▼
    torsocks → Tor → IP baru (random exit node)
              │
              ▼
    OpenCode Zen API → request diterima, limit tidak kena
```

Setiap kali ganti API key:
- Tor direstart → dapat **IP exit node baru**
- API key baru dipasang
- OpenCode Zen lihat IP baru + key baru = **bebas limit**

Untuk `claude-go`, arsitekturnya sedikit berbeda karena request ke Zen
berasal dari proses proxy, bukan dari claude:

```
claude-go → claude --settings settings.opencode.json
              │
              ▼
  localhost:4142 (opencode-api-tor, systemd service)
              │
              ▼
    torsocks → Tor → IP baru
              │
              ▼
    OpenCode Zen API
```

> **ARSTITEKTUR LAMA** (masih ada untuk rollback, tapi **tidak dipakai**
> tool utama lagi). Sejak **2026-08-02** digantikan Smart Gateway — lihat
> bagian **2.5**.

## 2.5 Smart Gateway (Arsitektur Baru)

Kedua tool (`opencode` dan `claude-go`) sekarang lewat **satu gateway**
yang mengelola **key pool, auto-failover saat limit, tracking usage, dan
restart Tor otomatis** — tanpa perlu rotasi manual lagi.

```
 opencode ─┐                 ┌─> Tor (SOCKS 9050) ──┐
           │   localhost     │                       ▼
 claude-go ┼────────────► :4143 Smart Gateway ──► OpenCode Zen
           │   (no Tor)      │  (torsocks, root)     ▲
 browser ──┘                 └── auto-failover: ganti key + restart Tor ┘
  (dashboard)
```

**Fitur:**
- **Key pool** (16 key) dibaca dari `~/Documents/malik/API-KEY`.
- Saat key kena limit (HTTP 429 / `FreeUsageLimitError`) → key ditandai
  **cooldown** (dengan `retry-after`), pilih key sehat berikutnya, tulis ke
  `auth.json`, **restart Tor** (IP baru), lalu **retry request** (3x).
- Key cooldown di-**probe** berkala (tiap 5 menit) sampai pulih lalu dipakai lagi.
- **Hanya model free** — daftar `allowedModels` di `gateway.config.json`
  membatasi model yang boleh dipakai (model berbayar ditolak HTTP 400).
  Model free Zen saat ini: `big-pickle`, `deepseek-v4-flash-free`,
  `laguna-s-2.1-free`, `ling-3.0-flash-free`, `mimo-v2.5-free`,
  `nemotron-3-ultra-free`, `north-mini-code-free`.
- **Usage tracking** per key + per model (requests & token) di SQLite-style
  JSON `usage.json` + riwayat per-request di `history.jsonl` (10.000 terakhir),
  ditampilkan di **dashboard** `http://localhost:4143/dashboard`.
- **Dashboard rinci** (auto-refresh): stat cards (request/token/failover/cooldown),
  chart SVG (token & request per jam 24j, donut share per model & per key),
  tabel keys (status, cooldown selesai, rata-rata token/req, estimasi %),
  tabel per-model, activity feed 50 request terakhir, events terfilter,
  Tor exit IP terkini, alert (key cooldown / semua cooldown), search,
  interval refresh (5s/15s/30s/pause), tema dark/light.
- **Endpoint `GET /stats`** (JSON lengkap untuk dashboard) & `GET /usage` (kompatibel).
- Endpoint OpenAI-compatible: `/v1/chat/completions`, `/v1/messages`,
  `/v1/embeddings`, `/v1/models`, `/health`, `/usage`, `/dashboard`.

**Komponen:**

| Komponen | Lokasi | Fungsi |
|---|---|---|
| Gateway (fork opencode-api) | `~/Documents/malik/opencode-gateway/` | proxy + failover + usage |
| Service systemd (root, via Tor) | `/etc/systemd/system/opencode-gateway.service` | port 4143, `torsocks` |
| Config gateway | `.../opencode-gateway/gateway.config.json` | keyFile, authFile, retries, dailyAllowance, dll |
| Modul | `dist/{keys,tor,usage,events,dashboard,gateway-config}.js` | key pool, tor, usage, events, dashboard |
| Data | `usage.json` + `events.jsonl` (di folder gateway) | tracking + riwayat failover |
| Override provider | `~/.config/opencode/opencode.json` | `opencode.baseURL → localhost:4143/v1` |

**Alur failover (contoh nyata 2026-08-02):** key `...p2PRwi` kena limit →
cooldown (~16 jam) → failover ke `...vidy2V` → request sukses → Tor
direstart otomatis (terbukti dari timestamp restart tor).

## 3. Setup Static IP

Sistem ini (Fedora Workstation 44, user `someone`) **sudah static**:
koneksi WiFi `AL AMRI`, interface `wlp1s0`, IP `192.168.1.127/24`,
gateway `192.168.1.9`, DNS `192.168.1.9`. Verifikasi:

```bash
nmcli con show "AL AMRI" | grep ipv4.method
# → ipv4.method: manual
ip addr show wlp1s0 | grep inet
# → inet 192.168.1.127/24 ...
```

> **Catatan:** IP lokal tetap di-NAT router ke IP publik ISP (CGNAT).
> Static IP lokal **tidak** mengubah IP publik — yang mengubah IP publik
> adalah Tor.

### Kalau ingin mengubah ke static (referensi)

```bash
nmcli con mod "AL AMRI" ipv4.method manual \
  ipv4.addresses 192.168.1.127/24 \
  ipv4.gateway 192.168.1.9 \
  ipv4.dns "1.1.1.1 8.8.8.8"

nmcli con down "AL AMRI" && nmcli con up "AL AMRI"
```

> Hati-hati: memakai gateway/DNS yang salah bisa memutus koneksi.

## 4. Install & Konfigurasi Tor

> **Fedora** memakai `dnf`, bukan `apt-get`.

Tor menyediakan SOCKS5 proxy di `127.0.0.1:9050`. Setiap restart Tor → IP exit node baru.

**Install:**
```bash
sudo dnf install -y tor torsocks
```

**Service otomatis start:**
```bash
sudo systemctl enable --now tor
```

**Cek status:**
```bash
systemctl is-active tor
# → active
```

**Cek IP via Tor:**
```bash
curl -s --socks5-hostname 127.0.0.1:9050 https://api.ipify.org
# → 185.244.192.175 (contoh IP Tor, berganti tiap restart)
```

**Restart Tor dapat IP baru:**
```bash
sudo systemctl restart tor
```

### Config torsocks untuk proxy

Untuk proxy yang menunggu koneksi (listen), torsocks default memblokir
`listen()` ke alamat non-localhost. Karena itu dibuat config khusus di
`/etc/tor/torsocks-opencode.conf`:

```
TorAddress 127.0.0.1
TorPort 9050
OnionAddrRange 127.42.42.0/24
AllowInbound 1
IsolatePID 1
```

Dipakai lewat env `TORSOCKS_CONF_FILE` di service proxy (lihat bagian 8).

## 5. Wrapper opencode via Gateway

Agar `opencode` otomatis lewat gateway. Sejak Smart Gateway aktif, **wrapper
tidak perlu torsocks lagi** (Tor ditangani gateway di port 4143). Wrapper
cukup menjalankan binary asli:

**Wrapper:** `~/.local/bin/opencode`

```bash
#!/bin/bash
# opencode via Smart Gateway (localhost:4143) — Tor di gateway
exec /home/someone/.opencode/bin/opencode "$@"
```

**Override provider** di `~/.config/opencode/opencode.json` mengarahkan
semua request model ke gateway (ID model tetap `opencode/*`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "opencode": {
      "options": { "baseURL": "http://localhost:4143/v1" }
    }
  }
}
```

Verifikasi: `opencode debug config` → `provider.opencode.options.baseURL`.

**Buat executable:**
```bash
chmod +x ~/.local/bin/opencode
```

**Prioritas PATH** (di `.bashrc`):

```bash
# opencode (wrapper di ~/.local/bin didahulukan, binary asli fallback)
export PATH=$HOME/.local/bin:/home/someone/.opencode/bin:$PATH
```

Karena `~/.local/bin` ditulis **sebelum** `~/.opencode/bin`, wrapper menang
(`which opencode` → `~/.local/bin/opencode`).

## 6. Alias & Functions (`bash_aliases`)

File: `~/.bash_aliases` (otomatis di-load dari `.bashrc`).

```bash
# opencode alias — shortcut prompt
alias oc='opencode run -m opencode/deepseek-v4-flash-free'

# rotasi api key otomatis dari file API-KEY + restart Tor + IP baru
opencode-auth-login() {
  KEY_FILE="$HOME/Documents/malik/API-KEY"
  AUTH_FILE="$HOME/.local/share/opencode/auth.json"

  if [ -n "$1" ]; then
    KEY="$1"
  else
    KEY=$(KEY_FILE="$KEY_FILE" AUTH_FILE="$AUTH_FILE" python3 -c "
import json, os
keys = [k.strip() for k in open(os.environ['KEY_FILE']) if k.strip().startswith('sk-')]
cur = json.load(open(os.environ['AUTH_FILE']))['opencode']['key']
i = keys.index(cur) if cur in keys else -1
print(keys[i + 1] if i + 1 < len(keys) else keys[0])
")
    if [ -z "$KEY" ]; then
      echo "Error: tidak ada key di $KEY_FILE"
      return 1
    fi
  fi

  KEY="$KEY" AUTH_FILE="$AUTH_FILE" python3 -c "
import json, os
with open(os.environ['AUTH_FILE']) as f:
    cfg = json.load(f)
cfg['opencode']['key'] = os.environ['KEY']
with open(os.environ['AUTH_FILE'], 'w') as f:
    json.dump(cfg, f, indent=2)
print('Key updated')
"
  echo "woya" | sudo -S systemctl restart tor 2>/dev/null
  sleep 2
  IP=$(curl -s --connect-timeout 10 --socks5-hostname 127.0.0.1:9050 https://api.ipify.org)
  echo "Key:   ${KEY:0:15}...${KEY: -10}"
  echo "Tor IP: $IP"
}

# lihat api key saat ini
opencode-whoami() {
  python3 -c "
import json
with open('/home/someone/.local/share/opencode/auth.json') as f:
    cfg = json.load(f)
key = cfg['opencode']['key']
print('Provider: OpenCode Zen')
print('Key:      ' + key[:15] + '...' + key[-10:])
print('Models:   opencode/deepseek-v4-flash-free')
"
  echo "woya" | sudo -S systemctl restart tor 2>/dev/null
  sleep 2
  IP=$(curl -s --connect-timeout 10 --socks5-hostname 127.0.0.1:9050 https://api.ipify.org)
  echo "Tor IP:   $IP"
}
```

> **Catatan keamanan:** password sudo (`woya`) tersimpan plaintext di file ini
> untuk restart Tor otomatis. Ganti jika password berubah, atau ganti dengan
> aturan sudoers NOPASSWD khusus `systemctl restart tor`.

## 7. Rotasi API Key Otomatis

File `~/Documents/malik/API-KEY` berisi daftar key OpenCode Zen, satu per baris:

```
API KEY OPENCODE ZEN

sk-YmOLXp7IXYE3pKL1pvSkKAwDQnfxZEQzBwfWO3181QTkeryr9m0cykECJz2ikrNG
sk-96DzRhfqEGr4nJKJRfSPcqsJ6YaaYMKb0esqcZiwT2GYdQhY1BrQ8qcFcGsVmNla
sk-ybFOyObn3Qm6eAwCUMdisisK9ea0yDH7ay61wa0j8XoP0czGwX0VpHetmhB0Ow3Z
...
```

Logika `opencode-auth-login` (tanpa argumen):
1. Baca semua key (`sk-...`) dari `API-KEY`.
2. Temukan posisi key yang sedang aktif di `auth.json`.
3. Ganti ke **key berikutnya** (wrap ke awal jika di akhir).
4. Restart Tor → IP exit node baru.
5. Tampilkan key baru + IP baru.

`auth.json` menjadi **single source of truth** — dipakai bersama oleh
`opencode` (via wrapper) dan `claude-go` (via wrapper).

## 8. claude-go via Gateway

Request asli ke Zen berasal dari proxy gateway (node), **bukan** dari
claude. Jadi Tor diterapkan ke gateway, bukan ke claude.

### Gateway (baru): `opencode-gateway.service`

Service systemd (root) di `/etc/systemd/system/opencode-gateway.service`,
menjalankan Smart Gateway di port **4143** di bawah `torsocks` (lihat bagian
2.5). Inilah pengganti `opencode-api-tor.service` (4142) — yang lama
dibiarkan untuk rollback.

**Aktifkan:**
```bash
sudo systemctl enable --now opencode-gateway
curl http://localhost:4143/health
# → {"status":"ok","opencode_go_url":"https://opencode.ai/zen/v1","pool_size":16, ...}
```

### Proxy Tor (legacy): `opencode-api-tor.service`

Service systemd (root) di `/etc/systemd/system/opencode-api-tor.service`,
menjalankan `opencode-api` yang sama di port **4142** di bawah `torsocks`:

```
[Unit]
Description=opencode-api proxy via Tor (Anthropic <-> OpenCode Go) for claude-go
After=network-online.target tor.service
Wants=network-online.target tor.service

[Service]
Type=simple
Environment=TORSOCKS_CONF_FILE=/etc/tor/torsocks-opencode.conf
Environment=OPENCODE_GO_BASE_URL=https://opencode.ai/zen/v1
Environment=OPENCODE_MODEL=deepseek-v4-flash-free
Environment=PROXY_PORT=4142
ExecStart=/usr/bin/torsocks /home/someone/.npm-global/bin/opencode-api start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

> Tanpa `OPENCODE_GO_API_KEY` — key diambil dari header request claude
> (yang diisi wrapper). Jadi proxy selalu memakai key terbaru hasil rotasi.

**Aktifkan (legacy):**
```bash
sudo systemctl enable --now opencode-api-tor
curl http://localhost:4142/health
# → {"status":"ok","opencode_go_url":"https://opencode.ai/zen/v1", ...}
```

### Wrapper `~/.local/bin/claude-go`

Karena **settings file menang atas env shell** (terbukti: `ANTHROPIC_BASE_URL`
dan `ANTHROPIC_AUTH_TOKEN` dari env shell diabaikan oleh claude), wrapper
menulis langsung ke `settings.opencode.json` setiap launch:

```bash
#!/usr/bin/env bash
# claude-go: OpenCode Zen via Smart Gateway (localhost:4143)
# settings.opencode.json di-sync key terbaru dari auth.json tiap launch
SETTINGS="$HOME/.claude/settings.opencode.json"

KEY=$(python3 -c "
import json, os
try:
    with open(os.path.expanduser('~/.local/share/opencode/auth.json')) as f:
        print(json.load(f)['opencode']['key'])
except Exception:
    print('')
" 2>/dev/null)

SETTINGS="$SETTINGS" KEY="$KEY" python3 -c "
import json, os
p = os.environ['SETTINGS']
with open(p) as f:
    cfg = json.load(f)
env = cfg.setdefault('env', {})
if os.environ['KEY']:
    env['ANTHROPIC_AUTH_TOKEN'] = os.environ['KEY']
env['ANTHROPIC_BASE_URL'] = 'http://localhost:4143'
with open(p, 'w') as f:
    json.dump(cfg, f, indent=2)
"

exec claude --settings "$SETTINGS" "$@"
```

Efeknya `settings.opencode.json` selalu berisi:
- `ANTHROPIC_AUTH_TOKEN` = key terbaru dari `auth.json`
- `ANTHROPIC_BASE_URL` = `http://localhost:4143` (Smart Gateway)
- model `deepseek-v4-flash-free` dkk. tetap dari settings file.

### Konfigurasi lain TIDAK berubah

- `~/.claude/settings.json` → default (router `ailj.id:20129`)
- `~/.claude/settings.ailj.json` → claude-ailj (router `ailj.id:20129`)
- `opencode-api.service` (port 4141) → proxy lama non-Tor, dibiarkan.

## 9. Cara Pakai

### Menjalankan opencode via gateway

```bash
# Langsung prompt
oc "halo, siapa kamu?"

# atau
opencode run -m opencode/deepseek-v4-flash-free "tulis kode python fibonacci"
```

### Rotasi API key

**Otomatis oleh gateway** — saat key kena limit, gateway ganti key + restart
Tor + retry sendiri. Tidak perlu aksi manual.

`opencode-auth-login` (fungsi lama, rotasi manual) masih ada untuk referensi /
jika mau paksa ganti key & IP secara manual:

```bash
opencode-auth-login
```

Proses:
1. Baca key berikutnya dari `~/Documents/malik/API-KEY`
2. Update `auth.json`
3. Restart Tor → IP exit node baru
4. Tampilkan key baru + IP baru

### Dashboard usage & status key

> **Akses & keamanan**: Gateway bind `0.0.0.0`, jadi bisa dibuka dari device lain
> di jaringan yang sama via `http://<IP-server>:4143/dashboard` (IP lokal server:
> `192.168.1.127`). Port sudah terbuka di firewall (FedoraWorkstation
> `1025-65535`). Dashboard & endpoint data (`/stats`, `/usage`) kini **dilindungi
> login via halaman UI** (`/login`) dengan **session cookie** (`gw_session`,
> HttpOnly, berlaku 7 hari — tidak perlu login berulang). Kredensial dari
> `adminUser`/`adminPass` di `gateway.config.json`. API key di semua respons
> sudah di-mask (hanya 6 karakter terakhir). `/health` & `/v1/models` tetap
> publik (tanpa data sensitif); endpoint `/v1/*` tetap butuh API key.

```bash
curl http://localhost:4143/dashboard    # redirect ke /login kalau belum login
curl -c cj.txt -d 'username=admin&password=PASS' http://localhost:4143/login   # login -> cookie
curl -b cj.txt http://localhost:4143/stats       # JSON lengkap (pakai cookie)
curl -b cj.txt http://localhost:4143/usage       # JSON ringkas
curl -b cj.txt http://localhost:4143/logout      # logout
```

Dashboard menampilkan: stat cards (request, token, estimasi % vs `dailyAllowance`,
failover hari ini, key cooldown), chart token & request per jam (area melengkung
+ label jam), bar chart share per model & per key, tabel keys (status + kapan
cooldown selesai), tabel per-model, activity feed request terakhir, events
terfilter, **Tor exit IP** terkini, dan alert saat key kena cooldown. Fitur:
search, interval refresh, tema dark/light, collapse section.

### Cek key & IP saat ini

```bash
opencode-whoami
```

Output contoh:
```
Provider: OpenCode Zen
Key:      sk-srHBOnSx1BHU...nKoMqEysjA
Models:   opencode/deepseek-v4-flash-free
Tor IP:   109.70.100.12
```

### Menjalankan claude-go (OpenCode Zen via gateway)

```bash
claude-go
# interaktif, atau headless:
claude-go -p "prompt"
```

Setiap `claude-go` dijalankan, key terbaru dari `auth.json` otomatis
dipasang ke `settings.opencode.json` dan request mengalir lewat gateway
di `localhost:4143`.

### Tools lain (tidak berubah)

```bash
claude          # default, router ailj.id
claude-ailj     # router ailj.id
```

### Jika Tor mati

```bash
sudo systemctl start tor
# atau restart
sudo systemctl restart tor
```

### Cek proxy Tor opencode-api

```bash
sudo systemctl status opencode-gateway
curl http://localhost:4143/health
# log: journalctl -u opencode-gateway -n 50
```

### Daftar model tersedia

```bash
opencode models | grep deepseek
```

Output:
```
opencode/deepseek-v4-flash
opencode/deepseek-v4-flash-free
opencode/deepseek-v4-pro
```

## 10. Troubleshooting

### `curl: (6) Could not resolve host`

DNS gagal. Cek koneksi:
```bash
ping 8.8.8.8                    # koneksi internet?
nslookup opencode.ai 1.1.1.1    # DNS eksternal?
```

### `FreeUsageLimitError` masih muncul

```bash
# Cek IP publik via Tor vs langsung
curl -s https://api.ipify.org                          # IP asli
curl -s --socks5-hostname 127.0.0.1:9050 https://api.ipify.org  # IP Tor

# Pastikan beda. Kalau sama → Tor tidak jalan, restart:
sudo systemctl restart tor
# lalu rotasi key:
opencode-auth-login
```

### `opencode: command not found`

PATH belum ke-load:
```bash
source ~/.bashrc
# atau buka terminal baru
```

### Key tidak berubah setelah `opencode-auth-login`

Cek langsung file auth:
```bash
cat ~/.local/share/opencode/auth.json
```

Kalau tidak berubah — pastikan key aktif ada di daftar `API-KEY`, atau edit manual:
```bash
nano ~/.local/share/opencode/auth.json
```

### `opencode-api-tor` gagal start / `listen EPERM`

Pastikan `TORSOCKS_CONF_FILE=/etc/tor/torsocks-opencode.conf` tercantum di
service (berisi `AllowInbound 1`), lalu:
```bash
sudo systemctl restart opencode-api-tor
journalctl -u opencode-api-tor -n 30
```

### Gateway (`opencode-gateway`) tidak jalan / port 4143 sibuk

```bash
sudo systemctl status opencode-gateway
sudo journalctl -u opencode-gateway -n 50
sudo systemctl restart opencode-gateway
# pastikan port bebas: ss -ltnp | grep 4143
```

### Semua key kena limit (semua cooldown)

Gateway otomatis coba key berikutnya; kalau semua cooldown, request tetap
diteruskan ke key terakhir (mungkin dapat 429). Tunggu probe pulih, atau
tambah key baru ke `~/Documents/malik/API-KEY` lalu `sudo systemctl restart
opencode-gateway` (pool di-reload saat start).

### Usage/dashboard tidak sesuai

Data tersimpan di `usage.json` (folder gateway). Reset jika perlu:
```bash
sudo systemctl stop opencode-gateway
rm ~/Documents/malik/opencode-gateway/usage.json
sudo systemctl start opencode-gateway
```

### opencode: model tidak ditemukan / baseURL tidak terpakai

Verifikasi override terbaca:
```bash
opencode debug config   # cek provider.opencode.options.baseURL
```
Harusnya `http://localhost:4143/v1`. Kalau tidak, perbaiki
`~/.config/opencode/opencode.json`.

### claude-go tidak memakai key/IP terbaru

`settings.opencode.json` di-rewrite setiap launch. Pastikan:
- `auth.json` punya key benar (`opencode-whoami`)
- Wrapper dipanggil (`which claude-go` → `~/.local/bin/claude-go`)
- Cek isi settings setelah launch:
  ```bash
  grep -E "ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN" ~/.claude/settings.opencode.json
  ```
  Harusnya `http://localhost:4143` + key terbaru.

### Permission Tor

Wrapper butuh sudo untuk restart Tor. Password disimpan di `~/.bash_aliases`
(`echo "woya" | sudo -S`). Kalau password berbeda, ganti di file itu.

## 11. Referensi File

| File | Fungsi |
|---|---|
| `~/.bashrc` | Load PATH & bash_aliases |
| `~/.bash_aliases` | Alias `oc`, function `opencode-auth-login`, `opencode-whoami` |
| `~/.local/bin/opencode` | Wrapper opencode (no Tor — arah ke gateway 4143) |
| `~/.local/bin/claude-go` | Wrapper claude-go: sync key + arah ke gateway 4143 |
| `~/.config/opencode/opencode.json` | Override provider: `opencode.baseURL → localhost:4143/v1` |
| `~/Documents/malik/opencode-gateway/` | **Smart Gateway** (fork opencode-api): proxy + failover + usage |
| `.../dist/{keys,tor,usage,events,dashboard,gateway-config}.js` | Modul gateway |
| `.../gateway.config.json` | Config gateway (keyFile, retries, dailyAllowance, dll) |
| `.../usage.json` + `events.jsonl` | Data usage + riwayat failover |
| `/etc/systemd/system/opencode-gateway.service` | Service gateway via Tor (port 4143) — AKTIF |
| `/etc/systemd/system/opencode-api-tor.service` | Proxy lama via Tor (port 4142) — legacy/rollback |
| `/etc/tor/torsocks-opencode.conf` | Config torsocks (AllowInbound 1) |
| `~/.local/share/opencode/auth.json` | API key credential (single source of truth, di-sync gateway) |
| `~/Documents/malik/API-KEY` | Daftar key untuk pool/failover otomatis |
| `~/.opencode/bin/opencode` | Binary opencode asli |
| `~/.claude/settings.opencode.json` | Settings claude-go (di-sync wrapper tiap launch) |
| `~/.claude/settings.json` | Settings default claude (router ailj.id) |
| `~/.claude/settings.ailj.json` | Settings claude-ailj (router ailj.id) |
| `~/.config/systemd/user/opencode-api.service` | Proxy lama non-Tor (port 4141) |

### One-liner setup ulang (Fedora, kalau pindah device baru)

> **Catatan:** One-liner di bawah adalah setup **lama** (proxy 4142).
> Setup terbaru (Smart Gateway 4143) direkomendasikan — langkah-langkahnya
> persis sama tapi: buat service `opencode-gateway.service` (port 4143,
> `ExecStart=/usr/bin/torsocks /usr/bin/node dist/index.js` dari folder
> gateway), wrapper opencode tanpa torsocks + `opencode.json` override
> `baseURL → http://localhost:4143/v1`, dan `claude-go` diarahkan ke 4143.
> Modul & config gateway ada di `~/Documents/malik/opencode-gateway/`.

```bash
# 1. Install Tor
sudo dnf install -y tor torsocks
sudo systemctl enable --now tor

# 2. Config torsocks untuk proxy
echo -e "TorAddress 127.0.0.1\nTorPort 9050\nOnionAddrRange 127.42.42.0/24\nAllowInbound 1\nIsolatePID 1" | sudo tee /etc/tor/torsocks-opencode.conf

# 3. Service proxy Tor (port 4142)
cat > /tmp/opencode-api-tor.service << 'EOF'
[Unit]
Description=opencode-api proxy via Tor for claude-go
After=network-online.target tor.service
Wants=network-online.target tor.service
[Service]
Type=simple
Environment=TORSOCKS_CONF_FILE=/etc/tor/torsocks-opencode.conf
Environment=OPENCODE_GO_BASE_URL=https://opencode.ai/zen/v1
Environment=OPENCODE_MODEL=deepseek-v4-flash-free
Environment=PROXY_PORT=4142
ExecStart=/usr/bin/torsocks /home/someone/.npm-global/bin/opencode-api start
Restart=on-failure
RestartSec=5
[Install]
WantedBy=default.target
EOF
sudo cp /tmp/opencode-api-tor.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now opencode-api-tor

# 4. Wrapper opencode
cat > ~/.local/bin/opencode << 'EOF'
#!/bin/bash
exec torsocks /home/someone/.opencode/bin/opencode "$@"
EOF
chmod +x ~/.local/bin/opencode

# 5. Wrapper claude-go
cat > ~/.local/bin/claude-go << 'EOF'
#!/usr/bin/env bash
SETTINGS="$HOME/.claude/settings.opencode.json"
KEY=$(python3 -c "
import json, os
try:
    print(json.load(open(os.path.expanduser('~/.local/share/opencode/auth.json')))['opencode']['key'])
except Exception:
    print('')
")
SETTINGS="$SETTINGS" KEY="$KEY" python3 -c "
import json, os
p = os.environ['SETTINGS']
cfg = json.load(open(p))
env = cfg.setdefault('env', {})
if os.environ['KEY']:
    env['ANTHROPIC_AUTH_TOKEN'] = os.environ['KEY']
env['ANTHROPIC_BASE_URL'] = 'http://localhost:4142'
json.dump(cfg, open(p, 'w'), indent=2)
"
exec claude --settings "$SETTINGS" "$@"
EOF
chmod +x ~/.local/bin/claude-go

# 6. Alias & functions
cat > ~/.bash_aliases << 'ALIASES'
alias oc='opencode run -m opencode/deepseek-v4-flash-free'
opencode-auth-login() {
  KEY_FILE="$HOME/Documents/malik/API-KEY"
  AUTH_FILE="$HOME/.local/share/opencode/auth.json"
  if [ -n "$1" ]; then KEY="$1"; else
    KEY=$(KEY_FILE="$KEY_FILE" AUTH_FILE="$AUTH_FILE" python3 -c "
import json, os
keys = [k.strip() for k in open(os.environ['KEY_FILE']) if k.strip().startswith('sk-')]
cur = json.load(open(os.environ['AUTH_FILE']))['opencode']['key']
i = keys.index(cur) if cur in keys else -1
print(keys[i + 1] if i + 1 < len(keys) else keys[0])")
  fi
  [ -z "$KEY" ] && echo "Error: tidak ada key" && return 1
  KEY="$KEY" AUTH_FILE="$AUTH_FILE" python3 -c "
import json, os
with open(os.environ['AUTH_FILE']) as f: cfg = json.load(f)
cfg['opencode']['key'] = os.environ['KEY']
json.dump(cfg, open(os.environ['AUTH_FILE'], 'w'), indent=2)"
  echo "GANTI_PASSWORD" | sudo -S systemctl restart tor 2>/dev/null
  sleep 2
  IP=$(curl -s --connect-timeout 10 --socks5-hostname 127.0.0.1:9050 https://api.ipify.org)
  echo "Key: ${KEY:0:15}...${KEY: -10} | Tor IP: $IP"
}
opencode-whoami() {
  python3 -c "
import json
cfg = json.load(open('/home/someone/.local/share/opencode/auth.json'))
k = cfg['opencode']['key']
print('Key: ' + k[:15] + '...' + k[-10:])"
}
ALIASES

# 7. PATH (pastikan wrapper menang)
grep -q "local/bin:/home/someone/.opencode/bin" ~/.bashrc || \
  echo 'export PATH=$HOME/.local/bin:/home/someone/.opencode/bin:$PATH' >> ~/.bashrc
grep -q "bash_aliases" ~/.bashrc || cat >> ~/.bashrc << 'RCEOF'

if [ -f ~/.bash_aliases ]; then
    . ~/.bash_aliases
fi
RCEOF

source ~/.bashrc
```

> Ganti `GANTI_PASSWORD` dengan password sudo Anda sebelum memakai fungsi
> `opencode-auth-login`.

---

**Dokumentasi selesai.** Semua perintah ada di atas, tinggal copas.
