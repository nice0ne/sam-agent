/**
 * Page Reader Service for SAM-Agent
 * Inspects the active Chrome browser tab, extracts metadata, selection,
 * clean DOM text, headings, interactive elements, detailed form fields,
 * and WYSIWYG / rich-text editors for AI context.
 */

import { getDomainMemory } from './db';
import type { DomainMemoryRecord } from '../types/agent';
import { installSnifferInTab } from './network-sniffer';

export interface FormFieldInfo {
  selector: string;
  tag: string;
  type?: string;
  name?: string;
  id?: string;
  label?: string;
  placeholder?: string;
  value?: string;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  isRichText?: boolean;
}

export interface ContentLinkInfo {
  text: string;
  href: string;
  selector?: string;
}

export interface PageContext {
  tabId?: number;
  url: string;
  domain?: string;
  domainMemory?: DomainMemoryRecord | null;
  title: string;
  favIconUrl?: string;
  selection: string;
  metaDesc: string;
  text: string;
  headings: string[];
  interactiveElements: string[];
  contentLinks?: ContentLinkInfo[];
  formFields: FormFieldInfo[];
  richTextEditors: FormFieldInfo[];
  isRestricted: boolean;
  error?: string;
}

/**
 * Check whether a URL can be inspected by chrome.scripting
 */
export function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://') ||
    url.startsWith('view-source:') ||
    url.startsWith('data:')
  );
}

/**
 * Get active tab basic information
 */
export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs[0]) return tabs[0];

    const fallbackTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (fallbackTabs && fallbackTabs[0]) return fallbackTabs[0];

    const anyActive = await chrome.tabs.query({ active: true });
    return anyActive[0] || null;
  } catch (err) {
    console.warn('[PageReader] Failed to query active tab:', err);
    return null;
  }
}

/**
 * In-page extractor script executed via chrome.scripting.executeScript
 */
