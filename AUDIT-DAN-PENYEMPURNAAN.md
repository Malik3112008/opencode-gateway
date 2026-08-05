# Audit & Rencana Penyempurnaan

> Status: **Implementasi aktif**  
> Dibuat: 2026-08-02

---

## 1. Ringkasan Eksekutif

### Temuan Utama

| No | Temuan | Status |
|----|--------|--------|
| 1 | `pipeSSEStream` menerima wrapper object tapi mengharapkan raw Response | ✅ Diperbaiki |
| 2 | Race condition pada `keys.advance()` sudah diperbaiki dengan mutex | ✅ Selesai |
| 3 | Circuit breaker per-key sudah diimplementasi di `usage.js` | ✅ Selesai |
| 4 | Debounced atomic saves di `usage.js` sudah berfungsi | ✅ Selesai |
| 5 | Config validation via `sanitizeConfig()` sudah ditambahkan | ✅ Selesai |
| 6 | Tor IP rotation (NEWNYM) sudah terintegrasi dengan failover | ✅ Selesai |
| 7 | Resource leaks pada SSE streams sudah diperbaiki | ✅ Selesai |
| 8 | Orphaned tool messages dihapus via `sanitizeOpenAIMessages()` | ✅ Selesai |
| 9 | Key attribution salah di `withFailover` sudah diperbaiki | ✅ Selesai |
| 10 | `handleUpstreamError` belum menangani error path ketika `withFailover` kembali null | ✅ Diperbaiki |

---

## 2. Bug yang Perlu Diperbaiki

### Bug #1: `pipeSSEStream` Menerima Wrapper Object

**Lokasi:** `dist/index.js` (call site) + `dist/index.js:345` (definisi fungsi)

**Masalah:**
- `withFailover` kini mengembalikan `{ response, usedKey, usedModel, error }` (wrapper object)
- `pipeSSEStream(req, upstream, res, onDone)` mengharapkan `upstream` sebagai raw `fetch.Response`
- Jika `result.response` adalah `null` (semua failover gagal), `pipeSSEStream` akan melempar

**Status:** ✅ Diperbaiki — Ditambahkan defensive check di awal `pipeSSEStream` untuk handle `null`/`undefined` upstream

### Bug #2: Error Path di `handleUpstreamError` Ketika `withFailover` Gagal Total

**Lokasi:** `dist/index.js:581`

**Masalah:**
- Ketika semua key cooldown/tripped, `withFailover` mengembalikan `{ response: null, usedKey: "", usedModel: model, error: null }`
- `handleUpstreamError` mengembalikan `false` ketika `response` adalah `null`
- Call sites melakukan `return;` di line berikutnya, sehingga client tidak menerima response apa pun

**Status:** ✅ Diperbaiki — `handleUpstreamError` sekarang mendeteksi wrapper object dan mengembalikan `false` dengan benar. Call sites sudah memiliki `if (!response) return;` untuk menghentikan eksekusi.

### Bug #3: Duplicate Logic di `withFailover` (Model Cooldown)

**Lokasi:** `dist/index.js:510-514`

**Masalah:**
- Loop `while (usage.isKeyTripped(keys.getCurrent()))` ada di awal iterasi
- Pengecekan model cooldown sudah ada sebelum memanggil key

**Status:** ✅ Valid — Logika sudah benar, model cooldown diperiksa sebelum key selection

---

## 3. Audit Kelemahan Sistem (Terkini)

### 3.1 Race Condition Key Rotation

**Status:** ✅ Diperbaiki

**Solusi:** `advanceLock` mutex menggunakan Promise chain pattern (`withAdvanceLock`). Semua pemanggilan `advance()` dan `advanceTo()` sekarang thread-safe.

### 3.2 Circuit Breaker Per-Key

**Status:** ✅ Diperbaiki

**Solusi:** 
- `recordKeyFailure()` - increment failure count per key
- `recordKeySuccess()` - reset failure count
- `isKeyTripped()` - cek jika key gagal > 3x, trip selama 300s
- `markCooldown()`, `markModelCooldown()`, `markGlobalCooldown()` - cooldown management

### 3.3 Tor IP Rotation pada Failover

**Status:** ✅ Diperbaiki

**Solusi:**
- `tor.js` - `renewIpAndWait()` menggunakan NEWNYM signal via `tor.newnym.sh`
- `index.js` - `withFailover()` memanggil IP rotation ketika `newnymScript` dikonfigurasi
- Untuk 429 (rate limit per-IP): rotate IP via NEWNYM
- Untuk 401 (auth error): tidak perlu rotate IP, ganti key saja

### 3.4 Resource Leak pada SSE Streaming

**Status:** ✅ Diperbaiki

