import { TargetMetadata } from './types';

/**
 * Checks if an element ID looks generated/dynamic (e.g. ember1234, :r1:, input-391823)
 */
function isDynamicId(id: string): boolean {
  if (!id || typeof id !== 'string') return true;
  if (/^[0-9]+$/.test(id)) return true;
  if (/[0-9]{4,}/.test(id)) return true; // Long numeric sequences
  if (/^(ember|react|ng|rc-|chakra-|mui-)/i.test(id)) return true;
  if (/^:r[0-9a-zA-Z]+:/.test(id)) return true; // React 18+ useId format
  return false;
}

/**
 * Escapes special CSS characters in attribute values
 */
function escapeAttr(val: string): string {
  return val.replace(/["\\]/g, '\\$&');
}

/**
 * Generates a concise unique CSS selector path by traversing upward
 */
function getUniqueCssPath(el: HTMLElement): string {
  const path: string[] = [];
  let current: HTMLElement | null = el;
  let depth = 0;

  while (current && current.nodeType === Node.ELEMENT_NODE && depth < 4) {
    let selector = current.tagName.toLowerCase();

    if (current.id && !isDynamicId(current.id)) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    const name = current.getAttribute('name');
    if (name) {
      selector += `[name="${escapeAttr(name)}"]`;
    } else {
      // Find nth-of-type if there are sibling elements with same tag
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current?.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
    }

    path.unshift(selector);

    try {
      const fullPath = path.join(' > ');
      if (document.querySelectorAll(fullPath).length === 1) {
        return fullPath;
      }
    } catch (_) {}

    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
}

/**
 * Computes a resilient multi-selector cascade for any DOM element
 */
export function computeSelectorCascade(el: HTMLElement): TargetMetadata {
  const tagName = el.tagName.toLowerCase();
  const selectors: string[] = [];

  // 1. Data-test attributes (highest reliability across app redesigns)
  const testAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
  for (const attr of testAttrs) {
    const val = el.getAttribute(attr);
    if (val) {
      selectors.push(`[${attr}="${escapeAttr(val)}"]`);
    }
  }

  // 2. Stable ID
  if (el.id && !isDynamicId(el.id)) {
    try {
      selectors.push(`#${CSS.escape(el.id)}`);
    } catch (_) {
      selectors.push(`#${el.id}`);
    }
  }

  // 3. Form & Accessibility attributes
  const name = el.getAttribute('name') || undefined;
  if (name) {
    selectors.push(`${tagName}[name="${escapeAttr(name)}"]`);
  }

  const ariaLabel = el.getAttribute('aria-label') || undefined;
  if (ariaLabel) {
    selectors.push(`[aria-label="${escapeAttr(ariaLabel)}"]`);
  }

  const placeholder = el.getAttribute('placeholder') || undefined;
  if (placeholder) {
    selectors.push(`${tagName}[placeholder="${escapeAttr(placeholder)}"]`);
  }

  const type = el.getAttribute('type') || undefined;
  if (type && ['submit', 'button', 'reset', 'checkbox', 'radio'].includes(type)) {
    selectors.push(`${tagName}[type="${type}"]`);
  }

  // 4. Text-matching anchor for clickable elements
  let textMatch: { tag: string; text: string } | undefined;
  const isClickable = ['button', 'a', 'label', 'summary'].includes(tagName) || el.getAttribute('role') === 'button';
  if (isClickable) {
    const text = (el.innerText || el.textContent || '').trim();
    if (text && text.length > 0 && text.length <= 40) {
      textMatch = { tag: tagName, text };
    }
  }

  // 5. Unique CSS Path fallback
  const uniqueCss = getUniqueCssPath(el);
  if (uniqueCss && !selectors.includes(uniqueCss)) {
    selectors.push(uniqueCss);
  }

  // Fallback if empty
  if (selectors.length === 0) {
    selectors.push(tagName);
  }

  return {
    tagName,
    selectors,
    textMatch,
    name,
    placeholder,
    inputType: type,
    ariaLabel,
  };
}