function inPageDOMInspector() {
  const title = document.title || '';
  const url = window.location.href || '';
  const selection = window.getSelection()?.toString()?.trim() || '';

  const metaDesc =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ||
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    '';

  // 1. Clean DOM text extraction for readability
  const target = document.querySelector('main, article, [role="main"]') || document.body;
  let text = '';

  if (target) {
    const clone = target.cloneNode(true) as HTMLElement;
    const removeSelectors = [
      'script',
      'style',
      'noscript',
      'svg',
      'canvas',
      'video',
      'audio',
      'nav',
      'footer',
      '#redo-active-glow',
      '.ad',
      '.ads',
    ];
    removeSelectors.forEach((sel) => {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    });

    text = clone.innerText || clone.textContent || '';
    text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();

    if (text.length > 25000) {
      text = text.slice(0, 25000) + '\n\n[...Content truncated for context limits...]';
    }
  }

  // 2. Key headings
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map((h) => `${h.tagName}: ${(h.textContent || '').trim()}`)
    .filter((h) => h.length > 4)
    .slice(0, 20);

  // 3. Specifically discover WYSIWYG & Rich Text Editors (wysihtml5, TinyMCE, CKEditor, iframes)
  const richTextEditors: FormFieldInfo[] = [];
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'));

  textareas.forEach((ta) => {
    const id = ta.id || '';
    const name = ta.name || '';
    const isHidden =
      ta.style.display === 'none' ||
      ta.hidden ||
      (typeof window !== 'undefined' && window.getComputedStyle(ta).display === 'none');

    // Check if next to an iframe or has wysihtml5
    const parent = ta.parentElement;
    const hasSiblingIframe = parent ? !!parent.querySelector('iframe.wysihtml5-sandbox, iframe') : false;

    // Check for associated label
    let labelText = '';
    if (id) {
      const lbl = document.querySelector(`label[for="${id}"]`);
      if (lbl) labelText = (lbl.textContent || '').trim();
    }
    if (!labelText && parent) {
      const parentLbl = parent.closest('label') || parent.previousElementSibling;
      if (parentLbl) labelText = (parentLbl.textContent || '').trim();
    }

    if (isHidden || hasSiblingIframe) {
      richTextEditors.push({
        selector: id ? `#${id}` : `textarea[name="${name}"]`,
        tag: 'wysihtml5 rich-text editor',
        type: 'rich-text',
        name,
        id,
        label: labelText || ta.placeholder || id || name,
        placeholder: ta.placeholder || '',
        isRichText: true,
      });
    }
  });

  // Also check any standalone iframes that are contenteditable or wysiwyg
  const iframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe.wysihtml5-sandbox'));
  iframes.forEach((ifr, idx) => {
    try {
      const isEditable = ifr.contentDocument?.body?.isContentEditable || ifr.className.includes('wysihtml5');
      if (isEditable) {
        const prevTextarea = ifr.previousElementSibling;
        const linkedId = prevTextarea instanceof HTMLTextAreaElement ? prevTextarea.id : '';
        if (!linkedId || !richTextEditors.some((r) => r.id === linkedId)) {
          richTextEditors.push({
            selector: linkedId ? `#${linkedId}` : `iframe.wysihtml5-sandbox:nth-of-type(${idx + 1})`,
            tag: 'iframe rich-text editor',
            type: 'rich-text',
            id: linkedId || `iframe_${idx}`,
            label: `Rich Text Editor Frame #${idx + 1}`,
            isRichText: true,
          });
        }
      }
    } catch (_) {}
  });

  // 4. Form fields specifically extracted for input filling (up to 120 items)
  const formFields: FormFieldInfo[] = Array.from(
    document.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [contenteditable="true"], [role="textbox"], #prompt-textarea'
    )
  )
    .slice(0, 120)
    .map((el) => {
      const tag = el.tagName.toLowerCase();
      const isInput = el instanceof HTMLInputElement;
      const isTextArea = el instanceof HTMLTextAreaElement;
      const isContentEdit = el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';

      const type = isInput ? (el as HTMLInputElement).type || '' : isContentEdit ? 'contenteditable' : '';
      const name = isInput || isTextArea ? (el as any).name || '' : '';
      const id = el.id || '';
      const placeholder =
        (el as any).placeholder ||
        el.getAttribute('placeholder') ||
        el.getAttribute('data-placeholder') ||
        el.querySelector('[data-placeholder]')?.getAttribute('data-placeholder') ||
        '';
      const aria = el.getAttribute('aria-label') || '';
      const value = isInput || isTextArea ? (el as any).value || '' : el.innerText || '';

      // Check if readonly or disabled
      const isReadOnly =
        (el as any).readOnly === true ||
        el.getAttribute('readonly') !== null ||
        el.getAttribute('aria-readonly') === 'true' ||
        el.classList.contains('readonly');

      const isDisabled =
        (el as any).disabled === true ||
        el.getAttribute('disabled') !== null ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.classList.contains('disabled');

      let labelText = '';
      if (id) {
        const lbl = document.querySelector(`label[for="${id}"]`);
        if (lbl) labelText = (lbl.textContent || '').trim();
      }
      if (!labelText) {
        const parentLbl = el.closest('label') || el.closest('tr')?.querySelector('td:first-child');
        if (parentLbl) labelText = (parentLbl.textContent || '').replace(placeholder, '').trim();
      }

      let selector = '';
      if (id) {
        selector = `#${id}`;
      } else if (name && type === 'radio') {
        selector = `input[name="${name}"][value="${value || 'Y'}"]`;
      } else if (name) {
        selector = `${tag}[name="${name}"]`;
      } else if (placeholder) {
        selector = `${tag}[placeholder*="${placeholder.slice(0, 20)}"]`;
      } else if (aria) {
        selector = `${tag}[aria-label*="${aria.slice(0, 20)}"]`;
      } else if (isContentEdit) {
        selector = '[contenteditable="true"]';
      } else {
        selector = `${tag}${type ? `[type="${type}"]` : ''}`;
      }

      return {
        selector,
        tag: isContentEdit ? 'contenteditable' : tag,
        type: type || (isContentEdit ? 'rich-text' : undefined),
        name,
        id,
        placeholder,
        label: labelText || aria || placeholder,
        value: value.slice(0, 100),
        isReadOnly,
        isDisabled,
        isRichText: isContentEdit,
      };
    });

  // 5. Interactive buttons and links summary
  const interactiveElements = Array.from(
    document.querySelectorAll('button, a[href], input[type="submit"], input[type="button"]')
  )
    .slice(0, 25)
    .map((el) => {
      const tag = el.tagName.toLowerCase();
      const label =
        (el as HTMLInputElement).value ||
        el.getAttribute('aria-label') ||
        (el.textContent || '').trim().slice(0, 30);
      return `${tag} "${label}"`;
    });

  // 6. Content links & search results (e.g. YouTube video links, search titles)
  const contentLinks: { text: string; href: string; selector?: string }[] = [];
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const a of anchors) {
    const href = a.href || '';
    if (!href || href.startsWith('javascript:') || href.startsWith('#')) continue;
    const rawText = (a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (rawText.length < 3) continue;

    const isVideo = href.includes('/watch?v=');
    const id = a.id;
    const selector = id ? `#${id}` : isVideo ? `a[href*="${href.slice(href.indexOf('/watch'))}"]` : undefined;

    if (!contentLinks.some((c) => c.href === href)) {
      contentLinks.push({
        text: rawText.slice(0, 100),
        href,
        selector,
      });
      if (contentLinks.length >= 25) break;
    }
  }

  return {
    title,
    url,
    selection,
    metaDesc,
    text,
    headings,
    interactiveElements,
    contentLinks,
    formFields,
    richTextEditors,
  };
}

