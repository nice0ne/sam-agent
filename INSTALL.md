# 📦 SAM-Agent Installation Guide for Google Chrome

This guide provides step-by-step instructions to install and run **SAM-Agent** on Google Chrome or any Chromium-based browser (such as Brave, Microsoft Edge, Arc, and Opera).

---

## 📑 Installation Options

Choose one of the methods below:
- **[Method 1: Pre-built Release ZIP (Recommended)](#-method-1-installation-via-pre-built-zip-recommended)** — Best for general users. No Node.js or coding required.
- **[Method 2: Build from Source Code (Developer Mode)](#-method-2-installation-from-source-code-developer-mode)** — Best for developers who want to inspect or modify the source code.

---

## 🚀 Method 1: Installation via Pre-built ZIP (Recommended)

### Step 1: Download the Release Archive
1. Visit the [SAM-Agent GitHub Releases](https://github.com/nice0ne/sam-agent/releases) page.
2. In the latest release (e.g., `v4.1.1`), download the archive named **`sam-agent-ui-4.1.1-chrome.zip`** (or `sam-agent-chrome-mv3.zip`).
3. Extract (unzip) the `.zip` archive into a permanent folder on your computer (e.g., `C:\Extensions\sam-agent` on Windows, or `~/Extensions/sam-agent` on macOS/Linux).
   > **Note:** Do not delete or move this folder after installation, as Chrome loads and reads the extension files directly from this directory.

### Step 2: Open the Chrome Extensions Page
1. Open Google Chrome.
2. Navigate to **`chrome://extensions`** in your address bar and press **Enter**.
3. In the upper-right corner of the page, toggle on **Developer mode**.

![Developer Mode](https://developer.chrome.com/static/docs/extensions/get-started/tutorial/hello-world/image/the-developer-mode-toggle-b24ba5dc0fae9_1920.png)

### Step 3: Load the Unpacked Extension
1. In the upper-left corner, click the **Load unpacked** button.
2. Browse to and select the extracted folder (the directory containing `manifest.json`, `background.js`, `sidepanel.html`, etc.).
3. Click **Select Folder**.
4. 🎉 **SAM-Agent is now installed and ready in your browser!**

---

## 🛠️ Method 2: Installation from Source Code (Developer Mode)

Use this method if you wish to contribute, inspect the code, or test local modifications.

### Prerequisites
- **Node.js** v20 or newer installed ([Download Node.js](https://nodejs.org/))
- **Git** installed

### Build Steps
1. **Clone the repository:**
   ```bash
   git clone https://github.com/nice0ne/sam-agent.git
   cd sam-agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   *(The `postinstall` script automatically prepares WXT types).*

3. **Build the extension bundle:**
   ```bash
   npm run build
   ```
   The production build will be generated in the `.output/chrome-mv3` directory.
   
   *(Optional)* To create a packaged ZIP bundle directly:
   ```bash
   npm run zip
   ```

4. **Load into Chrome:**
   - Open `chrome://extensions` in Chrome.
   - Ensure **Developer mode** is enabled in the top right.
   - Click **Load unpacked** and select the folder:
     `{path-to-sam-agent}/.output/chrome-mv3`

> 💡 **Live Development Mode (Hot Module Reload):**
> Run the following command for active development with automated extension reloading:
> ```bash
> npm run dev
> ```

---

## 📌 Getting Started & Keybindings

Once installed, follow these steps for the optimal experience:

1. **Pin SAM-Agent to the Chrome Toolbar:**
   - Click the puzzle icon (**Extensions**) in the top-right corner of Chrome.
   - Locate **SAM-Agent** and click the **Pin 📌** icon.

2. **Open the Main Sidepanel:**
   - Click the SAM-Agent icon on the toolbar, or
   - Use the keyboard shortcut:
     - **Windows/Linux:** `Ctrl + Shift + L`
     - **macOS:** `Cmd + Shift + L`

3. **Open the In-Page Quick Command Palette:**
   - On any webpage, press:
     - `Ctrl + Shift + .` (period)

---

## ⚙️ Initial Setup (Connecting LLM Providers)

1. Open the SAM-Agent Sidepanel.
2. Click on **AI Models & Settings ⚙️** (via the header navigation menu).
3. Choose your preferred LLM provider:
   - **Cloud Providers:** Enter your API Key for Anthropic (Claude), OpenAI (GPT-4o), Google Gemini, DeepSeek, or Zhipu AI.
   - **Local LLMs:** Connect directly to **Ollama** (`http://localhost:11434`) or **LM Studio** (`http://localhost:1234`) without requiring an API key.
4. Click **Save Settings**. SAM-Agent is now ready to assist your workflows!

---

## ❓ Troubleshooting & Frequently Asked Questions

#### 1. Error: "Manifest file is missing or unreadable" when clicking Load Unpacked
- **Cause:** You selected the wrong parent directory.
- **Solution:** Make sure you select the exact folder that **directly contains `manifest.json`**, not a wrapping parent folder.

#### 2. How do I update to the latest version?
- **If installed via ZIP:** Download the latest ZIP release from GitHub Releases, extract and overwrite the files in your existing extension folder, then go to `chrome://extensions` and click the **Reload 🔄** button on the SAM-Agent card.
- **If installed via Git:** Run `git pull`, followed by `npm run build`, and click **Reload 🔄** on `chrome://extensions`.

#### 3. Keyboard shortcuts do not trigger?
- Go to `chrome://extensions/shortcuts` in Chrome.
- Verify that the shortcuts for SAM-Agent (`Ctrl+Shift+L` or `Ctrl+Shift+.`) are assigned and not conflicting with other extensions or system hotkeys.
