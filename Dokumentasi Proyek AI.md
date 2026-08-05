# 📚 Dokumentasi Proyek: AI File Agent (Web Platform)

## 🎯 1. Overview

**AI File Agent** adalah aplikasi asisten berbasis AI yang memungkinkan pengguna mengontrol dan memanipulasi file di laptop mereka secara remote melalui aplikasi web di HP atau perangkat lain. Sistem ini dirancang sebagai **Thin Client (Web App) + Thick Server (Laptop Agent)**.

### 🎨 Konsep Utama
- **HP / Browser** → Hanya sebagai remote control (kirim prompt, lihat hasil)
- **Laptop** → Otak & tangan AI (eksekusi file, panggil AI, simpan history)
- **100% Gratis** → Menggunakan OpenCode Zen (free model) + rotasi IP + SQLite lokal

---

## 🏗️ 2. Arsitektur Sistem

```
┌─────────────────────┐         ┌─────────────────────────────────────┐
│   Web App (PWA)     │         │         LAPTOP (Agent Core)         │
│   - React + Vite    │◄───────►│                                     │
│   - Tailwind CSS    │ WebSocket│  ┌─────────────┐  ┌─────────────┐  │
│   - Add to Home     │   /API   │  │  AI Router  │──│ OpenCode Zen│  │
│     Screen          │         │  │  (TS/Node)  │  │ + Rotasi IP │  │
└─────────────────────┘         │  └──────┬──────┘  └─────────────┘  │
                                │         │                          │
                                │         ▼                          │
                                │  ┌─────────────┐  ┌─────────────┐  │
                                │  │ File Engine │──│  File System│  │
                                │  │  (TS/Node)  │  │   (Laptop)  │  │
                                │  └─────────────┘  └─────────────┘  │
                                │         │                          │
                                │         ▼                          │
                                │  ┌─────────────┐                   │
                                │  │   SQLite    │ (History + Cache) │
                                │  └─────────────┘                   │
                                └─────────────────────────────────────┘
```

---

## ⚙️ 3. Tech Stack

### 🖥️ Backend (Laptop Agent)
| Komponen | Teknologi | Alasan |
|----------|-----------|--------|
| Runtime | **Node.js 20+** atau **Bun** | Cepat, ekosistem luas |
| Language | **TypeScript** | Type safety, mudah maintain |
| Framework | **Fastify** | Lebih cepat dari Express, built-in schema validation |
| WebSocket | **Socket.io** | Real-time streaming response |
| AI Client | **OpenAI SDK** | Compatible dengan OpenCode Zen API |
| Database | **SQLite** + **Drizzle ORM** | Lokal, ringan, type-safe |
| File Watcher | **Chokidar** | Monitor perubahan file real-time |
| Proxy Rotator | Custom module | Integrasi dengan sistem 9router Anda |

### 📱 Frontend (Web App / PWA)
| Komponen | Teknologi | Alasan |
|----------|-----------|--------|
| Framework | **React 18 + Vite** | Cepat, modern, HBL |
| Styling | **Tailwind CSS** | Utility-first, cepat develop |
| State | **Zustand** | Ringan, simpel |
| HTTP/WS | **Axios + Socket.io-client** | Komunikasi real-time |
| PWA | **Vite PWA Plugin** | Agar bisa di-install di HP |
| Icons | **Lucide React** | Modern & ringan |

---

## 📁 4. Struktur Folder Proyek