/**
 * Extract active page content and metadata
 */
export async function getActivePageContext(): Promise<PageContext | null> {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return null;

  const url = tab.url || '';
  const title = tab.title || '';
  const favIconUrl = tab.favIconUrl || '';

  let domain = '';
  try {
    if (url && !url.startsWith('chrome://') && !url.startsWith('about:')) {
      domain = new URL(url).hostname;
    }
  } catch (_) {}

  let domainMemory: DomainMemoryRecord | null = null;
  if (domain) {
    try {
      domainMemory = (await getDomainMemory(domain)) || null;
    } catch (_) {}
  }

  if (isRestrictedUrl(url)) {
    return {
      tabId: tab.id,
      url,
      domain,
      domainMemory: null,
      title,
      favIconUrl,
      selection: '',
      metaDesc: '',
      text: `[Note: This page is a protected browser internal page (${url}) and cannot be inspected via script injection.]`,
      headings: [],
      interactiveElements: [],
      contentLinks: [],
      formFields: [],
      richTextEditors: [],
      isRestricted: true,
    };
  }

  try {
    if (tab.id) {
      installSnifferInTab(tab.id).catch(() => {});
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: inPageDOMInspector,
    });

    if (results && results[0]?.result) {
      const res = results[0].result;
      return {
        tabId: tab.id,
        url: res.url || url,
        domain,
        domainMemory,
        title: res.title || title,
        favIconUrl,
        selection: res.selection || '',
        metaDesc: res.metaDesc || '',
        text: res.text || '',
        headings: res.headings || [],
        interactiveElements: res.interactiveElements || [],
        contentLinks: res.contentLinks || [],
        formFields: res.formFields || [],
        richTextEditors: res.richTextEditors || [],
        isRestricted: false,
      };
    }
  } catch (err: any) {
    console.warn('[PageReader] Execution failed:', err);
    return {
      tabId: tab.id,
      url,
      domain,
      domainMemory,
      title,
      favIconUrl,
      selection: '',
      metaDesc: '',
      text: `[Failed to inspect page: ${err?.message || 'Access restricted'}]`,
      headings: [],
      interactiveElements: [],
      contentLinks: [],
      formFields: [],
      richTextEditors: [],
      isRestricted: false,
      error: err?.message,
    };
  }

  return {
    tabId: tab.id,
    url,
    domain,
    domainMemory,
    title,
    favIconUrl,
    selection: '',
    metaDesc: '',
    text: '',
    headings: [],
    interactiveElements: [],
    formFields: [],
    richTextEditors: [],
    isRestricted: false,
  };
}

