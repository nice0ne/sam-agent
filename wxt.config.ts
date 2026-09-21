import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
  }),
  manifest: {
    name: 'SAM-Agent: AI Browser Assistant (Modern UI)',
    description: 'Autonomous browser agent featuring multi-provider LLM support, CDP automation, and Virtual File System.',
    version: '4.1.8',
    manifest_version: 3,
    action: {
      default_title: 'Open SAM-Agent',
    },
    permissions: [
      'sidePanel',
      'storage',
      'tabs',
      'debugger',
      'scripting',
      'activeTab',
      'tabGroups',
      'unlimitedStorage',
      'notifications',
      'alarms',
      'tabCapture',
    ],
    commands: {
      'toggle-sidebar': {
        suggested_key: {
          default: 'Ctrl+Shift+L',
          mac: 'Command+Shift+L',
        },
        description: 'Toggle SAM-Agent Sidepanel',
      },
      'quick-command-palette': {
        suggested_key: {
          default: 'Ctrl+Shift+Period',
          mac: 'Command+Shift+Period',
        },
        description: 'Open in-page Quick Command Palette',
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    sandbox: {
      pages: ['sandbox-render.html'],
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      sandbox: "sandbox allow-scripts allow-forms allow-popups allow-modals; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob: data:; style-src 'self' 'unsafe-inline' https: blob: data:; font-src 'self' https: data:; img-src 'self' https: data: blob:; connect-src 'self' https:; child-src 'self' blob: data:;",
    },
    web_accessible_resources: [
      {
        resources: ['tailwind.js', 'sandbox-render.html'],
        matches: ['<all_urls>'],
      },
    ],
    host_permissions: [
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api.openai.com/*',
      'https://api.deepseek.com/*',
      'https://open.bigmodel.cn/*',
      'https://api.zhipuai.cn/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      'https://*/*',
      'http://*/*',
    ],
  },
});
