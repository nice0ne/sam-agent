<div align="center">

<img src="public/icon/128.png" alt="SAM-Agent Logo" width="100" height="100" />

# SAM-Agent
### Autonomous AI Browser Assistant & Co-Pilot

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WXT Framework](https://img.shields.io/badge/Built_with-WXT_0.19-red?logo=vite&logoColor=white)](https://wxt.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.1-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

*An autonomous, multi-provider AI browser agent that lives in your Chrome side panel — capable of reading web pages, automating forms and complex DOM interactions, coordinating across multiple tabs, executing user-defined scriptlet tools, running scheduled cron tasks in the background, and synchronizing workspaces directly with your local file system.*

</div>

---

## 🌟 Overview

<div align="center">
  <video src="https://github.com/nice0ne/sam-agent/raw/main/docs/video/Sam-Mockup.mp4" controls="controls" muted="muted" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></video>
</div>

**SAM-Agent** is a local-first, highly capable autonomous pair programmer and browser agent built as a Chrome Extension (Manifest V3). It combines state-of-the-art LLM reasoning with native Chrome APIs (`chrome.debugger`, `chrome.scripting`, `chrome.tabs`, `chrome.alarms`, and `FileSystemAccessAPI`) to deliver a true co-pilot experience directly inside your browser.

Unlike standard chatbots, SAM-Agent can **see**, **understand**, and **act** upon web pages, manage multi-tab workflows, generate slide presentations, and execute background tasks autonomously even when the side panel is closed.

---

## ✨ Key Features

### 1. 🧠 Multi-Provider LLM Integration
- **Direct Multi-Model Support**: Connect directly using your own API keys for:
  - **Anthropic Claude** (`claude-3-7-sonnet`, `claude-3-5-haiku`, etc.)
  - **OpenAI** (`gpt-4o`, `gpt-4o-mini`, `o3-mini`)
  - **Google Gemini** (`gemini-2.0-flash`, `gemini-1.5-pro`)
  - **DeepSeek** (`deepseek-chat`, `deepseek-reasoner`)
  - **Zhipu AI / GLM** (`glm-4-plus`, `glm-4-flash`)
  - **Local Models**: Connect to **Ollama** or **LM Studio** (`http://localhost:11434`, `http://127.0.0.1:1234`) with zero data leaving your machine.
- **Dynamic Reasoning & Context Injection**: Automatically optimizes token budgets using Real-Time Knowledge (RTK) and smart DOM compaction.

### 2. 🌐 Autonomous Browser Automation & CDP Engine
- **Page Reader Service**: Inspects the active Chrome tab, extracting metadata, semantic text, forms, interactive controls, and WYSIWYG rich text editors (TinyMCE, CKEditor, Quill, ProseMirror).
- **Page Action Execution**: Natively fills forms, clicks buttons, selects options, handles checkboxes/radios, and interacts with complex SPA pages via `chrome.scripting`.
- **Action Guardrails**: Strict safety rules prevent modifying disabled/readonly system fields unless explicitly intended.

<div align="center" style="margin-top: 12px; margin-bottom: 16px;">
  <video src="https://github.com/nice0ne/sam-agent/raw/main/docs/video/Sam-Automation.mp4" controls="controls" muted="muted" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></video>
</div>

#### 📝 Intelligent Form Filling
- Seamlessly navigates complex forms, inputs validation data, selects dropdowns, and triggers events naturally.

<div align="center" style="margin-top: 12px; margin-bottom: 16px;">
  <video src="https://github.com/nice0ne/sam-agent/raw/main/docs/video/Sam-Fill-Form.mp4" controls="controls" muted="muted" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></video>
</div>

### 3. 📑 Multi-Tab Pipeline Orchestration
- **Cross-Tab Awareness**: Discovers all open browser tabs in real time.
- **Bidirectional Control**: The agent can autonomously switch between tabs (`switchTab`), open target research URLs (`openTab`), and close temporary tabs (`closeTab`).
- **Data Aggregation**: Extract information from Tab A, process it, switch to Tab B, and submit the compiled data into internal workflows.

<div align="center" style="margin-top: 12px; margin-bottom: 16px;">
  <video src="https://github.com/nice0ne/sam-agent/raw/main/docs/video/Sam-Function-Tab.mp4" controls="controls" muted="muted" width="100%" style="max-width: 800px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></video>
</div>

### 4. 💾 Virtual File System (VFS) & Local Workspace Sync
- **Local-First VFS**: In-browser virtual file system backed by IndexedDB (`Dexie.js`) preserving code, data, and notes across sessions.
- **Native Folder Mount**: Seamlessly mounts an actual folder from your hard drive using the HTML5 File System Access API with bidirectional sync.
- **Portable Backups**: Export entire workspaces as `.zip` archives or import existing archives instantly.
- **GitHub Gist Integration**: Publish artifacts, code snippets, or generated data directly to GitHub Gists with a single click.

### 5. 🛠️ Tool Studio & Custom Scriptlets
- **User-Defined Extensions**: Create and edit custom JavaScript scriptlets stored in `/tools/*.js` via the built-in editor.
- **Autonomous Tool Execution**: SAM-Agent discovers custom tools dynamically and invokes them via the `runTool` action block during reasoning loops.
- **Interactive Playground**: Test-run scriptlets directly against the active web page and inspect outputs before saving.

### 6. ⏰ Autonomous Task Scheduler (Cron & Background Alarms)
- **Background Execution**: Schedule recurring automations (e.g. every 30 minutes, daily at 09:00, or custom interval).
- **Chrome Alarms Service Worker**: Runs independently in the background even if the side panel is closed.
- **System Notifications**: Dispatches native desktop notifications upon task completion with a summary of actions taken.
- **Execution History**: Full log of runs, error states, and task outputs saved in IndexedDB.

### 7. 🎨 Built-in Code Studio & Artifact Viewer
- **CodeMirror 6 Editor**: Full syntax highlighting for JavaScript, TypeScript, HTML, CSS, Python, JSON, and Markdown with dark mode support.
- **Rich Artifact Rendering**:
  - Full **Mermaid.js** diagram rendering (flowcharts, sequence diagrams, state machines, class diagrams, Gantt charts, Mindmaps).
  - **KaTeX** math formulas and LaTeX rendering.
  - **GFM Markdown** previews with syntax-highlighted code blocks and tables.
- **PowerPoint (.pptx) Presentation Generator**: Automatically designs and generates multi-slide PowerPoint files from agent responses or markdown outlines.

### 8. 🧬 Persona Customization via `SOUL.md`
- Tailor the agent's identity, personality, directives, and language preferences by editing `/soul.md` in the VFS.
- Default persona: **SAM-Agent** — direct, pragmatic, action-first browser co-pilot matching the user's primary language (English / Bahasa Indonesia).

---

## ⌨️ Default Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Ctrl + Shift + L` (Mac: `Cmd + Shift + L`) | Toggle SAM-Agent Side Panel | Browser Global |
| `Ctrl + Shift + .` (Mac: `Cmd + Shift + .`) | Open Quick Floating Command Palette | In-Page Overlay |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 20 or higher recommended)
- [npm](https://www.npmjs.com/) (version 10 or higher)
- Google Chrome or any Chromium-based browser (Edge, Brave, Arc, Opera)

### Installation & Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/sam-agent.git
   cd sam-agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development mode with hot reload:**
   ```bash
   npm run dev
   ```
   WXT will automatically launch a dedicated Chrome profile with the extension loaded and live reloading enabled.

4. **Build for production:**
   ```bash
   npm run build
   ```
   The production-ready extension package will be output to `.output/chrome-mv3`.

---

## 📦 Loading into Google Chrome (Manual Install)

1. Run the build command:
   ```bash
   npm run build
   ```
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** (Muat yang belum dibongkar).
5. Select the `.output/chrome-mv3` folder inside the `sam-agent` directory.
6. Click the extension icon in the toolbar or press `Ctrl + Shift + L` to launch the SAM-Agent side panel!

---

## 🏗️ Project Architecture & Tech Stack

```
Sam-Agent/
├── entrypoints/                      # WXT entrypoints (Manifest V3 components)
│   ├── background/                   # Background Service Worker & Alarm Scheduler
│   ├── sidepanel/                    # Primary Side Panel Application UI
│   ├── quick-command.content/        # In-page floating command palette overlay
│   ├── editor/                       # Fullscreen Code Editor window
│   ├── viewer/                       # Standalone Artifact & Mermaid Viewer
│   ├── picker/                       # Native File System Access authorization dialog
│   └── voice-popup/                  # Microphone permissions bridge
├── src/
│   ├── components/                   # Modular React UI components
│   │   ├── chat/                     # Chat stream, message cards, inputs, actions
│   │   ├── editor/                   # CodeMirror 6 code editor wrapper
│   │   ├── files/                    # VFS file tree, explorer, import/export modals
│   │   ├── history/                  # Thread & conversation history manager
│   │   ├── scheduler/                # Background Cron Task manager UI
│   │   ├── settings/                 # API keys, model parameters, theme settings
│   │   ├── tools/                    # Tool Studio scriptlet editor & manager
│   │   └── viewer/                   # Mermaid, Markdown, and artifact renderer
│   ├── services/                     # Core business logic & browser automation
│   │   ├── chat-runner.ts            # LLM streaming loop, tool executor & reasoning
│   │   ├── page-actions.ts           # CDP & DOM automated interactions engine
│   │   ├── page-reader.ts            # DOM structure compaction & context extractor
│   │   ├── scheduler.ts              # Chrome Alarms API task coordinator
│   │   ├── scheduler-runner.ts       # Headless agent background task execution
│   │   ├── tool-registry.ts          # Custom scriptlet loader & sandbox runner
│   │   ├── vfs.ts                    # Virtual File System abstraction
│   │   ├── handle-store.ts           # Native File System directory handle sync
│   │   ├── pptx-generator.ts         # Slide deck generator (.pptx)
│   │   ├── soul.ts                   # Agent persona & directive persistence
│   │   └── db.ts                     # Dexie.js IndexedDB schema & queries
│   ├── stores/                       # Zustand state management stores
│   └── types/                        # Comprehensive TypeScript definitions
├── public/                           # Static assets, SVG/PNG icons, tailwind runner
├── wxt.config.ts                     # WXT extension configuration & permissions
├── package.json                      # Project dependencies and build scripts
└── tsconfig.json                     # Strict TypeScript compiler options
```

### Core Technologies
- **Extension Framework**: [WXT](https://wxt.dev/) (Next-gen web extension framework)
- **UI & Components**: React 19, Tailwind CSS v4, Lucide Icons, clsx, tailwind-merge
- **State & Database**: Zustand, Dexie.js (IndexedDB wrapper)
- **Code & Diagrams**: `@uiw/react-codemirror`, CodeMirror 6, Mermaid.js v12, KaTeX, pptxgenjs, JSZip
- **AI Integrations**: Native fetch adapters with streaming support for Anthropic, OpenAI, Google Gemini, DeepSeek, Zhipu, and Ollama

---

## 🔒 Security & Privacy

- **Local Storage of Secrets**: Your API keys never leave your machine; they are stored exclusively in Chrome's encrypted `chrome.storage.local`.
- **Local-First Data**: All conversation threads, scheduled tasks, and VFS files are stored locally in your browser's IndexedDB.
- **Zero Third-Party Telemetry**: There is no tracking, analytics, or external telemetry code embedded in SAM-Agent.
- **Granular Permissions**: Network requests are strictly scoped to approved LLM endpoints and active browser automation targets.

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome!

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'feat: add amazing feature'`).
4. Push to the branch (`git push origin feature/amazing-feature`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
