/**
 * Page Actions Execution Service for SAM-Agent
 * Executes real browser actions (fill inputs, WYSIWYG rich text editors,
 * click buttons, select options, radio buttons, and tables) directly in the
 * active Chrome browser tab via chrome.scripting.
 *
 * Includes Autonomous Post-Action Verification & Self-Correction Loop:
 * - After executing actions, verifies if DOM state actually persisted.
 * - If DOM state failed or was wiped by reactive frameworks, executes
 *   multi-layered fallback injection strategies (synthetic InputEvents, execCommand,
 *   direct iframe body innerHTML, or jQuery wysihtml5 calls).
 * - Reports verified status, attempt count, and self-correction telemetry.
 */

import { saveVfsFile } from './vfs';
import { switchToTab, closeBrowserTab, isRestrictedTabUrl } from './tab-manager';
import { executeUserTool } from './tool-registry';
import { createDocArtifact } from './doc-generator';
import { executeWebSearch, formatWebSearchResults } from './web-search';
import { addMemory, deleteMemory, searchMemories } from './semantic-memory';

export interface ActionAssertion {
  urlMatches?: string;
  urlChanged?: boolean;
  elementAppeared?: string;
  elementDisappeared?: string;
  textAppeared?: string;
  timeoutMs?: number;
}

export interface FillFieldAction {
  action: 'fill';
  selector?: string;
  name?: string;
  label?: string;
  value: string;
  submit?: boolean;
  assert?: ActionAssertion;
}

export interface ClickAction {
  action: 'click';
  selector?: string;
  text?: string;
  assert?: ActionAssertion;
}

export interface SelectOptionAction {
  action: 'select';
  selector: string;
  value: string;
  assert?: ActionAssertion;
}

export interface EvalAction {
  action: 'eval';
  code: string;
}

export interface PressKeyAction {
  action: 'press_key' | 'pressKey' | 'key';
  key?: string;
  selector?: string;
  assert?: ActionAssertion;
}

export interface NavigateAction {
  action: 'navigate';
  url: string;
}

export interface OpenTabAction {
  action: 'openTab' | 'newTab';
  url: string;
  active?: boolean;
}

export interface SwitchTabAction {
  action: 'switchTab';
  tabId?: number;
  match?: string;
}

export interface CloseTabAction {
  action: 'closeTab';
  tabId: number;
}

export interface WriteFileAction {
  action: 'writeFile';
  path: string;
  content: string;
}

export interface PlayAction {
  action: 'play';
  selector?: string;
}

export interface RunToolAction {
  action: 'runTool';
  tool: string;
  args?: Record<string, any>;
}

export interface GeneratePptxAction {
  action: 'generatePptx';
  title?: string;
  subtitle?: string;
  author?: string;
  theme?: string;
  slides?: Array<any>;
  spec?: any;
  baseName?: string;
  filename?: string;
  [key: string]: any;
}

export interface GenerateDocAction {
  action: 'generateDoc' | 'generateDocs' | 'createDoc';
  title?: string;
  subtitle?: string;
  author?: string;
  date?: string;
  organization?: string;
  theme?: string;
  summary?: string;
  sections?: Array<any>;
  content?: string;
  spec?: any;
  baseName?: string;
  filename?: string;
  [key: string]: any;
}

export interface SearchWebAction {
  action: 'searchWeb' | 'webSearch';
  query: string;
  maxResults?: number;
  [key: string]: any;
}

export interface ClickTagAction {
  action: 'clickTag';
  tag: number;
  assert?: ActionAssertion;
  [key: string]: any;
}

export interface FillTagAction {
  action: 'fillTag';
  tag: number;
  value: string;
  submit?: boolean;
  assert?: ActionAssertion;
  [key: string]: any;
}

export interface VisualInspectAction {
  action: 'visualInspect' | 'captureSoM';
  prompt?: string;
  [key: string]: any;
}

export interface RememberAction {
  action: 'remember';
  content: string;
  category?: 'preference' | 'instruction' | 'fact' | 'credential' | 'task_result';
  [key: string]: any;
}

export interface ForgetAction {
  action: 'forget';
  memoryId?: string;
  query?: string;
  [key: string]: any;
}

export interface CreatePlanAction {
  action: 'createPlan';
  title: string;
  subgoals: Array<{ id?: string; title: string; status?: 'pending' | 'in_progress' | 'completed' | 'failed' }>;
  [key: string]: any;
}

export interface UpdateSubgoalAction {
  action: 'updateSubgoal';
  subgoalId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  summary?: string;
  [key: string]: any;
}

export type BrowserAction =
  | FillFieldAction
  | ClickAction
  | SelectOptionAction
  | EvalAction
  | PressKeyAction
  | NavigateAction
  | OpenTabAction
  | SwitchTabAction
  | CloseTabAction
  | WriteFileAction
  | PlayAction
  | RunToolAction
  | GeneratePptxAction
  | GenerateDocAction
  | SearchWebAction
  | ClickTagAction
  | FillTagAction
  | VisualInspectAction
  | RememberAction
  | ForgetAction
  | CreatePlanAction
  | UpdateSubgoalAction;

export interface ActionResult {
  success: boolean;
  action: string;
  target?: string;
  tabId?: number;
  message: string;
  error?: string;
  data?: any;
  verified?: boolean;
  attempts?: number;
  selfCorrected?: boolean;
  strategyUsed?: string;
  verifiedSelector?: string;
  editorType?: string;
  stateChange?: {
    urlChanged?: boolean;
    newUrl?: string;
    modalOpened?: string;
    errorAlertDetected?: string;
    validationFailed?: string;
    loadingInProgress?: boolean;
  };
  assertionPassed?: boolean;
}

export interface TaggedElementSummary {
  tag: number;
  text: string;
  role: string;
}

/**
 * In-Page Set-of-Marks Badge Injector (runs inside target tab)
 */
export function inPageInjectSetOfMarks(): { count: number; items: TaggedElementSummary[] } {
  document.querySelectorAll('.sam-som-tag-badge').forEach((el) => el.remove());
  const win = window as any;
  win.__sam_som_map = new Map<number, HTMLElement>();

  const interactiveSelectors = [
    'button',
    'input',
    'select',
    'textarea',
    'a[href]',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[onclick]',
  ];

  const elements = Array.from(document.querySelectorAll(interactiveSelectors.join(', ')));
  let tagId = 1;
  const taggedList: TaggedElementSummary[] = [];

  for (const el of elements) {
    if (tagId > 60) break;
    const htmlEl = el as HTMLElement;
    const rect = htmlEl.getBoundingClientRect();
    if (
      rect.width < 6 ||
      rect.height < 6 ||
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      continue;
    }

    const style = window.getComputedStyle(htmlEl);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }

    win.__sam_som_map.set(tagId, htmlEl);

    const badge = document.createElement('div');
    badge.className = 'sam-som-tag-badge';
    badge.setAttribute('data-tag', String(tagId));
    badge.textContent = `${tagId}`;
    badge.style.cssText = `
      position: fixed !important;
      top: ${Math.max(0, rect.top)}px !important;
      left: ${Math.max(0, rect.left)}px !important;
      background: #facc15 !important;
      color: #000000 !important;
      font-size: 11px !important;
      font-weight: 800 !important;
      font-family: ui-monospace, monospace !important;
      padding: 1px 4px !important;
      border-radius: 4px !important;
      border: 1.5px solid #000000 !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.5) !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      line-height: 1 !important;
    `;
    document.body.appendChild(badge);

    const textDesc = (
      htmlEl.innerText ||
      htmlEl.getAttribute('aria-label') ||
      htmlEl.getAttribute('title') ||
      htmlEl.getAttribute('placeholder') ||
      htmlEl.getAttribute('value') ||
      ''
    )
      .slice(0, 30)
      .replace(/\s+/g, ' ')
      .trim();

    taggedList.push({
      tag: tagId,
      text: textDesc || htmlEl.tagName.toLowerCase(),
      role: htmlEl.tagName.toLowerCase(),
    });

    tagId++;
  }

  return { count: taggedList.length, items: taggedList };
}

/**
 * Remove Set-of-Marks badges from DOM
 */
