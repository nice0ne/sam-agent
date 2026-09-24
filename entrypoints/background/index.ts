import { listScheduledTasks, syncAllTaskAlarms } from '../../src/services/scheduler';
import { executeScheduledTask } from '../../src/services/scheduler-runner';

export default defineBackground(() => {
  console.log('[SAM-Agent] Background service worker initialized.');

  // Sync scheduled task alarms on startup and installation
  chrome.runtime.onStartup.addListener(() => {
    syncAllTaskAlarms().catch((err) => console.warn('[Scheduler] Startup sync failed:', err));
  });
  chrome.runtime.onInstalled.addListener(() => {
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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['/quick-command.content.js'],
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
  });
});