/**
 * Formats PageContext into a Markdown System Prompt block
 */
export function formatPageContextPrompt(page: PageContext): string {
  const lines: string[] = [];

  lines.push('# CURRENT ACTIVE BROWSER WEBPAGE CONTEXT');
  lines.push(`- **Tab ID:** ${page.tabId ?? 'Unknown'}`);
  lines.push(`- **URL:** ${page.url}`);
  if (page.domain) {
    lines.push(`- **Domain:** ${page.domain}`);
  }
  lines.push(`- **Page Title:** ${page.title}`);

  // Persistent Domain Memory & Self-Improvement Insights
  if (page.domainMemory) {
    const mem = page.domainMemory;
    const selectorEntries = Object.entries(mem.formSelectors || {});
    lines.push('');
    lines.push(`### 🧠 AUTONOMOUS DOMAIN MEMORY & LEARNED PATTERNS FOR "${page.domain}":`);
    lines.push(`You have previously operated on this domain (${mem.successfulActionsCount} successful actions, ${mem.failedActionsCount} failed). Use this verified knowledge for 100% accuracy:`);
    
    if (selectorEntries.length > 0) {
      lines.push('**Verified Form Selector Mappings:**');
      selectorEntries.slice(0, 25).forEach(([label, sel]) => {
        lines.push(`- "${label}" ➜ \`${sel}\``);
      });
    }

    if (mem.learnedCaveats && mem.learnedCaveats.length > 0) {
      lines.push('**Learned Caveats & Automation Quirks:**');
      mem.learnedCaveats.forEach((c) => {
        lines.push(`- 💡 ${c}`);
      });
    }
  }

  if (page.metaDesc) {
    lines.push(`- **Meta Description:** ${page.metaDesc}`);
  }

  if (page.selection) {
    lines.push('');
    lines.push('### USER SELECTED / HIGHLIGHTED TEXT ON THIS PAGE:');
    lines.push('```text');
    lines.push(page.selection);
    lines.push('```');
  }

  // Separate readonly and editable fields
  const allFields = page.formFields || [];
  const readonlyFields = allFields.filter((f) => f.isReadOnly || f.isDisabled);
  const editableFields = allFields.filter((f) => !f.isReadOnly && !f.isDisabled);

  if (readonlyFields.length > 0) {
    lines.push('');
    lines.push('### SYSTEM / PRE-FILLED READONLY FIELDS (FOR CONTEXT ONLY - STRICTLY DO NOT MODIFY):');
    lines.push(
      'The following fields are pre-filled by the system or locked as READONLY/DISABLED. Act as an end user: Use this information as essential background context (e.g. proposal metadata), but NEVER overwrite, edit, or output action blocks for these fields:'
    );
    readonlyFields.forEach((f, i) => {
      lines.push(
        `${i + 1}. [READONLY] Label: "${f.label || f.name || f.id}" | Current Value: "${f.value || '(empty)'}" | Selector: \`${f.selector}\``
      );
    });
  }

  // Highlight Rich Text / WYSIWYG Editors explicitly
  if (page.richTextEditors && page.richTextEditors.length > 0) {
    lines.push('');
    lines.push('### WYSIWYG & RICH-TEXT EDITORS ON PAGE (100% AUTOMATABLE):');
    lines.push('The following are rich-text / wysihtml5 / iframe editors. You CAN and MUST fill them if they are part of the form:');
    page.richTextEditors.forEach((r, i) => {
      lines.push(`${i + 1}. Selector: \`${r.selector}\` | Label: "${r.label || r.id}" | Type: ${r.tag}`);
    });
  }

  if (editableFields.length > 0) {
    lines.push('');
    lines.push('### EDITABLE FORM FIELDS (READY TO BE FILLED):');
    lines.push('The following fields are open for user input. Act as an end user and fill ONLY the empty editable fields needed:');
    editableFields.forEach((f, i) => {
      const details = [
        `Selector: \`${f.selector}\``,
        `Tag: ${f.tag}`,
        f.type ? `Type: ${f.type}` : '',
        f.name ? `Name: "${f.name}"` : '',
        f.label ? `Label: "${f.label}"` : '',
        f.placeholder ? `Placeholder: "${f.placeholder}"` : '',
        f.value ? `[Current: "${f.value.slice(0, 30)}"]` : '[EMPTY]',
      ]
        .filter(Boolean)
        .join(' | ');
      lines.push(`${i + 1}. ${details}`);
    });
  }

  if (page.interactiveElements && page.interactiveElements.length > 0) {
    lines.push('');
    lines.push('### INTERACTIVE BUTTONS & LINKS:');
    lines.push(page.interactiveElements.join(', '));
  }

  if (page.contentLinks && page.contentLinks.length > 0) {
    lines.push('');
    lines.push('### KEY CONTENT LINKS & SEARCH RESULTS:');
    page.contentLinks.slice(0, 20).forEach((cl, idx) => {
      lines.push(`${idx + 1}. "${cl.text}" -> URL: ${cl.href}${cl.selector ? ` (selector: "${cl.selector}")` : ''}`);
    });
  }

  if (page.headings && page.headings.length > 0) {
    lines.push('');
    lines.push('### PAGE HEADINGS:');
    page.headings.forEach((h) => lines.push(`- ${h}`));
  }

  if (page.text) {
    lines.push('');
    lines.push('### PAGE READABLE CONTENT:');
    lines.push('"""');
    lines.push(page.text);
    lines.push('"""');
  }

  lines.push('');
  lines.push('---');
  lines.push('### CRITICAL END-USER BEHAVIOR & FORM FILLING RULES:');
  lines.push(
    'You are SAM-Agent, an autonomous browser assistant acting on behalf of a human end user.'
  );
  lines.push(
    '1. STRICT END-USER BEHAVIOR:'
  );
  lines.push(
    '   - Act as a human end user! A human user NEVER touches or modifies readonly system fields (such as Nomor Proposal, Tanggal, Kategori, Tema, Dept, Inovator).'
  );
  lines.push(
    '   - ONLY fill fields that are EDITABLE and intended for user input.'
  );
  lines.push(
    '   - NEVER generate action blocks for fields listed under "SYSTEM / PRE-FILLED READONLY FIELDS".'
  );
  lines.push('');
  lines.push(
    '2. FULL CAPABILITY FOR ALL EDITABLE SECTIONS:'
  );
  lines.push(
    '   - Text inputs and textareas (e.g. #e_masalah, #e_dampak, #e_perbaikan, #e_ide, #e_perlengkapan)'
  );
  lines.push(
    '   - Radio buttons and checkboxes (e.g. input[name="U001"][value="Y"], input[name="U002"][value="Y"], etc.)'
  );
  lines.push(
    '   - WYSIWYG & Rich-Text Editors (wysihtml5 / iframe editors such as #e_sebelum, #e_sesudah, #e_teratasi). When you output action "fill" with these selectors, the extension automatically injects into the wysihtml5 iframe body and synchronizes the textarea!'
  );
  lines.push(
    '   - Table cells, impact descriptions, and ratings (e.g. inputs with prefixes like d_Q, d_C, d_D, d_S, d_M, po_Q, po_C, pe_C, etc.)'
  );
  lines.push('');
  lines.push(
    '3. Action block format:'
  );
  lines.push('```action:batch');
  lines.push('[');
  lines.push('  { "action": "fill", "selector": "#e_masalah", "value": "..." },');
  lines.push('  { "action": "fill", "selector": "#e_sesudah", "value": "..." },');
  lines.push('  { "action": "fill", "selector": "#e_teratasi", "value": "..." },');
  lines.push('  { "action": "click", "selector": "input[name=\'U001\'][value=\'Y\']" },');
  lines.push('  { "action": "fill", "selector": "input[name=\'d_Q\']", "value": "..." },');
  lines.push('  { "action": "fill", "selector": "input[name=\'po_Q\']", "value": "3" }');
  lines.push(']');
  lines.push('```');
  lines.push('');
  lines.push(
    '4. Accompanied by a concise, structured explanation of the filled fields.'
  );

  return lines.join('\n');
}
