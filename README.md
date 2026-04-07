# Invoice Renamer

Aplikasi desktop untuk membersihkan dan menyusun ulang nama file PDF invoice pajak secara otomatis.

## Apa yang dilakukan

Mengubah nama file dari format ekspor sistem pajak:

```
OutputTaxInvoice-550e8400-e29b-41d4-a716-446655440000-010.002-24.pdf
```

Menjadi format yang bersih dan mudah dibaca:

```
010.24-002.pdf
```

## Cara pakai

1. Buka aplikasi
2. Klik **Browse Folder** dan pilih folder berisi file invoice
3. Cek preview perubahan — uncheck file yang tidak ingin diubah
4. Klik **Rename** untuk mengeksekusi

## Build dari source

**Prasyarat:** Node.js, Rust, dan [Tauri CLI](https://tauri.app/start/prerequisites/)

```bash
# Install dependencies
npm install

# Jalankan mode development
npm run tauri dev

# Build aplikasi
npm run tauri build
```

## Stack

- [Tauri v2](https://tauri.app) — framework desktop
- [React](https://react.dev) + TypeScript — frontend
- [Vite](https://vitejs.dev) — build tool
- Rust (`std::fs`) — logika rename di backend