```
ai-file-agent/
│
├── backend/                      # Agent Core (Laptop)
│   ├── src/
│   │   ├── index.ts              # Entry point server
│   │   ├── config/
│   │   │   ├── env.ts            # Load environment variables
│   │   │   └── constants.ts      # Konstanta (whitelist folder, dll)
│   │   │
│   │   ├── ai/
│   │   │   ├── client.ts         # OpenCode Zen client
│   │   │   ├── router.ts         # Logic rotasi IP + retry
│   │   │   ├── summarizer.ts     # Fungsi ringkas history
│   │   │   └── prompts.ts        # System prompt templates
│   │   │
│   │   ├── file-engine/
│   │   │   ├── executor.ts       # Eksekusi perintah file
│   │   │   ├── validator.ts      # Validasi path (whitelist)
│   │   │   └── backup.ts         # Backup otomatis sebelum edit
│   │   │
│   │   ├── database/
│   │   │   ├── schema.ts         # Drizzle schema
│   │   │   ├── connection.ts     # SQLite connection
│   │   │   └── repositories/
│   │   │       ├── sessions.ts
│   │   │       └── messages.ts
│   │   │
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── chat.ts       # POST /api/chat
│   │   │   │   ├── history.ts    # GET /api/history
│   │   │   │   └── files.ts      # GET /api/files (preview)
│   │   │   └── websocket.ts      # Socket.io handler
│   │   │
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── security.ts
│   │
│   ├── data/
│   │   └── agent.db              # SQLite database
│   │
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
│
├── frontend/                     # Web App (PWA)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── FilePreview.tsx
│   │   │   ├── ApprovalDialog.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── hooks/
│   │   │   ├── useSocket.ts
│   │   │   └── useChat.ts
│   │   ├── stores/
│   │   │   └── chatStore.ts
│   │   └── styles/
│   │       └── globals.css
│   │
│   ├── public/
│   │   ├── manifest.json         # PWA manifest
│   │   └── icons/
│   │
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── shared/                       # Tipe data bersama
│   └── types.ts
│
├── docs/                         # Dokumentasi
├── scripts/                      # Script helper (setup, backup, dll)
└── README.md
```

---

## 🚀 5. Fitur Utama

### ✅ Fase 1 (MVP - Minimum Viable Product)
1. **Chat Interface** - Kirim prompt, terima balasan AI
2. **File Operations Dasar**:
   - 📁 Buat folder
   - 📄 Buat file
   - ✏️ Edit file (append / replace)
   - 🗑️ Hapus file/folder
   - 📖 Baca isi file
   - 🔍 List directory
3. **Real-time Streaming** - Teks AI muncul per kata
4. **History Management** - SQLite lokal + summarization otomatis
5. **Whitelist Folder** - Hanya folder tertentu yang bisa diakses
6. **PWA Support** - Bisa di-install di HP

### 🔒 Fase 2 (Keamanan & Stabilitas)
1. **Approval Mode** - Konfirmasi sebelum aksi berbahaya (delete, overwrite)
2. **Auto Backup** - Backup file sebelum diedit
3. **Rate Limit Handler** - Integrasi rotasi IP 9router
4. **Activity Log** - Catat semua aksi AI
5. **Authentication** - Token-based untuk akses web app

### 🌟 Fase 3 (Advanced)
1. **Code Execution** - Jalankan script (Go, Node, Python)
2. **Git Integration** - Commit, push, pull otomatis
3. **Voice Input** - Speech-to-text di HP
4. **Multi-Device Sync** - Sinkronisasi via cloud (opsional)
5. **Plugin System** - Tambah capability AI via plugin

---

## 🔌 6. API Endpoints (Backend)

### REST API

#### `POST /api/chat`
Kirim prompt baru ke AI Agent.

**Request:**
```json
{
  "sessionId": "uuid-1234",
  "message": "Buat folder baru bernama 'ProjectX' di Documents",
  "options": {
    "requireApproval": true
  }
}
```

**Response (Streaming via WebSocket):**
```json
{
  "type": "thinking",
  "content": "Menganalisis permintaan..."
}
```
```json
{
  "type": "action",
  "action": "create_folder",
  "path": "/home/user/Documents/ProjectX",
  "status": "pending_approval"
}
```
```json
{
  "type": "result",
  "success": true,
  "message": "Folder 'ProjectX' berhasil dibuat."
}
```

#### `GET /api/history/:sessionId`
Ambil riwayat chat.

**Response:**
```json
{
  "sessionId": "uuid-1234",
  "summary": "User telah membuat beberapa folder untuk project baru.",
  "messages": [
    { "role": "user", "content": "...", "timestamp": "..." },
    { "role": "assistant", "content": "...", "timestamp": "..." }
  ]
}
```

#### `GET /api/files/preview?path=/Documents`
Preview isi folder (read-only, aman).

### WebSocket Events

| Event | Direction | Deskripsi |
|-------|-----------|-----------|
| `chat:start` | Client → Server | Mulai sesi chat |
| `chat:message` | Client → Server | Kirim pesan baru |
| `ai:thinking` | Server → Client | Status AI sedang berpikir |
| `ai:stream` | Server → Client | Stream token AI |
| `ai:action` | Server → Client | AI akan melakukan aksi file |
| `ai:approval` | Server → Client | Minta persetujuan user |
| `ai:result` | Server → Client | Hasil aksi |
| `system:error` | Server → Client | Error notification |

