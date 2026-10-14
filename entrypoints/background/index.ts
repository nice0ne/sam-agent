import { listScheduledTasks, syncAllTaskAlarms } from '../../src/services/scheduler';
import { executeScheduledTask } from '../../src/services/scheduler-runner';

export function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  const restrictedProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'data:', 'view-source:', 'devtools:'];
  try {
    const parsed = new URL(url);
    if (restrictedProtocols.includes(parsed.protocol)) return true;
    if (parsed.hostname === 'chromewebstore.google.com' || parsed.hostname === 'chrome.google.com') return true;
    return false;
  } catch {
    return true;
  }
}

async function getScriptableActiveTab(specifiedTabId?: number): Promise<{ tab?: chrome.tabs.Tab; error?: string }> {
  let targetTab: chrome.tabs.Tab | undefined;
  if (specifiedTabId) {
    try {
      targetTab = await chrome.tabs.get(specifiedTabId);
    } catch (_) {}
  }
  if (!targetTab) {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    targetTab = tabs[0];
  }
  if (!targetTab) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTab = tabs[0];
  }
  if (!targetTab || !targetTab.id) {
    return { error: 'No active browser tab found. Please focus a web tab and try again.' };
  }

  const url = targetTab.url || '';
  if (isRestrictedUrl(url)) {
    return {
      error: `Cannot run on browser system pages (${url.split('/')[0]}//). Please open a standard website (e.g. google.com or wikipedia.org) and try again.`,
    };
  }

  return { tab: targetTab };
}

export default defineBackground(() => {
  console.log('[SAM-Agent] Background service worker initialized.');

  // Allow content scripts to access chrome.storage.session
  try {
    if (chrome.storage?.session?.setAccessLevel) {
      chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch((err) => {
        console.warn('[SAM-Agent] Failed to set session storage access level:', err);
      });
    }
  } catch (err) {
    console.warn('[SAM-Agent] Error configuring session storage access level:', err);
  }

  // Sync scheduled task alarms on startup and installation
  chrome.runtime.onStartup.addListener(() => {
    try {
      if (chrome.storage?.session?.setAccessLevel) {
        chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});
      }
    } catch (_) {}
    syncAllTaskAlarms().catch((err) => console.warn('[Scheduler] Startup sync failed:', err));
  });
  chrome.runtime.onInstalled.addListener(() => {
    try {
      if (chrome.storage?.session?.setAccessLevel) {
        chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});
      }
    } catch (_) {}
    syncAllTaskAlarms().catch((err) => console.warn('[Scheduler] Install sync failed:', err));
  });

  // Alarm listener for scheduled tasks
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    const tasks = await listScheduledTasks();
    const matchedTask = tasks.find((t) => t.id === alarm.name);
    if (matchedTask && matchedTask.enabled) {
      console.log(`[Background Scheduler] Firing alarm for task '${matchedTask.title}'...`);
      await executeScheduledTask(matchedTask);
    }
  });

  // Listen for extension action click to open sidepanel
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn('Failed to set panel behavior:', err);
  });

  // Handle hotkeys & commands
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-sidebar') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        // @ts-ignore
        chrome.sidePanel?.open({ tabId: tab.id });
      }
    } else if (command === 'quick-command-palette') {
      const { tab } = await getScriptableActiveTab();
      if (tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/quick-command.js'],
        }).catch((err) => {
          console.warn('Failed to inject quick command script:', err);
        });
      }
    }
  });

  // Message router
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'QUICK_COMMAND_SUBMIT') {
      // Store pending message and open sidepanel
      chrome.storage.local.set({
        omniboxPendingMessage: message.prompt,
        omniboxPendingMessageId: crypto.randomUUID(),
      }).then(async () => {
        if (sender.tab?.id) {
          // @ts-ignore
          await chrome.sidePanel?.open({ tabId: sender.tab.id });
        }
      });
      sendResponse({ status: 'ok' });
      return true;
    }

    if (message.type === 'sidepanel-heartbeat') {
      sendResponse({ status: 'alive', timestamp: Date.now() });
      return true;
    }

    if (message.type === 'START_WORKFLOW_RECORDING') {
      (async () => {
        const { tab, error } = await getScriptableActiveTab(message.tabId);
        if (error || !tab?.id) {
          return { status: 'error', message: error || 'Failed to locate tab' };
        }

        await chrome.storage.session?.set({
          active_workflow_recording: {
            tabId: tab.id,
            status: 'recording',
            actions: [],
            initialUrl: tab.url || '',
            startTime: Date.now(),
          },
        });

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/workflow-recorder.js'],
        });

        return { status: 'ok', tabId: tab.id, url: tab.url };
      })().then((res) => {
        sendResponse(res);
      }).catch((err) => {
        console.error('[Background] Failed to start workflow recording:', err);
        sendResponse({ status: 'error', message: err?.message || String(err) });
      });
      return true;
    }

    if (message.type === 'WORKFLOW_RECORDING_FINISH') {
      chrome.storage.session?.set({
        last_finished_workflow: {
          actions: message.actions || [],
          initialUrl: message.initialUrl || '',
          completedAt: Date.now(),
        },
      });
      chrome.runtime.sendMessage({
        type: 'WORKFLOW_RECORDING_READY_FOR_REVIEW',
        actions: message.actions || [],
        initialUrl: message.initialUrl || '',
      }).catch(() => {});
      sendResponse({ status: 'ok' });
      return true;
    }

    if (message.type === 'WORKFLOW_RECORDING_CANCEL') {
      chrome.storage.session?.remove(['active_workflow_recording']).catch(() => {});
      chrome.runtime.sendMessage({ type: 'WORKFLOW_RECORDING_ABORTED' }).catch(() => {});
      sendResponse({ status: 'ok' });
      return true;
    }

    if (message.type === 'START_VISUAL_SCRAPER') {
      (async () => {
        const { tab, error } = await getScriptableActiveTab(message.tabId);
        if (error || !tab?.id) {
          return { status: 'error', message: error || 'Failed to locate tab' };
        }

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/web-scraper.js'],
        });

        return { status: 'ok', tabId: tab.id, url: tab.url };
      })().then((res) => {
        sendResponse(res);
      }).catch((err) => {
        console.error('[Background] Failed to start visual scraper:', err);
        sendResponse({ status: 'error', message: err?.message || String(err) });
      });
      return true;
    }

    if (message.type === 'SCRAPER_OPEN_STUDIO') {
      const resultData = {
        schema: message.schema,
        rows: message.rows || [],
        totalRows: message.rows?.length || 0,
        pagesCrawled: 1,
        url: message.url || '',
        timestamp: Date.now(),
      };
      chrome.storage.session?.set({
        scraper_last_result: resultData,
        last_scraper_result: resultData,
        scraper_session: resultData,
      }).catch(() => {});
      chrome.storage.local?.set({
        sam_persisted_scraper_result: resultData,
      }).catch(() => {});
      chrome.runtime.sendMessage({
        type: 'SCRAPER_OPEN_STUDIO',
        ...resultData,
      }).catch(() => {});
      chrome.runtime.sendMessage({
        type: 'SCRAPER_STUDIO_READY',
        ...resultData,
      }).catch(() => {});

      if (sender.tab?.id) {
        // @ts-ignore
        chrome.sidePanel?.open({ tabId: sender.tab.id }).catch(() => {});
      }
      sendResponse({ status: 'ok' });
      return true;
    }

    if (message.type === 'SCRAPER_CANCEL') {
      chrome.runtime.sendMessage({ type: 'SCRAPER_ABORTED' }).catch(() => {});
      sendResponse({ status: 'ok' });
      return true;
    }
  });
});