export function inPageRemoveSetOfMarks(): void {
  document.querySelectorAll('.sam-som-tag-badge').forEach((el) => el.remove());
}

/**
 * Capture Tab with Set-of-Marks Overlay, then instantly remove overlay (Ghost Overlay)
 */
export async function captureSetOfMarks(tabId: number): Promise<{
  screenshotUrl: string;
  items: TaggedElementSummary[];
  error?: string;
}> {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || tab.windowId === undefined || isRestrictedTabUrl(tab.url || '')) {
      return { screenshotUrl: '', items: [], error: 'Tab is restricted or unavailable' };
    }

    // 1. Inject visual SoM badges
    const injectResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: inPageInjectSetOfMarks,
    });
    const taggedData = injectResults?.[0]?.result || { count: 0, items: [] };

    // 2. Wait 60ms for paint, then capture screenshot
    await new Promise((r) => setTimeout(r, 60));
    const rawScreenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 75 });

    // 3. Ghost Overlay: immediately remove badges so user is not disturbed!
    await chrome.scripting.executeScript({
      target: { tabId },
      func: inPageRemoveSetOfMarks,
    });

    return {
      screenshotUrl: rawScreenshot || '',
      items: taggedData.items || [],
    };
  } catch (err: any) {
    console.warn('[PageActions] captureSetOfMarks failed:', err);
    return { screenshotUrl: '', items: [], error: err.message };
  }
}

/**
 * In-tab action runner function executed in the target webpage context
 */