---

## 🔄 7. Alur Kerja (Workflow)

### Alur Chat Sederhana
```
1. User ketik prompt di HP
   ↓
2. Web App kirim via WebSocket ke Laptop
   ↓
3. Backend simpan pesan ke SQLite
   ↓
4. Backend cek: perlu summarize history? 
   ├─ Ya → Generate summary, hapus pesan lama
   └─ Tidak → Lanjut
   ↓
5. Backend kirim ke OpenCode Zen (via rotasi IP jika perlu)
   ↓
6. AI balas dengan JSON berisi action
   ↓
7. Backend validasi action (whitelist check)
   ↓
8. Jika butuh approval → kirim notifikasi ke HP
   ↓
9. User approve → Backend eksekusi file operation
   ↓
10. Backend kirim hasil ke HP (streaming)
   ↓
11. Simpan ke SQLite
```

### Alur Rotasi IP (Saat Limit Tercapai)
```
Request ke OpenCode Zen
   ↓
Status 429 (Rate Limit)?
   ├─ Tidak → Lanjut normal
   └─ Ya → Trigger rotasi IP via sistem 9router
          ↓
          Tunggu IP baru aktif (5-10 detik)
          ↓
          Retry request dengan IP baru
          ↓
          Maksimal 3x retry
```

---

## 🔐 8. Keamanan

### 🛡️ Aturan Wajib
1. **Whitelist Path** - Hanya folder yang diizinkan:
   ```typescript
   const ALLOWED_PATHS = [
     '/home/user/Documents',
     '/home/user/Projects',
     '/home/user/Downloads'
   ];
   ```

2. **Path Traversal Protection** - Cegah `../../etc/passwd`:
   ```typescript
   function validatePath(requestedPath: string): boolean {
     const resolved = path.resolve(requestedPath);
     return ALLOWED_PATHS.some(allowed => 
       resolved.startsWith(allowed)
     );
   }
   ```

3. **Backup Otomatis** - Sebelum edit/hapus:
   ```typescript
   async function safeEdit(filePath: string, newContent: string) {
     const backupPath = `${filePath}.backup.${Date.now()}`;
     await fs.copyFile(filePath, backupPath);
     await fs.writeFile(filePath, newContent);
   }
   ```

4. **Token Authentication** - Web app harus punya token:
   ```typescript
   const API_TOKEN = process.env.API_TOKEN; // Generate random
   // Di frontend: kirim via header Authorization
   ```

5. **HTTPS / Tunneling** - Gunakan Cloudflare Tunnel (gratis) untuk akses dari luar LAN.

---

## 📦 9. Setup & Instalasi

### Prasyarat
- Node.js 20+ atau Bun
- Git
- Akun OpenCode Zen (sudah Anda punya)
- Sistem 9router Anda sudah berjalan

### Langkah Instalasi

```bash
# 1. Clone repository
git clone https://github.com/username/ai-file-agent.git
cd ai-file-agent

# 2. Setup Backend
cd backend
npm install
cp .env.example .env
# Edit .env: isi OPENCODE_API_KEY, ALLOWED_PATHS, dll
npm run db:migrate
npm run dev

# 3. Setup Frontend (terminal baru)
cd frontend
npm install
cp .env.example .env
# Edit .env: isi VITE_API_URL (IP laptop atau domain tunnel)
npm run dev

# 4. Akses Web App
# Buka http://localhost:5173 di HP (satu jaringan WiFi)
# Atau via Cloudflare Tunnel untuk akses dari mana saja
```

### Environment Variables (`.env` Backend)
```env
# Server
PORT=3000
HOST=0.0.0.0

# OpenCode Zen
OPENCODE_API_URL=https://api.opencode.ai/v1
OPENCODE_API_KEY=your-key-here
OPENCODE_MODEL=free-model-name

# Security
API_TOKEN=random-token-123456
ALLOWED_PATHS=/home/user/Documents,/home/user/Projects

# Database
DATABASE_PATH=./data/agent.db

# 9router Integration (opsional)
ROTATOR_API_URL=http://localhost:8080
```

---

## 📱 10. Instalasi di HP (PWA)

