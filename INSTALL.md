# 📦 Panduan Instalasi SAM-Agent ke Google Chrome

Dokumen ini memandu Anda langkah demi langkah untuk memasang dan menjalankan **SAM-Agent** pada Google Chrome atau browser berbasis Chromium lainnya (Brave, Microsoft Edge, Arc, Opera).

---

## 📑 Pilihan Metode Instalasi

Pilih salah satu metode di bawah ini:
- **[Metode 1: Menggunakan File ZIP Rilis Resmi (Paling Mudah)](#-metode-1-instalasi-via-pre-built-zip-rekomendasi)** — Cocok untuk pengguna umum tanpa perlu install Node.js / coding.
- **[Metode 2: Build dari Source Code](#-metode-2-instalasi-dari-source-code-mode-developer)** — Cocok untuk pengembang yang ingin memodifikasi kode sumber.

---

## 🚀 Metode 1: Instalasi via Pre-built ZIP (Rekomendasi)

### Langkah 1: Unduh File Rilis
1. Kunjungi halaman [GitHub Releases SAM-Agent](https://github.com/nice0ne/sam-agent/releases).
2. Di versi terbaru (misal `v4.0.0`), unduh file bernama **`sam-agent-chrome-mv3.zip`**.
3. Ekstrak (unzip) file `.zip` tersebut ke folder pilihan Anda di komputer (misal: `C:\Extensions\sam-agent` atau `~/Extensions/sam-agent`).
   > **Catatan:** Jangan hapus atau pindahkan folder ini setelah dipasang, karena Chrome membaca file ekstensi langsung dari lokasi tersebut.

### Langkah 2: Buka Halaman Extensions di Chrome
1. Buka browser Google Chrome.
2. Ketik **`chrome://extensions`** di bilah alamat URL (address bar) lalu tekan **Enter**.
3. Di pojok kanan atas halaman, aktifkan sakelar **Developer mode** (Mode pengembang).

![Developer Mode](https://developer.chrome.com/static/docs/extensions/get-started/tutorial/hello-world/image/the-developer-mode-toggle-b24ba5dc0fae9_1920.png)

### Langkah 3: Muat Ekstensi (*Load Unpacked*)
1. Di pojok kiri atas, klik tombol **Load unpacked** (Muat yang belum dibongkar).
2. Cari dan pilih folder hasil ekstrak tadi (folder yang di dalamnya berisi file `manifest.json`, `background.js`, `sidepanel.html`, dll.).
3. Klik **Select Folder** (Pilih Folder).
4. 🎉 **SAM-Agent berhasil terpasang di browser Anda!**

---

## 🛠️ Metode 2: Instalasi dari Source Code (Mode Developer)

Gunakan metode ini jika Anda ingin berkontribusi atau menguji perubahan kode secara langsung.

### Prasyarat
- **Node.js** v20+ terpasang ([Unduh Node.js](https://nodejs.org/))
- **Git** terpasang

### Langkah Instalasi
1. **Clone repositori:**
   ```bash
   git clone https://github.com/nice0ne/sam-agent.git
   cd sam-agent
   ```

2. **Install dependensi:**
   ```bash
   npm install
   ```
   *(Skrip `postinstall` akan otomatis menyiapkan types WXT)*.

3. **Build ekstensi:**
   ```bash
   npm run build
   ```
   Hasil build siap pakai akan tersimpan di folder `.output/chrome-mv3`.

4. **Muat ke Chrome:**
   - Buka `chrome://extensions` di Chrome.
   - Aktifkan **Developer mode** di pojok kanan atas.
   - Klik **Load unpacked** dan arahkan ke folder:
     `{lokasi-repo-sam-agent}/.output/chrome-mv3`

> 💡 **Mode Live Development (Hot Reload):**
> Jalankan perintah berikut untuk pengembangan aktif dengan auto-reload otomatis di browser:
> ```bash
> npm run dev
> ```

---

## 📌 Cara Menggunakan SAM-Agent

Setelah terpasang, lakukan langkah berikut untuk kenyamanan pemakaian:

1. **Sematkan (Pin) ke Toolbar Chrome:**
   - Klik ikon puzzle (Extensions) di pojok kanan atas Chrome.
   - Cari **SAM-Agent**, lalu klik ikon **Pin 📌**.

2. **Membuka Sidepanel Utama:**
   - Klik ikon SAM-Agent di toolbar, atau
   - Tekan pintasan keyboard:
     - **Windows/Linux:** `Ctrl + Shift + L`
     - **macOS:** `Cmd + Shift + L`

3. **Membuka In-Page Quick Command Palette:**
   - Di halaman web mana pun, tekan:
     - `Ctrl + Shift + .` (titik)

---

## ⚙️ Pengaturan Awal (Koneksi LLM)

1. Buka Sidepanel SAM-Agent.
2. Masuk ke tab **Settings ⚙️**.
3. Pilih provider LLM yang ingin Anda gunakan:
   - **Cloud Providers:** Masukkan API Key untuk Anthropic (Claude), OpenAI (GPT-4o), Google Gemini, DeepSeek, atau Zhipu AI.
   - **Local LLM:** Hubungkan langsung ke **Ollama** (`http://localhost:11434`) atau **LM Studio** (`http://localhost:1234`) tanpa API key.
4. Klik **Save Settings**. SAM-Agent sekarang siap membantu Anda!

---

## ❓ Troubleshooting / Pertanyaan Umum

#### 1. Muncul error "Manifest file is missing or unreadable" saat Load Unpacked
- **Penyebab:** Anda memilih folder induk yang salah.
- **Solusi:** Pastikan folder yang Anda pilih adalah folder yang **langsung berisi file `manifest.json`**, bukan folder pembungkus di atasnya.

#### 2. Bagaimana cara memperbarui (update) ke versi terbaru?
- **Jika via ZIP:** Unduh ZIP versi baru dari GitHub Releases, ekstrak dan timpa file di folder lama, lalu di `chrome://extensions`, klik ikon **Reload (putar balik 🔄)** pada kartu SAM-Agent.
- **Jika via Git:** Jalankan `git pull`, lalu `npm run build`, dan klik ikon Reload di `chrome://extensions`.

#### 3. Pintasan keyboard tidak merespons?
- Buka `chrome://extensions/shortcuts` di Chrome.
- Pastikan pintasan untuk SAM-Agent (`Ctrl+Shift+L` atau `Ctrl+Shift+.`) aktif dan tidak bentrok dengan ekstensi lain.