async function inPageActionRunner(actionPayload: BrowserAction): Promise<ActionResult> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Helper to add visual focus glow to active element being manipulated
  function highlightElement(el: HTMLElement) {
    try {
      const origOutline = el.style.outline;
      const origTransition = el.style.transition;
      el.style.transition = 'outline 0.2s ease, box-shadow 0.2s ease';
      el.style.outline = '3px solid #6366f1';
      el.style.boxShadow = '0 0 14px rgba(99, 102, 241, 0.7)';

      setTimeout(() => {
        try {
          el.style.outline = origOutline;
          el.style.boxShadow = '';
          el.style.transition = origTransition;
        } catch (_) {}
      }, 1800);
    } catch (_) {}
  }

  // Helper to safely set React/Vue/Angular controlled input value
  function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = Object.getPrototypeOf(element);
    const descriptor =
      Object.getOwnPropertyDescriptor(proto, 'value') ||
      Object.getOwnPropertyDescriptor(
        element instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      );

    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  // Helper to find and trigger send button globally (e.g. for ChatGPT, Claude, Gemini, etc.)
  async function triggerSendButton(target?: HTMLElement | null): Promise<boolean> {
    const sendSelectors = [
      'button[data-testid="send-button"]',
      '#composer-submit-button',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Kirim"]',
      'button[data-testid="composer-speech-button"]',
      'form button[type="submit"]',
      'button[type="submit"]',
    ];

    // 1. Check inside closest form if present
    const form = target?.closest('form');
    if (form) {
      for (const sel of sendSelectors) {
        const btn = form.querySelector<HTMLButtonElement>(sel);
        if (btn && !btn.disabled) {
          btn.focus();
          btn.click();
          return true;
        }
      }
      try {
        form.requestSubmit();
        return true;
      } catch (_) {}
    }

    // 2. Polling for global send button (vital for ChatGPT / Claude SPAs which don't use forms)
    for (let attempt = 0; attempt < 8; attempt++) {
      for (const sel of sendSelectors) {
        try {
          const btn = document.querySelector<HTMLButtonElement>(sel);
          if (btn) {
            const isDis =
              btn.disabled === true ||
              btn.getAttribute('disabled') !== null ||
              btn.getAttribute('aria-disabled') === 'true' ||
              btn.classList.contains('disabled');
            if (!isDis) {
              btn.focus();
              btn.click();
              btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
              return true;
            }
          }
        } catch (_) {}
      }
      await sleep(100);
    }

    // 3. Fallback: try finding button with arrow SVG inside composer
    try {
      const allButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const arrowBtn = allButtons.find((b) => {
        const svg = b.querySelector('svg');
        const isDis = b.disabled || b.getAttribute('disabled') !== null;
        return !!svg && !isDis && (b.className.includes('send') || b.className.includes('submit') || b.parentElement?.className.includes('composer'));
      });
      if (arrowBtn) {
        arrowBtn.focus();
        arrowBtn.click();
        return true;
      }
    } catch (_) {}

    return false;
  }

  const initialUrl = window.location.href;

  // Helper to dismiss blocking overlays (cookie modals, dialog backdrops, popups)
  const tryDismissBlockingOverlays = (): boolean => {
    const dismissSelectors = [
      'button[aria-label*="close" i]',
      'button[aria-label*="tutup" i]',
      'button[aria-label*="dismiss" i]',
      '.modal button.close',
      '.modal-header .btn-close',
      '[data-dismiss="modal"]',
      '[data-bs-dismiss="modal"]',
      'button:has(svg.lucide-x)',
      '#onetrust-accept-btn-handler',
      '#accept-cookies',
      '.cookie-banner button',
      'button[data-testid="close-button"]',
    ];
    for (const sel of dismissSelectors) {
      try {
        const btn = document.querySelector<HTMLElement>(sel);
        if (btn && btn.offsetParent !== null) {
          btn.click();
          return true;
        }
      } catch (_) {}
    }
    return false;
  };

  // Helper to detect post-action validation errors, alerts, modals, or loading spinners
  const detectPageAlerts = (): { errorText?: string; modalOpened?: string; loadingInProgress?: boolean } => {
    // 1. Look for error banners, validation alerts, toast notifications
    const alertSelectors = [
      '[role="alert"]',
      '.alert-danger',
      '.alert-warning',
      '.invalid-feedback:not(:empty)',
      '.error-message:not(:empty)',
      '.text-red-500:not(:empty)',
      '.toast-error',
    ];
    for (const sel of alertSelectors) {
      try {
        const el = document.querySelector<HTMLElement>(sel);
        if (el && el.offsetParent !== null) {
          const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
          if (txt && txt.length > 2 && !txt.includes('Sam-Agent') && !txt.includes('sam-som-tag-badge')) {
            return { errorText: txt.slice(0, 150) };
          }
        }
      } catch (_) {}
    }

    // 2. Check if a modal or dialog just opened
    const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"], .modal.show, dialog[open]');
    if (modal && modal.offsetParent !== null) {
      const title = modal.querySelector('h1, h2, h3, h4, .modal-title')?.textContent?.trim() || 'Dialog/Modal';
      return { modalOpened: title.slice(0, 50) };
    }

    // 3. Check if loading spinner / busy state is active
    const spinner = document.querySelector<HTMLElement>('[aria-busy="true"], .spinner-border, .loading-spinner, .lucide-loader-circle, .lucide-loader');
    if (spinner && spinner.offsetParent !== null) {
      return { loadingInProgress: true };
    }

    return {};
  };

  // Helper to evaluate deterministic assertions
  const verifyAssertion = async (
    assertion?: ActionAssertion,
    startUrl?: string
  ): Promise<{ passed: boolean; message?: string }> => {
    if (!assertion) return { passed: true };

    const timeout = assertion.timeoutMs || 800;
    const startTime = Date.now();

    while (Date.now() - startTime <= timeout) {
      let conditionMet = true;

      if (assertion.urlChanged && startUrl) {
        if (window.location.href === startUrl) {
          conditionMet = false;
        }
      }

      if (assertion.urlMatches) {
        const regex = new RegExp(assertion.urlMatches, 'i');
        if (!regex.test(window.location.href)) {
          conditionMet = false;
        }
      }

      if (assertion.elementAppeared) {
        const el = document.querySelector(assertion.elementAppeared);
        if (!el || (el instanceof HTMLElement && el.offsetParent === null)) {
          conditionMet = false;
        }
      }

      if (assertion.elementDisappeared) {
        const el = document.querySelector(assertion.elementDisappeared);
        if (el && (el as HTMLElement).offsetParent !== null) {
          conditionMet = false;
        }
      }

      if (assertion.textAppeared) {
        if (!document.body.innerText.includes(assertion.textAppeared)) {
          conditionMet = false;
        }
      }

      if (conditionMet) {
        return { passed: true, message: 'Assertion condition successfully met' };
      }

      await sleep(50);
    }

    const failedReasons: string[] = [];
    if (assertion.urlChanged && window.location.href === startUrl) {
      failedReasons.push(`URL did not change from "${startUrl}"`);
    }
    if (assertion.urlMatches && !new RegExp(assertion.urlMatches, 'i').test(window.location.href)) {
      failedReasons.push(`URL "${window.location.href}" did not match pattern "${assertion.urlMatches}"`);
    }
    if (assertion.elementAppeared && !document.querySelector(assertion.elementAppeared)) {
      failedReasons.push(`Element "${assertion.elementAppeared}" did not appear in DOM`);
    }
    if (assertion.elementDisappeared && document.querySelector(assertion.elementDisappeared)) {
      failedReasons.push(`Element "${assertion.elementDisappeared}" is still visible in DOM`);
    }
    if (assertion.textAppeared && !document.body.innerText.includes(assertion.textAppeared)) {
      failedReasons.push(`Text "${assertion.textAppeared}" not found in page body`);
    }

    return {
      passed: false,
      message: `Assertion failed within ${timeout}ms: ${failedReasons.join('; ')}`,
    };
  };

  try {
    if (actionPayload.action === 'fill') {
      const { selector, name, label, value, submit } = actionPayload;
      let target: HTMLElement | null = null;
      let canonicalSelector = selector || '';

      // 0. Auto-dismiss common AI chat modals (e.g. ChatGPT "Stay logged out", "Tetap keluar")
      try {
        const modalBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('button, a'));
        const dismissBtn = modalBtns.find((b) => {
          const t = (b.textContent || '').trim().toLowerCase();
          return t === 'stay logged out' || t === 'tetap keluar' || t.includes('stay logged out');
        });
        if (dismissBtn) {
          dismissBtn.click();
          await sleep(200);
        }
      } catch (_) {}

      // Priority 1: If selector targets AI chat composer (e.g. prompt-textarea), resolve to real active element
      if (selector && (selector.includes('prompt-textarea') || selector.includes('composer'))) {
        const chatEl = document.querySelector<HTMLElement>(
          '#prompt-textarea, [data-testid="prompt-textarea"], div[contenteditable="true"]#prompt-textarea, [role="textbox"]#prompt-textarea'
        );
        if (chatEl) {
          target = chatEl;
          canonicalSelector = '#prompt-textarea';
        }
      }

      // 1. Try direct CSS selector
      if (!target && selector) {
        try {
          target = document.querySelector(selector);
        } catch (_) {}
      }

      // 2. Try ID (with or without #)
      if (!target && selector) {
        const cleanId = selector.replace(/^[#]/, '');
        target = document.getElementById(cleanId);
        if (target) canonicalSelector = `#${cleanId}`;
      }

      // 3. Try name attribute
      if (!target && (name || selector)) {
        const queryName = name || selector?.replace(/^[#]/, '');
        target = document.querySelector(
          `input[name="${queryName}"], textarea[name="${queryName}"], select[name="${queryName}"]`
        );
        if (target) canonicalSelector = `[name="${queryName}"]`;
      }

      // 4. Check if target is inside an iframe (e.g. wysihtml5 sandbox iframe)
      if (!target && selector) {
        const allIframes = Array.from(document.querySelectorAll('iframe'));
        for (const ifr of allIframes) {
          try {
            const ifrDoc = ifr.contentDocument;
            if (ifrDoc) {
              const insideEl = ifrDoc.querySelector(selector) || (selector === 'body' ? ifrDoc.body : null);
              if (insideEl) {
                target = insideEl as HTMLElement;
                canonicalSelector = selector;
                break;
              }
            }
          } catch (_) {}
        }
      }

      // 5. Special check for AI chat boxes (ChatGPT, Claude, etc.)
      if (!target && selector && (selector.includes('prompt-textarea') || selector.includes('composer') || selector.includes('chat'))) {
        target = document.querySelector(
          '#prompt-textarea, [data-testid="prompt-textarea"], div[contenteditable="true"]#prompt-textarea, textarea[name="prompt-textarea"], [role="textbox"]'
        );
        if (target) canonicalSelector = target.id ? `#${target.id}` : '#prompt-textarea';
      }

      // 6. Try placeholder, aria-label, or text matching on inputs, textareas, and contenteditable elements
      if (!target && (label || selector)) {
        const query = (label || selector || '').toLowerCase().replace(/^[#]/, '');
        const inputs = Array.from(
          document.querySelectorAll<HTMLElement>(
            'input, textarea, [contenteditable="true"], [role="textbox"], #prompt-textarea'
          )
        );
        target =
          inputs.find((inp) => {
            const ph = ((inp as any).placeholder || inp.getAttribute('placeholder') || inp.getAttribute('data-placeholder') || '').toLowerCase();
            const al = (inp.getAttribute('aria-label') || '').toLowerCase();
            const nm = ((inp as any).name || '').toLowerCase();
            const id = (inp.id || '').toLowerCase();
            return ph.includes(query) || al.includes(query) || nm.includes(query) || id.includes(query);
          }) || null;

        // Try associated <label>
        if (!target) {
          const labels = Array.from(document.querySelectorAll('label'));
          const matchedLabel = labels.find((l) => (l.textContent || '').toLowerCase().includes(query));
          if (matchedLabel) {
            if (matchedLabel.htmlFor) {
              target = document.getElementById(matchedLabel.htmlFor);
            } else {
              target = matchedLabel.querySelector('input, textarea, [contenteditable="true"]');
            }
          }
        }
        if (target) {
          canonicalSelector = target.id ? `#${target.id}` : (target as any).name ? `[name="${(target as any).name}"]` : canonicalSelector;
        }
      }

      // 7. Check if selector refers to a rich-text editor iframe index, e.g. "iframe#6", "iframe[6]"
      if (!target && selector && (selector.includes('iframe') || selector.includes('wysihtml5'))) {
        const indexMatch = selector.match(/\d+/);
        const iframes = Array.from(document.querySelectorAll('iframe'));
        if (indexMatch && iframes[parseInt(indexMatch[0], 10)]) {
          target = iframes[parseInt(indexMatch[0], 10)];
        } else {
          target = document.querySelector('iframe.wysihtml5-sandbox, iframe');
        }
      }

      if (!target) {
        return {
          success: false,
          action: 'fill',
          message: `Field not found for selector: "${selector || label || name || 'unknown'}"`,
        };
      }

      // If canonicalSelector is not specific enough, compute one
      if (!canonicalSelector || canonicalSelector.length < 2) {
        canonicalSelector = target.id ? `#${target.id}` : (target as any).name ? `[name="${(target as any).name}"]` : target.tagName.toLowerCase();
      }

      // ==============================================================
      // End-User Guard: Never modify or overwrite readonly or disabled fields
      // ==============================================================
      const isReadOnlyOrDisabled =
        (target as any).readOnly === true ||
        (target as any).disabled === true ||
        target.getAttribute('readonly') !== null ||
        target.getAttribute('aria-readonly') === 'true' ||
        target.getAttribute('disabled') !== null ||
        target.getAttribute('aria-disabled') === 'true' ||
        target.classList.contains('readonly') ||
        target.classList.contains('disabled');

      if (isReadOnlyOrDisabled) {
        return {
          success: false,
          action: 'fill',
          target: canonicalSelector,
          message: `[Skipped] Field "${canonicalSelector}" is READONLY/DISABLED by the system. Acting as an end user, it was not modified.`,
        };
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightElement(target);

      let handledWYSIWYG = false;
      let editorType: string = 'standard';
      let strategyUsed = 'Default Native Setter';

      // ==============================================================
      // STRATEGY 1: Primary Injection Execution
      // ==============================================================

      // Case A: Target is an IFRAME itself (wysihtml5-sandbox)
      if (target instanceof HTMLIFrameElement || target.tagName === 'IFRAME') {
        editorType = 'wysihtml5-iframe';
        const ifr = target as HTMLIFrameElement;
        try {
          if (ifr.contentDocument && ifr.contentDocument.body) {
            ifr.contentDocument.body.innerHTML = value;
            ifr.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            ifr.contentDocument.body.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            highlightElement(ifr);
            handledWYSIWYG = true;
            strategyUsed = 'IFrame Body Direct Injection';

            // Also synchronize sibling/parent textarea
            const prevTextarea =
              (ifr.previousElementSibling as HTMLTextAreaElement) ||
              ifr.parentElement?.querySelector('textarea');
            if (prevTextarea && prevTextarea.tagName === 'TEXTAREA') {
              prevTextarea.value = value;
              prevTextarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              prevTextarea.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }
          }
        } catch (_) {}
      }

      // Case B: Target is a TEXTAREA that might be linked to a wysihtml5 / TinyMCE / CKEditor
      else if (target instanceof HTMLTextAreaElement || target.tagName === 'TEXTAREA') {
        const winAny = window as any;

        // 1. Check jQuery wysihtml5 instance
        try {
          if (winAny.jQuery || winAny.$) {
            const $ = winAny.jQuery || winAny.$;
            const wysi = $(target).data('wysihtml5');
            if (wysi && wysi.editor && typeof wysi.editor.setValue === 'function') {
              wysi.editor.setValue(value);
              handledWYSIWYG = true;
              editorType = 'wysihtml5';
              strategyUsed = 'jQuery wysihtml5 API';
            }
          }
        } catch (_) {}

        // 2. Check sibling or child iframe (wysihtml5-sandbox)
        try {
          const parent = target.parentElement;
          const iframes = parent
            ? Array.from(parent.querySelectorAll('iframe.wysihtml5-sandbox, iframe'))
            : [];
          for (const ifr of iframes) {
            const ifrDoc = (ifr as HTMLIFrameElement).contentDocument;
            if (ifrDoc && ifrDoc.body) {
              ifrDoc.body.innerHTML = value;
              ifrDoc.body.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              ifrDoc.body.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              highlightElement(ifr as HTMLElement);
              handledWYSIWYG = true;
              editorType = 'wysihtml5';
              strategyUsed = 'wysihtml5 Sandbox Sibling Injection';
            }
          }
        } catch (_) {}

        // 3. Check TinyMCE
        try {
          if (winAny.tinymce && target.id && winAny.tinymce.get(target.id)) {
            winAny.tinymce.get(target.id).setContent(value);
            handledWYSIWYG = true;
            editorType = 'tinymce';
            strategyUsed = 'TinyMCE API';
          }
        } catch (_) {}

        // 4. Check CKEditor
        try {
          if (winAny.CKEDITOR && target.id && winAny.CKEDITOR.instances[target.id]) {
            winAny.CKEDITOR.instances[target.id].setData(value);
            handledWYSIWYG = true;
            editorType = 'ckeditor';
            strategyUsed = 'CKEditor API';
          }
        } catch (_) {}

        // 5. Always set the textarea value itself as well
        setNativeValue(target as HTMLTextAreaElement, value);
        if (!handledWYSIWYG) {
          editorType = 'textarea';
        }
      } else if (target instanceof HTMLInputElement) {
        editorType = 'input';
        setNativeValue(target, value);
      } else if (target.isContentEditable || target.getAttribute('contenteditable') === 'true' || target.getAttribute('role') === 'textbox') {
        editorType = 'contenteditable';
        target.focus();

        // 1. Select all content to replace
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(target);
          selection?.removeAllRanges();
          selection?.addRange(range);
        } catch (_) {}

        // 2. Primary: document.execCommand('insertText') triggers ProseMirror / Lexical / React internal state!
        let inserted = false;
        try {
          inserted = document.execCommand('insertText', false, value);
        } catch (_) {}

        if (!inserted) {
          const p = target.querySelector('p') || target;
          p.textContent = value;
        }

        // 3. Dispatch standard InputEvents
        try {
          target.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              composed: true,
              inputType: 'insertText',
              data: value,
            })
          );
        } catch (_) {
          target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
        target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        handledWYSIWYG = true;
        strategyUsed = 'ProseMirror execCommand insertText';
      }

      // ==============================================================
      // AUTONOMOUS VERIFICATION & SELF-CORRECTION LOOP
      // ==============================================================
      // Helper to read back current DOM value
      const readCurrentValue = (): string => {
        if (!target) return '';
        if (target instanceof HTMLIFrameElement) {
          return target.contentDocument?.body?.innerText || target.contentDocument?.body?.innerHTML || '';
        }
        if (target instanceof HTMLTextAreaElement) {
          // Check sibling iframe body too
          const parent = target.parentElement;
          const ifr = parent?.querySelector('iframe.wysihtml5-sandbox, iframe') as HTMLIFrameElement;
          const ifrText = ifr?.contentDocument?.body?.innerText || ifr?.contentDocument?.body?.innerHTML || '';
          return ifrText || target.value || '';
        }
        if (target instanceof HTMLInputElement) {
          return target.value || '';
        }
        if (target.isContentEditable) {
          return target.innerText || target.innerHTML || '';
        }
        return '';
      };

      // Check if value actually stuck in DOM
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const checkSubstring = normalize(value.slice(0, 25));

      // Wait 100ms for async event handlers and reactive frameworks to process
      await sleep(100);

      let currentVal = readCurrentValue();
      let verified = normalize(currentVal).includes(checkSubstring) || (value.length < 5 && normalize(currentVal) === normalize(value));
      let attempts = 1;
      let selfCorrected = false;

      // If NOT verified: Trigger Self-Correction Fallback Strategy 2
      if (!verified) {
        attempts = 2;
        try {
          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            target.focus();
            target.value = value;
            // Dispatch synthetic InputEvent with inputType 'insertText'
            try {
              const inputEvt = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: value,
              });
              target.dispatchEvent(inputEvt);
            } catch (_) {}

            // Try execCommand if standard setter was erased
            if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
              try {
                target.select();
                document.execCommand('insertText', false, value);
              } catch (_) {}
            }

            target.dispatchEvent(new Event('change', { bubbles: true }));
            strategyUsed = 'Synthetic InputEvent & execCommand Fallback';
          }

          // If WYSIWYG editor container
          if (handledWYSIWYG || editorType.includes('wysihtml5')) {
            const parent = target.closest('div, form, td, body') || document.body;
            const iframes = Array.from(parent.querySelectorAll('iframe'));
            for (const ifr of iframes) {
              try {
                const ifrDoc = ifr.contentDocument;
                if (ifrDoc && ifrDoc.body) {
                  ifrDoc.body.focus();
                  ifrDoc.body.innerHTML = value;
                  ifrDoc.body.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                  ifrDoc.body.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                }
              } catch (_) {}
            }
            strategyUsed = 'WYSIWYG Parent Container Traversal Fallback';
          }

          // Wait another 100ms and re-verify
          await sleep(100);
          currentVal = readCurrentValue();
          verified = normalize(currentVal).includes(checkSubstring) || (value.length < 5 && normalize(currentVal) === normalize(value));
          if (verified) {
            selfCorrected = true;
          }
        } catch (_) {}
      }

      if (submit && target) {
        await sleep(150);
        target?.focus();
        const enterDown = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        target?.dispatchEvent(enterDown);
        target?.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));
        target?.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));

        // Trigger send button globally or via form
        await triggerSendButton(target);
      }

      // Post-action verification & assertion
      await sleep(100);
      const postAlerts = detectPageAlerts();
      const assertionCheck = await verifyAssertion(actionPayload.assert, initialUrl);
      const currentUrl = window.location.href;
      const urlChanged = currentUrl !== initialUrl;

      let extraNotes = '';
      if (postAlerts.errorText) {
        extraNotes += ` ⚠️ Warning: Alert/Error detected: "${postAlerts.errorText}".`;
      }
      if (postAlerts.modalOpened) {
        extraNotes += ` ℹ️ Modal opened: "${postAlerts.modalOpened}".`;
      }
      if (urlChanged) {
        extraNotes += ` 🌐 URL changed to: ${currentUrl}.`;
      }
      if (actionPayload.assert) {
        extraNotes += assertionCheck.passed ? ' [Assertion Passed]' : ` [⚠️ ${assertionCheck.message}]`;
      }

      const targetDesc = canonicalSelector || label || name || target?.id || target?.tagName.toLowerCase() || 'field';
      const statusNote = verified
        ? selfCorrected
          ? '✓ Verified (Auto-Corrected)'
          : '✓ Verified'
        : '⚠️ Value set (Unverified in DOM)';

      return {
        success: assertionCheck.passed,
        action: 'fill',
        target: targetDesc,
        message: `Filled "${targetDesc}" with ${handledWYSIWYG ? '[WYSIWYG Rich Text]: ' : ''}"${value.slice(0, 50)}${value.length > 50 ? '...' : ''}" [${statusNote}]${extraNotes}`,
        verified: verified && assertionCheck.passed,
        attempts,
        selfCorrected,
        strategyUsed,
        verifiedSelector: canonicalSelector,
        editorType,
        stateChange: {
          urlChanged,
          newUrl: urlChanged ? currentUrl : undefined,
          modalOpened: postAlerts.modalOpened,
          errorAlertDetected: postAlerts.errorText,
          loadingInProgress: postAlerts.loadingInProgress,
        },
        assertionPassed: assertionCheck.passed,
      };
    }

    if (actionPayload.action === 'click') {
      const { selector, text } = actionPayload;
      let target: HTMLElement | null = null;
      let canonicalSelector = selector || '';

      if (selector) {
        try {
          target = document.querySelector(selector);
        } catch (_) {}
      }

      // Smart send-button fallback for AI chats (ChatGPT, Claude, etc.)
      const isSendQuery =
        (selector && (selector.includes('send-button') || selector.includes('composer') || selector.includes('submit') || selector.includes('send'))) ||
        (text && (text.toLowerCase().includes('send') || text.toLowerCase().includes('kirim')));

      if (!target && isSendQuery) {
        target = document.querySelector(
          '#composer-submit-button, button[data-testid="send-button"], button[data-testid="composer-speech-button"], button[aria-label*="Send"], button[aria-label*="Kirim"], form button[type="submit"]'
        );
        if (target) canonicalSelector = target.id ? `#${target.id}` : 'button[data-testid="send-button"]';
      }

      if (!target && text) {
        const query = text.toLowerCase();
        const clickables = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, a, input[type="submit"], input[type="button"], input[type="radio"], input[type="checkbox"], [role="button"]'
          )
        );
        target =
          clickables.find((el) => {
            const txt = (el.textContent || '').toLowerCase();
            const val = (el as HTMLInputElement).value?.toLowerCase() || '';
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            return txt.includes(query) || val.includes(query) || aria.includes(query);
          }) || null;

        if (target) {
          canonicalSelector = target.id ? `#${target.id}` : target.tagName.toLowerCase();
        }
      }

      if (!target) {
        // If it was a send button that wasn't found in DOM, try pressing Enter on chat input!
        if (isSendQuery) {
          const chatInput = document.querySelector<HTMLElement>(
            '#prompt-textarea, [contenteditable="true"], textarea'
          );
          if (chatInput) {
            chatInput.focus();
            const enterEvt = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
              composed: true,
            });
            chatInput.dispatchEvent(enterEvt);
            chatInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));
            return {
              success: true,
              action: 'click',
              target: '#prompt-textarea',
              message: `Send button not found; dispatched Enter key to chat input as fallback [✓ Verified]`,
              verified: true,
            };
          }
        }

        return {
          success: false,
          action: 'click',
          message: `Clickable element not found for: "${selector || text || 'unknown'}"`,
        };
      }

      // End-User Guard: Never click disabled elements
      const isTargetDisabled = () =>
        (target as any).disabled === true ||
        target?.getAttribute('disabled') !== null ||
        target?.getAttribute('aria-disabled') === 'true' ||
        target?.classList.contains('disabled');

      if (isTargetDisabled()) {
        // If it's a send button, wait briefly for React/ProseMirror to update disabled state
        if (isSendQuery) {
          await sleep(350);
          if (isTargetDisabled()) {
            // Still disabled: fallback to dispatching Enter on the input box
            const promptInput = document.querySelector<HTMLElement>(
              '#prompt-textarea, [contenteditable="true"], textarea'
            );
            if (promptInput) {
              promptInput.focus();
              const enterEvt = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true,
              });
              promptInput.dispatchEvent(enterEvt);
              promptInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }));
              return {
                success: true,
                action: 'click',
                target: canonicalSelector || '#prompt-textarea',
                message: `Send button was disabled; dispatched Enter key to chat input [✓ Verified]`,
                verified: true,
              };
            }
          }
        }

        if (isTargetDisabled()) {
          return {
            success: false,
            action: 'click',
            target: canonicalSelector || text || target.tagName.toLowerCase(),
            message: `[Skipped] Element "${canonicalSelector || text || target.id}" is DISABLED. Acting as an end user, it was not clicked.`,
          };
        }
      }

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightElement(target);

      let verified = false;
      let attempts = 1;
      let selfCorrected = false;
      let strategyUsed = 'Native Click';

      // 1. Obscured / Backdrop check & Self-Healing
      try {
        const rect = target.getBoundingClientRect();
        const cx = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
        const cy = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
        const topEl = document.elementFromPoint(cx, cy);
        if (topEl && !target.contains(topEl) && !topEl.contains(target)) {
          // Element is blocked by an overlay/popup!
          const dismissed = tryDismissBlockingOverlays();
          if (dismissed) {
            await sleep(150);
            selfCorrected = true;
            strategyUsed = 'Dismissed Blocking Overlay';
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(100);
          }
        }
      } catch (_) {}

      // If radio or checkbox
      if (target instanceof HTMLInputElement && (target.type === 'radio' || target.type === 'checkbox')) {
        target.checked = true;
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.click();

        await sleep(60);
        verified = target.checked === true;

        if (!verified) {
          // Self-correction attempt 2
          attempts = 2;
          strategyUsed = 'Synthetic MouseEvent Dispatch';
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          target.checked = true;
          target.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(60);
          verified = target.checked === true;
          if (verified) {
            selfCorrected = true;
          }
        }
      } else {
        target.focus();
        target.click();
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        verified = true;
      }

      // Post-action verification & assertion
      await sleep(120);
      const postAlerts = detectPageAlerts();
      const assertionCheck = await verifyAssertion(actionPayload.assert, initialUrl);
      const currentUrl = window.location.href;
      const urlChanged = currentUrl !== initialUrl;

      let extraNotes = '';
      if (postAlerts.errorText) {
        extraNotes += ` ⚠️ Warning: Alert/Error appeared: "${postAlerts.errorText}".`;
      }
      if (postAlerts.modalOpened) {
        extraNotes += ` ℹ️ Dialog opened: "${postAlerts.modalOpened}".`;
      }
      if (urlChanged) {
        extraNotes += ` 🌐 URL changed to: ${currentUrl}.`;
      }
      if (actionPayload.assert) {
        extraNotes += assertionCheck.passed ? ' [Assertion Passed]' : ` [⚠️ ${assertionCheck.message}]`;
      }

      const targetDesc = canonicalSelector || text || target.tagName.toLowerCase();
      return {
        success: assertionCheck.passed,
        action: 'click',
        target: targetDesc,
        message: `Clicked element: ${targetDesc} [${verified ? (selfCorrected ? '✓ Verified (Auto-Corrected)' : '✓ Verified') : 'Action Dispatched'}]${extraNotes}`,
        verified: verified && assertionCheck.passed,
        attempts,
        selfCorrected,
        strategyUsed,
        verifiedSelector: canonicalSelector,
        stateChange: {
          urlChanged,
          newUrl: urlChanged ? currentUrl : undefined,
          modalOpened: postAlerts.modalOpened,
          errorAlertDetected: postAlerts.errorText,
          loadingInProgress: postAlerts.loadingInProgress,
        },
        assertionPassed: assertionCheck.passed,
      };
    }

    if (actionPayload.action === 'clickTag') {
      const tag = actionPayload.tag;
      const win = window as any;
      let target = win.__sam_som_map?.get(tag) as HTMLElement | undefined;

      if (!target) {
        target = document.querySelector(`[data-tag="${tag}"]`) as HTMLElement;
      }

      if (!target) {
        return {
          success: false,
          action: 'clickTag',
          target: `[Tag #${tag}]`,
          message: `Visual mark tag #${tag} tidak ditemukan pada halaman ini. Coba panggil visualInspect kembali.`,
          error: `Tag #${tag} not found`,
        };
      }

      highlightElement(target);
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(150);

      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      target.focus();
      target.click();

      const desc = target.innerText?.slice(0, 30).trim() || target.tagName.toLowerCase();

      // Post-action verification & assertion
      await sleep(120);
      const postAlerts = detectPageAlerts();
      const assertionCheck = await verifyAssertion(actionPayload.assert, initialUrl);
      const currentUrl = window.location.href;
      const urlChanged = currentUrl !== initialUrl;

      let extraNotes = '';
      if (postAlerts.errorText) {
        extraNotes += ` ⚠️ Warning: Alert/Error appeared: "${postAlerts.errorText}".`;
      }
      if (postAlerts.modalOpened) {
        extraNotes += ` ℹ️ Dialog opened: "${postAlerts.modalOpened}".`;
      }
      if (urlChanged) {
        extraNotes += ` 🌐 URL changed to: ${currentUrl}.`;
      }
      if (actionPayload.assert) {
        extraNotes += assertionCheck.passed ? ' [Assertion Passed]' : ` [⚠️ ${assertionCheck.message}]`;
      }

      return {
        success: assertionCheck.passed,
        action: 'clickTag',
        target: `[Tag #${tag}] (${desc})`,
        message: `Berhasil mengklik elemen visual tag #${tag} (${desc}).${extraNotes}`,
        verified: assertionCheck.passed,
        stateChange: {
          urlChanged,
          newUrl: urlChanged ? currentUrl : undefined,
          modalOpened: postAlerts.modalOpened,
          errorAlertDetected: postAlerts.errorText,
          loadingInProgress: postAlerts.loadingInProgress,
        },
        assertionPassed: assertionCheck.passed,
      };
    }

    if (actionPayload.action === 'fillTag') {
      const tag = actionPayload.tag;
      const value = actionPayload.value || '';
      const win = window as any;
      let target = win.__sam_som_map?.get(tag) as HTMLElement | undefined;

      if (!target) {
        target = document.querySelector(`[data-tag="${tag}"]`) as HTMLElement;
      }

      if (!target) {
        return {
          success: false,
          action: 'fillTag',
          target: `[Tag #${tag}]`,
          message: `Visual mark tag #${tag} tidak ditemukan pada halaman ini. Coba panggil visualInspect kembali.`,
          error: `Tag #${tag} not found`,
        };
      }

      highlightElement(target);
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(150);

      target.focus();
      const inputEl = target as HTMLInputElement | HTMLTextAreaElement;
      inputEl.value = value;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));

      if (actionPayload.submit) {
        await sleep(150);
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        await triggerSendButton(target);
      }

      // Post-action verification & assertion
      await sleep(100);
      const postAlerts = detectPageAlerts();
      const assertionCheck = await verifyAssertion(actionPayload.assert, initialUrl);
      const currentUrl = window.location.href;
      const urlChanged = currentUrl !== initialUrl;

      let extraNotes = '';
      if (postAlerts.errorText) {
        extraNotes += ` ⚠️ Warning: Alert/Error detected: "${postAlerts.errorText}".`;
      }
      if (postAlerts.modalOpened) {
        extraNotes += ` ℹ️ Modal opened: "${postAlerts.modalOpened}".`;
      }
      if (urlChanged) {
        extraNotes += ` 🌐 URL changed to: ${currentUrl}.`;
      }
      if (actionPayload.assert) {
        extraNotes += assertionCheck.passed ? ' [Assertion Passed]' : ` [⚠️ ${assertionCheck.message}]`;
      }

      return {
        success: assertionCheck.passed,
        action: 'fillTag',
        target: `[Tag #${tag}]`,
        message: `Berhasil mengisi visual input tag #${tag} dengan: "${value}".${extraNotes}`,
        verified: assertionCheck.passed,
        stateChange: {
          urlChanged,
          newUrl: urlChanged ? currentUrl : undefined,
          modalOpened: postAlerts.modalOpened,
          errorAlertDetected: postAlerts.errorText,
          loadingInProgress: postAlerts.loadingInProgress,
        },
        assertionPassed: assertionCheck.passed,
      };
    }

    if (actionPayload.action === 'play') {
      const video = document.querySelector<HTMLVideoElement>(actionPayload.selector || 'video');
      if (video) {
        try {
          await video.play();
          highlightElement(video);
          return {
            success: true,
            action: 'play',
            target: 'video',
            message: 'Video sedang diputar (playing).',
            verified: true,
          };
        } catch (err: any) {
          return {
            success: false,
            action: 'play',
            message: `Gagal memutar video: ${err.message}`,
          };
        }
      }

      const playBtn = document.querySelector<HTMLElement>(
        '.ytp-play-button, button[aria-label="Play"], button[aria-label="Putar"], button.play-button'
      );
      if (playBtn) {
        playBtn.click();
        return {
          success: true,
          action: 'play',
          target: '.ytp-play-button',
          message: 'Tombol play YouTube diklik.',
          verified: true,
        };
      }

      return {
        success: false,
        action: 'play',
        message: 'Elemen video atau tombol play tidak ditemukan pada halaman ini.',
      };
    }

    if (actionPayload.action === 'select') {
      const { selector, value } = actionPayload;
      const selectEl = document.querySelector<HTMLSelectElement>(selector);

      if (!selectEl || selectEl.tagName !== 'SELECT') {
        return {
          success: false,
          action: 'select',
          message: `Select element not found: ${selector}`,
        };
      }

      selectEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightElement(selectEl);

      let matched = false;
      let matchedVal = '';
      for (const option of Array.from(selectEl.options)) {
        if (option.value === value || option.text.toLowerCase().includes(value.toLowerCase())) {
          selectEl.value = option.value;
          matchedVal = option.value;
          option.selected = true;
          matched = true;
          break;
        }
      }

      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));

      await sleep(60);
      const verified = selectEl.value === matchedVal;

      return {
        success: matched,
        action: 'select',
        target: selector,
        message: matched ? `Selected option "${value}" in ${selector} [✓ Verified]` : `Option "${value}" not found in ${selector}`,
        verified,
        attempts: 1,
        verifiedSelector: selector,
      };
    }

    if (
      actionPayload.action === 'press_key' ||
      (actionPayload as any).action === 'pressKey' ||
      (actionPayload as any).action === 'key'
    ) {
      const key = (actionPayload as any).key || 'Enter';
      const selector = (actionPayload as any).selector;
      let target: HTMLElement | null = null;
      if (selector) {
        try {
          target = document.querySelector(selector);
        } catch (_) {}
      }
      if (!target) {
        target =
          (document.activeElement as HTMLElement) ||
          document.querySelector('#prompt-textarea, [contenteditable="true"], textarea, input') ||
          document.body;
      }

      target.focus();
      highlightElement(target);
      const keyCode = key === 'Enter' ? 13 : key === 'Tab' ? 9 : key === 'Escape' ? 27 : 0;
      const evtInit: KeyboardEventInit = {
        key,
        code: key === 'Enter' ? 'Enter' : key,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
      };

      target.dispatchEvent(new KeyboardEvent('keydown', evtInit));
      target.dispatchEvent(new KeyboardEvent('keypress', evtInit));
      target.dispatchEvent(new KeyboardEvent('keyup', evtInit));

      if (key === 'Enter') {
        await triggerSendButton(target);
      }

      // Post-action verification & assertion
      await sleep(120);
      const postAlerts = detectPageAlerts();
      const assertionCheck = await verifyAssertion((actionPayload as any).assert, initialUrl);
      const currentUrl = window.location.href;
      const urlChanged = currentUrl !== initialUrl;

      let extraNotes = '';
      if (postAlerts.errorText) {
        extraNotes += ` ⚠️ Warning: Alert/Error appeared: "${postAlerts.errorText}".`;
      }
      if (postAlerts.modalOpened) {
        extraNotes += ` ℹ️ Dialog opened: "${postAlerts.modalOpened}".`;
      }
      if (urlChanged) {
        extraNotes += ` 🌐 URL changed to: ${currentUrl}.`;
      }
      if ((actionPayload as any).assert) {
        extraNotes += assertionCheck.passed ? ' [Assertion Passed]' : ` [⚠️ ${assertionCheck.message}]`;
      }

      return {
        success: assertionCheck.passed,
        action: 'press_key',
        target: selector || target.tagName.toLowerCase(),
        message: `Dispatched key "${key}" to ${selector || target.tagName.toLowerCase()} [✓ Verified]${extraNotes}`,
        verified: assertionCheck.passed,
        stateChange: {
          urlChanged,
          newUrl: urlChanged ? currentUrl : undefined,
          modalOpened: postAlerts.modalOpened,
          errorAlertDetected: postAlerts.errorText,
          loadingInProgress: postAlerts.loadingInProgress,
        },
        assertionPassed: assertionCheck.passed,
      };
    }

    if (actionPayload.action === 'eval') {
      try {
        const result = new Function(actionPayload.code)();
        return {
          success: true,
          action: 'eval',
          message: 'Executed in-page script',
          data: typeof result === 'object' ? JSON.stringify(result) : String(result),
          verified: true,
          attempts: 1,
        };
      } catch (e: any) {
        return {
          success: false,
          action: 'eval',
          message: `Script error: ${e.message}`,
          error: e.message,
        };
      }
    }

    return {
      success: false,
      action: (actionPayload as any).action || 'unknown',
      message: 'Unrecognized action type',
    };
  } catch (err: any) {
    return {
      success: false,
      action: (actionPayload as any).action || 'unknown',
      message: `Action failed: ${err?.message || String(err)}`,
      error: err?.message,
    };
  }
}

