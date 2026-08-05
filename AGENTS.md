# Universal Agent Memory

Sistem memory global: `~/.agent-memory/memory.db` (CLI: `am`).

## Awal sesi
1. Jalankan `am load` (atau baca `.ai/context.md` jika CLI tidak ada).
2. Pakai current state, active tasks, dan next action sebagai titik mulai.
3. Jangan tanyakan ulang hal yang sudah ada di memory.

## Selama bekerja — simpan saat ada milestone
`am add-memory --type <decision|bug|fix|feature|config|command|environment|lesson|risk|note|question> --content "<isi>" --importance <1-5>`

## Sebelum sesi berakhir
`am save-session --summary "<ringkasan>" --next "<langkah berikutnya>"`

## Mencari riwayat
`am search "<query>"`

## Aturan
- Jangan simpan secret (password, API key, token). Simpan referensi env saja.
- Memory item maksimal ~300 karakter.