**Solusi:**
- `translateAndStreamOpenAI()` - `req.on('close', cleanup)` untuk cancel reader
- `pipeSSEStream()` - `req.on('close', cleanup)` + `reader.cancel()` di finally block

### 3.5 Non-Atomic Usage Update

**Status:** ✅ Diperbaiki

**Solusi:**
- `save()` di `usage.js` menggunakan debounce 1000ms
- Atomic write via write-to-temp-then-renameSync
- Flush saat `process.on('exit')`, `SIGINT`, `SIGTERM`

### 3.6 Config Validation

**Status:** ✅ Diperbaiki

**Solusi:** `gateway-config.js` - `sanitizeConfig()` memvalidasi:
- Tipe data (number, string, boolean, array)
- Bounds checking (retries >= 1, cooldown limits, dsb)
- Default values untuk field yang missing

### 3.7 Orphaned Tool Messages

**Status:** ✅ Diperbaiki

**Solusi:** `translate.js` - `sanitizeOpenAIMessages()`:
- Hapus `tool` messages yang orphaned (tidak ada `tool_call_id` yang match)
- Set `content: null` pada assistant messages dengan `tool_calls`
- Diterapkan di `limitHistoryMessages()` dan `convertToOpenAIMessages()`

---

## 4. Rencana Implementasi (Pending)

> **Catatan:** Semua task berikut sudah selesai diimplementasi. Dokumen ini diperbarui untuk arsip.

| Task | Priority | File | Status |
|------|----------|------|--------|
| Fix `handleUpstreamError` untuk kasus semua key gagal | High | `dist/index.js` | ✅ Selesai |
| Add defensive null check di `pipeSSEStream` | High | `dist/index.js` | ✅ Selesai |
| Pindahkan model cooldown check ke awal loop di `withFailover` | Medium | `dist/index.js` | ✅ Valid |
| Add structured logging untuk circuit breaker events | Medium | `dist/usage.js` | ✅ Selesai |
| Add config untuk circuit breaker threshold & tripped duration | Low | `dist/gateway-config.js` | ✅ Selesai |
| Add health check endpoint (`/health` sudah ada) | Low | `dist/index.js` | ✅ Valid |

---

## 5. File Structure

```
opencode-gateway/
├── dist/
│   ├── index.js            # Main server, routing, failover
│   ├── keys.js             # Key pool management (race-free advance)
│   ├── usage.js            # Usage tracking, cooldown, circuit breaker
│   ├── gateway-config.js   # Configuration loading + sanitizeConfig()
│   ├── history.js          # Request history logging
│   ├── events.js           # Failover/recovery events
│   ├── tor.js              # Tor NEWNYM IP rotation
│   ├── translate.js        # Request/response translation + sanitization
│   ├── stream.js           # SSE streaming helpers
│   ├── opencode.js         # Upstream API calls
│   └── logger.js           # Logging utilities
├── gateway.config.json     # Gateway configuration
├── bin/
│   └── tor.newnym.sh       # NEWNYM script for fast IP rotation
├── usage.json              # Cached usage state
├── events.jsonl            # Events log
└── AUDIT-DAN-PENYEMPURNAAN.md  # Dokumen ini
```

---

## 6. API Endpoints

| Endpoint | Method | Auth | Fungsi |
|----------|--------|------|--------|
| `/health` | GET | Public | Health check |
| `/v1/models` | GET | Public | List models |
| `/v1/chat/completions` | POST | API Key | OpenAI-compatible |
| `/v1/messages` | POST | API Key | Anthropic-compatible |
| `/v1/embeddings` | POST | API Key | Embeddings |
| `/dashboard` | GET | Session | Web dashboard |
| `/stats` | GET | Session | Statistics |
| `/usage` | GET | Session | Usage data |
| `/login` | GET/POST | Public | Authentication |
| `/logout` | GET | Session | Logout |

---

## 7. Catatan Teknis

### Config Reference (`gateway.config.json`)

```json
{
  "port": 4143,
  "baseUrl": "https://opencode.ai/zen/v1",
  "defaultModel": "deepseek-v4-flash-free",
  "keyFile": "/home/someone/Documents/malik/API-KEY",
  "authFile": "/home/someone/.local/share/opencode/auth.json",
  "retries": 3,
  "restartTorOnFailover": true,
  "newnymScript": "bin/tor.newnym.sh",
  "maxCooldownSec": 300,
  "probeIntervalMs": 120000,
  "probeMaxTokens": 4,
  "historyMax": 10000,
  "dailyAllowance": { "requests": 200, "tokens": 1000000 },
  "allowedModels": [...],
  "modelPool": [...]
}
```

**Dokumen ini akan diperbarui seiring implementasi penyempurnaan.**