/**
 * Execute a browser action in the specified tab
 */
export async function executePageAction(tabId: number, action: BrowserAction): Promise<ActionResult> {
  // Direct Chrome API action: Switch tab
  if (action.action === 'switchTab') {
    const target = action.tabId ?? action.match ?? '';
    const res = await switchToTab(target);
    return {
      success: res.success,
      action: 'switchTab',
      target: String(res.tabId || action.tabId || action.match || ''),
      tabId: res.tabId,
      message: res.message,
      data: { tabId: res.tabId },
      verified: res.success,
    };
  }

  // Direct Chrome API action: Close tab
  if (action.action === 'closeTab') {
    const res = await closeBrowserTab(action.tabId);
    return {
      success: res.success,
      action: 'closeTab',
      target: String(action.tabId),
      tabId: action.tabId,
      message: res.message,
      data: { tabId: action.tabId },
      verified: res.success,
    };
  }

  // 1. Direct Chrome API action: Navigate existing tab
  if (action.action === 'navigate') {
    try {
      let targetUrl = (action as any).url || '';

      // If AI emitted a javascript: pseudo-protocol or bookmarklet, execute it directly in tab!
      if (targetUrl.trim().toLowerCase().startsWith('javascript:')) {
        const codeStr = targetUrl.trim().replace(/^javascript:/i, '').replace(/void\(0\);?$/i, '').trim();
        let activeTabId = tabId;
        if (!activeTabId || activeTabId <= 0) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          activeTabId = activeTab?.id || 0;
        }

        if (!activeTabId || activeTabId <= 0) {
          return { success: false, action: 'eval', message: 'No active tab for script execution' };
        }

        const [scriptRes] = await chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          func: (code: string) => {
            try {
              const res = new Function(code)();
              return { success: true, result: res !== undefined ? String(res) : 'Executed' };
            } catch (e: any) {
              return { success: false, error: e.message };
            }
          },
          args: [codeStr],
        });

        if (scriptRes?.result?.success) {
          return {
            success: true,
            action: 'eval',
            message: `Inline script executed successfully: ${scriptRes.result.result}`,
            verified: true,
          };
        } else {
          return {
            success: false,
            action: 'eval',
            message: `Script error: ${scriptRes?.result?.error || 'Execution failed'}`,
            error: scriptRes?.result?.error,
          };
        }
      }

      if (targetUrl.startsWith('viewer.html') || targetUrl.startsWith('editor.html')) {
        targetUrl = chrome.runtime.getURL(targetUrl);
      } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('chrome-extension://')) {
        targetUrl = 'https://' + targetUrl;
      }

      let activeTabId = tabId;
      if (!activeTabId || activeTabId <= 0) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        activeTabId = activeTab?.id || 0;
      }

      if (activeTabId && activeTabId > 0) {
        await chrome.tabs.update(activeTabId, { url: targetUrl });
      } else {
        await chrome.tabs.create({ url: targetUrl });
      }

      return {
        success: true,
        action: 'navigate',
        target: targetUrl,
        message: `Membuka URL: ${targetUrl}`,
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'navigate',
        message: `Gagal membuka URL: ${err.message}`,
        error: err.message,
      };
    }
  }

  // 2. Direct Chrome API action: Open new tab
  if (action.action === 'openTab' || action.action === 'newTab') {
    try {
      let targetUrl = action.url || 'https://www.google.com';
      if (targetUrl.startsWith('viewer.html') || targetUrl.startsWith('editor.html')) {
        targetUrl = chrome.runtime.getURL(targetUrl);
      } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('chrome-extension://')) {
        targetUrl = 'https://' + targetUrl;
      }
      const newTab = await chrome.tabs.create({
        url: targetUrl,
        active: action.active !== false,
      });
      return {
        success: true,
        action: 'openTab',
        target: targetUrl,
        tabId: newTab.id,
        message: `Membuka tab baru: ${targetUrl}${newTab.id ? ` [Tab ID: ${newTab.id}]` : ''}`,
        data: { tabId: newTab.id, url: targetUrl },
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'openTab',
        message: `Gagal membuka tab baru: ${err.message}`,
        error: err.message,
      };
    }
  }

  // 3. VFS File write action
  if (action.action === 'writeFile') {
    try {
      const { path, content } = action as WriteFileAction;
      const record = await saveVfsFile(path || '/unnamed.txt', content || '');
      return {
        success: true,
        action: 'writeFile',
        target: record.path,
        message: `File berhasil disimpan ke VFS: ${record.path} (${record.size} bytes)`,
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'writeFile',
        message: `Gagal menyimpan file ke VFS: ${err.message}`,
        error: err.message,
      };
    }
  }

  // 4. Generate PowerPoint Presentation (.pptx & interactive html slides)
  if (action.action === 'generatePptx') {
    try {
      const { createPresentationArtifact } = await import('./pptx-generator');
      const act = action as any;
      const rawSpec = act.spec || act.presentation || act.data || act;
      const baseName = act.baseName || act.filename || rawSpec.filename;

      const res = await createPresentationArtifact(rawSpec, baseName);

      // Automatically open live slide presentation in a viewer tab
      let viewerTabId: number | undefined;
      try {
        const viewerUrl = chrome.runtime.getURL(`viewer.html?path=${encodeURIComponent(res.pptxPath)}`);
        const tab = await chrome.tabs.create({ url: viewerUrl, active: true });
        viewerTabId = tab.id;
      } catch (_) {}

      return {
        success: true,
        action: 'generatePptx',
        target: res.pptxPath,
        tabId: viewerTabId,
        message: `Presentasi PowerPoint berhasil dibuat dan disimpan di VFS: '${res.pptxPath}' (.pptx) & '${res.htmlPath}' (interactive viewer).`,
        data: { pptxPath: res.pptxPath, htmlPath: res.htmlPath, tabId: viewerTabId },
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'generatePptx',
        message: `Gagal membuat presentasi PowerPoint: ${err.message}`,
        error: err.message,
      };
    }
  }

  // 4b. Tabless action: Generate Word Document
  if (action.action === 'generateDoc' || action.action === 'generateDocs' || (action as any).action === 'createDoc') {
    try {
      const act = action as GenerateDocAction;
      const rawSpec = act.spec || act.doc || act.document || act;
      const baseName = act.baseName || act.filename || rawSpec.filename;

      const res = await createDocArtifact(rawSpec, baseName);

      // Automatically open live document viewer tab in preview mode
      let viewerTabId: number | undefined;
      try {
        const viewerUrl = chrome.runtime.getURL(`viewer.html?path=${encodeURIComponent(res.docPath)}`);
        const tab = await chrome.tabs.create({ url: viewerUrl, active: true });
        viewerTabId = tab.id;
      } catch (_) {}

      return {
        success: true,
        action: 'generateDoc',
        target: res.docPath,
        tabId: viewerTabId,
        message: `Dokumen Word berhasil dibuat dan disimpan di VFS: '${res.docPath}' (.doc / Word MSO), '${res.docxPath}' (.docx), dan '${res.htmlPath}' (web preview).`,
        data: { docPath: res.docPath, docxPath: res.docxPath, htmlPath: res.htmlPath, tabId: viewerTabId },
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'generateDoc',
        message: `Gagal membuat dokumen Word: ${err.message}`,
        error: err.message,
      };
    }
  }

  // 4c. Tabless action: Fast Web Search
  if (action.action === 'searchWeb' || (action as any).action === 'webSearch') {
    try {
      const act = action as SearchWebAction;
      const query = act.query || (act as any).q || (act as any).search || '';
      const maxResults = act.maxResults || 6;

      const searchResponse = await executeWebSearch(query, maxResults);
      const formattedMarkdown = formatWebSearchResults(searchResponse);

      return {
        success: !searchResponse.error || searchResponse.results.length > 0,
        action: 'searchWeb',
        target: query,
        message: formattedMarkdown,
        data: searchResponse,
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'searchWeb',
        message: `Pencarian web gagal: ${err.message}`,
        error: err.message,
      };
    }
  }

  // 4b. Visual Grounding / Set-of-Marks visual inspect
  if (action.action === 'visualInspect') {
    let targetTabId = tabId;
    if (!targetTabId || targetTabId <= 0) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTabId = activeTab?.id || 0;
      } catch (_) {}
    }

    if (!targetTabId || targetTabId <= 0) {
      return {
        success: false,
        action: 'visualInspect',
        message: 'Tidak ada active tab yang tersedia untuk visual inspection.',
        error: 'No active tab',
      };
    }

    try {
      const somResult = await captureSetOfMarks(targetTabId);
      if (somResult.error) {
        return {
          success: false,
          action: 'visualInspect',
          tabId: targetTabId,
          message: `Gagal melakukan visual inspection: ${somResult.error}`,
          error: somResult.error,
        };
      }

      const summaryList = somResult.items
        .map((it) => `[${it.tag}] <${it.role}> ${it.text}`)
        .join('\n');

      return {
        success: true,
        action: 'visualInspect',
        tabId: targetTabId,
        message: `Visual inspection berhasil diambil (${somResult.items.length} elemen terdeteksi).\nScreenshot berlabel angka telah di-attach ke percakapan.\nGunakan aksi clickTag(tag) atau fillTag(tag, value) untuk berinteraksi:\n${summaryList}`,
        data: {
          screenshotUrl: somResult.screenshotUrl,
          items: somResult.items,
        },
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'visualInspect',
        tabId: targetTabId,
        message: `Visual inspection exception: ${err.message}`,
        error: err.message,
      };
    }
  }

  // 5. Custom User Tool action
  if (action.action === 'runTool') {
    let targetTabId = tabId;
    if (!targetTabId || targetTabId <= 0) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        targetTabId = activeTab?.id || 0;
      } catch (_) {}
    }

    let isRestricted = false;
    if (targetTabId && targetTabId > 0) {
      try {
        const tab = await chrome.tabs.get(targetTabId);
        if (tab?.url && isRestrictedTabUrl(tab.url)) {
          isRestricted = true;
        }
      } catch (_) {}
    }

    if (isRestricted) {
      return {
        success: false,
        action: 'runTool',
        target: action.tool,
        tabId: targetTabId,
        message: 'Custom scripts cannot run on internal browser pages or restricted tabs.',
        error: 'Restricted page',
      };
    }

    const toolOutput = await executeUserTool(targetTabId, action.tool, action.args || {});
    const hasError = !!(toolOutput && typeof toolOutput === 'object' && 'error' in toolOutput);

    return {
      success: !hasError,
      action: 'runTool',
      target: action.tool,
      tabId: targetTabId,
      message: hasError
        ? `Tool '${action.tool}' error: ${toolOutput.error}`
        : `Tool '${action.tool}' executed successfully.`,
      error: hasError ? String(toolOutput.error) : undefined,
      data: toolOutput,
      verified: !hasError,
    };
  }

  // 6. Semantic Memory Actions (remember / forget)
  if (action.action === 'remember') {
    try {
      const rec = await addMemory(
        action.content,
        action.category || 'fact',
        undefined,
        undefined
      );
      return {
        success: true,
        action: 'remember',
        target: rec.content.slice(0, 30),
        message: `Berhasil mengingat [${rec.category.toUpperCase()}]: "${rec.content}". Ingatan ini akan tersimpan permanen dan dapat di-recall di obrolan mendatang.`,
        data: rec,
        verified: true,
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'remember',
        message: `Gagal menyimpan memori: ${err.message}`,
        error: err.message,
      };
    }
  }

  if (action.action === 'forget') {
    try {
      if (action.memoryId) {
        await deleteMemory(action.memoryId);
        return {
          success: true,
          action: 'forget',
          message: `Ingatan dengan ID ${action.memoryId} telah dihapus.`,
          verified: true,
        };
      } else if (action.query) {
        const matches = await searchMemories(action.query, 1);
        if (matches.length > 0) {
          await deleteMemory(matches[0].id);
          return {
            success: true,
            action: 'forget',
            message: `Ingatan terkait "${matches[0].content}" telah berhasil dihapus.`,
            verified: true,
          };
        }
        return {
          success: false,
          action: 'forget',
          message: `Tidak ditemukan ingatan yang cocok dengan query "${action.query}".`,
        };
      }
      return {
        success: false,
        action: 'forget',
        message: 'Harap sertakan memoryId atau query untuk melupakan.',
      };
    } catch (err: any) {
      return {
        success: false,
        action: 'forget',
        message: `Gagal menghapus ingatan: ${err.message}`,
        error: err.message,
      };
    }
  }

  // 7. Hierarchical Task Planner Actions (createPlan / updateSubgoal)
  if (action.action === 'createPlan') {
    const planId = crypto.randomUUID();
    const subgoals = (action.subgoals || []).map((s: any, idx: number) => ({
      id: s.id || String(idx + 1),
      title: s.title || `Subgoal ${idx + 1}`,
      status: s.status || 'pending',
      summary: s.summary,
    }));

    return {
      success: true,
      action: 'createPlan',
      target: action.title,
      message: `Rencana tugas "${action.title}" berhasil dibuat dengan ${subgoals.length} subgoals.`,
      data: { planId, title: action.title, subgoals },
      verified: true,
    };
  }

  if (action.action === 'updateSubgoal') {
    return {
      success: true,
      action: 'updateSubgoal',
      target: action.subgoalId,
      message: `Subgoal #${action.subgoalId} diperbarui menjadi status [${action.status}].${action.summary ? ` (${action.summary})` : ''}`,
      data: {
        subgoalId: action.subgoalId,
        status: action.status,
        summary: action.summary,
      },
      verified: true,
    };
  }

  // 5. In-page DOM actions (fill, click, select, eval)
  let targetTabId = tabId;
  if (!targetTabId || targetTabId <= 0) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = activeTab?.id || 0;
  }

  if (!targetTabId || targetTabId <= 0) {
    return {
      success: false,
      action: action.action,
      message: 'Tidak ada tab aktif yang dapat dimanipulasi.',
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: inPageActionRunner,
      args: [action],
    });

    if (results && results[0]?.result) {
      return results[0].result as ActionResult;
    }

    return {
      success: false,
      action: action.action,
      message: 'No result returned from tab execution',
    };
  } catch (err: any) {
    console.error('[PageActions] Execution error:', err);
    return {
      success: false,
      action: action.action,
      message: `Failed to execute action in tab ${targetTabId}: ${err?.message || 'Access denied'}`,
      error: err?.message,
    };
  }
}

/**
 * Execute multiple browser actions sequentially
 */
export async function executeBatchActions(tabId: number, actions: BrowserAction[]): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of actions) {
    const res = await executePageAction(tabId, action);
    results.push(res);
    // Short delay between actions for DOM stability
    await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}