### Android (Chrome)
1. Buka web app di Chrome
2. Ketuk menu (⋮) → **"Install app"** atau **"Add to Home screen"**
3. Konfirmasi → Icon muncul di home screen
4. Buka dari icon → Tampil full-screen seperti APK native

### iOS (Safari)
1. Buka web app di Safari
2. Ketuk tombol Share (kotak dengan panah)
3. Pilih **"Add to Home Screen"**
4. Konfirmasi → Icon muncul

---

## 🗺️ 11. Roadmap Pengembangan

### Minggu 1-2: Fondasi
- [ ] Setup monorepo (backend + frontend + shared)
- [ ] Implementasi Fastify server + TypeScript
- [ ] Koneksi SQLite dengan Drizzle ORM
- [ ] Basic chat endpoint (tanpa AI dulu, mock response)

### Minggu 3-4: AI Integration
- [ ] Integrasi OpenCode Zen client
- [ ] Implementasi rotasi IP (hook ke 9router)
- [ ] System prompt engineering untuk file operations
- [ ] JSON parsing response AI → action

### Minggu 5-6: File Engine
- [ ] Executor untuk semua operasi file
- [ ] Whitelist validator
- [ ] Auto backup system
- [ ] Approval flow (WebSocket)

### Minggu 7-8: Frontend
- [ ] React app + Tailwind
- [ ] Chat UI dengan streaming
- [ ] File preview component
- [ ] PWA setup

### Minggu 9-10: History & Optimization
- [ ] Summarization logic
- [ ] Caching strategy
- [ ] Error handling & retry
- [ ] Activity logging

### Minggu 11-12: Polish & Deploy
- [ ] Security audit
- [ ] Cloudflare Tunnel setup
- [ ] Testing di berbagai device
- [ ] Dokumentasi final

---

## 🐛 12. Troubleshooting Umum

| Masalah | Solusi |
|---------|--------|
| `429 Too Many Requests` dari OpenCode Zen | Cek rotasi IP 9router, pastikan berjalan |
| AI tidak bisa akses folder | Cek `ALLOWED_PATHS` di `.env` |
| Web app tidak bisa connect dari HP | Pastikan satu WiFi, atau pakai Cloudflare Tunnel |
| SQLite locked | Gunakan `better-sqlite3` (synchronous, no lock issue) |
| File tidak ter-backup | Cek permission folder `data/backups/` |
| PWA tidak installable | Pastikan `manifest.json` valid + HTTPS |

---

## 📝 13. Catatan Penting

1. **Laptop Harus Nyala** - Karena agent berjalan di laptop, laptop harus tetap on (bisa sleep, tapi jangan shutdown).
2. **Backup Rutin** - SQLite database sebaiknya di-sync ke cloud (GitHub private repo / Google Drive) secara berkala.
3. **Monitor Token Usage** - Meski gratis, OpenCode Zen tetap ada limit per IP. Gunakan summarization agresif.
4. **Jangan Expose ke Public Tanpa Auth** - Selalu pakai token + Cloudflare Access jika ingin akses dari internet.

---

## 🎯 Kesimpulan

Dokumentasi ini adalah **blueprint lengkap** untuk membangun AI File Agent Anda. Dengan arsitektur **Thin Client (Web) + Thick Server (Laptop)**, Anda mendapatkan:

✅ **Gratis selamanya** - OpenCode Zen + SQLite + self-hosted  
✅ **Aman** - Whitelist + backup + approval  
✅ **Fleksibel** - Bisa diakses dari HP, tablet, laptop lain  
✅ **Mudah di-maintain** - Stack TypeScript modern, type-safe  
✅ **Scalable** - Arsitektur modular, mudah tambah fitur  

**Langkah selanjutnya yang saya sarankan:**
1. Setup monorepo dengan struktur folder di atas
2. Mulai dari backend: Fastify + SQLite + mock AI response
3. Baru integrasi OpenCode Zen setelah basic flow jalan
4. Frontend bisa dibuat paralel setelah API stabil

Apakah Anda ingin saya buatkan **kode starter** untuk salah satu bagian? Misalnya:
- 🅰️ Backend Fastify + SQLite setup
- 🅱️ AI Client dengan rotasi IP
- 🅲️ Frontend React + WebSocket chat
- 🅳️ File executor dengan whitelist

Tinggal pilih, dan saya buatkan kode lengkapnya! 🚀
