/**
 * Two-Click Visual Pattern Inference Engine for repeating DOM elements
 */

export interface PatternInferenceResult {
  containerSelector: string;
  relativeFieldSelector: string;
  matchedCount: number;
}

/**
 * Gets all element ancestors up to the document root
 */
export function getElementAncestors(el: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let current: HTMLElement | null = el;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    chain.push(current);
    current = current.parentElement;
  }
  return chain;
}

/**
 * Finds the Lowest Common Ancestor (LCA) of two elements
 * and identifies the direct child container of LCA for each element.
 */
export function findLCAAndContainers(
  el1: HTMLElement,
  el2: HTMLElement
): {
  lca: HTMLElement;
  c1: HTMLElement;
  c2: HTMLElement;
} | null {
  const ancestors1 = getElementAncestors(el1);
  const ancestors2 = getElementAncestors(el2);

  const set2 = new Set(ancestors2);
  let lca: HTMLElement | null = null;

  for (const anc of ancestors1) {
    if (set2.has(anc)) {
      lca = anc;
      break;
    }
  }

  if (!lca) return null;

  // Find direct child of LCA in ancestors1
  const idx1 = ancestors1.indexOf(lca);
  const c1 = idx1 > 0 ? ancestors1[idx1 - 1] : el1;

  // Find direct child of LCA in ancestors2
  const idx2 = ancestors2.indexOf(lca);
  const c2 = idx2 > 0 ? ancestors2[idx2 - 1] : el2;

  return { lca, c1, c2 };
}

/**
 * Generates an element selector (id or tag + classes or nth-of-type)
 */
export function getUniqueSelector(el: HTMLElement): string {
  if (el.id && !/^\d|[^\w-]/.test(el.id)) {
    return `#${CSS.escape(el.id)}`;
  }
  if (el === document.body) return 'body';
  if (el === document.documentElement) return 'html';

  const tag = el.tagName.toLowerCase();
  const meaningfulClasses = Array.from(el.classList).filter(
    (c) => !c.startsWith('hover:') && !c.startsWith('focus:') && !c.includes(':') && c.length < 30
  );

  if (meaningfulClasses.length > 0) {
    const classSelector = tag + '.' + meaningfulClasses.slice(0, 2).map((c) => CSS.escape(c)).join('.');
    try {
      if (document.querySelectorAll(classSelector).length === 1) {
        return classSelector;
      }
    } catch (_) {}
  }

  // Fallback to parent path
  if (el.parentElement) {
    const parentSel = getUniqueSelector(el.parentElement);
    const siblings = Array.from(el.parentElement.children).filter((c) => c.tagName === el.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(el) + 1;
      return `${parentSel} > ${tag}:nth-of-type(${index})`;
    }
    return `${parentSel} > ${tag}`;
  }

  return tag;
}

/**
 * Computes a relative CSS selector from container to target element
 */
export function computeRelativeSelector(container: HTMLElement, target: HTMLElement): string {
  if (container === target) {
    return '';
  }

  const tag = target.tagName.toLowerCase();

  // Try tag alone if unique inside container
  try {
    const byTag = container.querySelectorAll(tag);
    if (byTag.length === 1 && byTag[0] === target) {
      return tag;
    }
  } catch (_) {}

  // Try tag + classes
  const classes = Array.from(target.classList).filter(
    (c) => !c.includes(':') && c.length < 25
  );
  if (classes.length > 0) {
    for (let count = 1; count <= Math.min(3, classes.length); count++) {
      const candidate = tag + '.' + classes.slice(0, count).map((c) => CSS.escape(c)).join('.');
      try {
        const matches = container.querySelectorAll(candidate);
        if (matches.length === 1 && matches[0] === target) {
          return candidate;
        }
      } catch (_) {}
    }
  }

  // Walk up path from target to container
  const path: string[] = [];
  let curr: HTMLElement | null = target;
  while (curr && curr !== container) {
    const currentTag = curr.tagName.toLowerCase();
    const parent: HTMLElement | null = curr.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children).filter((c) => c.tagName === curr?.tagName);
    if (siblings.length > 1) {
      const idx = siblings.indexOf(curr) + 1;
      path.unshift(`${currentTag}:nth-of-type(${idx})`);
    } else {
      path.unshift(currentTag);
    }
    curr = parent;
  }

  const fullPath = path.join(' > ');
  try {
    if (container.querySelector(fullPath) === target) {
      return fullPath;
    }
  } catch (_) {}

  return fullPath || tag;
}

/**
 * Derives container selector for c1 and c2 under LCA
 */
export function deriveContainerSelector(lca: HTMLElement, c1: HTMLElement, c2: HTMLElement): string {
  const tag = c1.tagName.toLowerCase();
  const c1Classes = Array.from(c1.classList);
  const c2Classes = new Set(Array.from(c2.classList));

  const commonClasses = c1Classes.filter(
    (cls) => c2Classes.has(cls) && !cls.includes(':') && cls.length < 30
  );

  const lcaSel = getUniqueSelector(lca);

  // Strategy 1: Shared tag + shared classes directly
  if (commonClasses.length > 0) {
    for (let len = commonClasses.length; len >= 1; len--) {
      const clsSelector = tag + '.' + commonClasses.slice(0, len).map((c) => CSS.escape(c)).join('.');
      try {
        const matches = Array.from(document.querySelectorAll(clsSelector));
        if (matches.includes(c1) && matches.includes(c2) && matches.length >= 2) {
          return clsSelector;
        }
      } catch (_) {}

      // Try scoped to LCA
      const scopedSelector = `${lcaSel} > ${clsSelector}`;
      try {
        const matches = Array.from(document.querySelectorAll(scopedSelector));
        if (matches.includes(c1) && matches.includes(c2) && matches.length >= 2) {
          return scopedSelector;
        }
      } catch (_) {}
    }
  }

  // Strategy 2: Direct children of LCA with same tag
  const directTagSelector = `${lcaSel} > ${tag}`;
  try {
    const matches = Array.from(document.querySelectorAll(directTagSelector));
    if (matches.includes(c1) && matches.includes(c2) && matches.length >= 2) {
      return directTagSelector;
    }
  } catch (_) {}

  // Strategy 3: Any direct child of LCA
  const directChildrenSelector = `${lcaSel} > *`;
  try {
    const matches = Array.from(document.querySelectorAll(directChildrenSelector));
    if (matches.includes(c1) && matches.includes(c2) && matches.length >= 2) {
      return directChildrenSelector;
    }
  } catch (_) {}

  return `${lcaSel} > ${tag}`;
}

/**
 * Main pattern inference function
 */
export function inferRepeatingPattern(
  el1: HTMLElement,
  el2: HTMLElement
): PatternInferenceResult {
  if (el1 === el2) {
    const selfSelector = getUniqueSelector(el1);
    return {
      containerSelector: selfSelector,
      relativeFieldSelector: '',
      matchedCount: 1,
    };
  }

  const lcaData = findLCAAndContainers(el1, el2);
  if (!lcaData) {
    const tag = el1.tagName.toLowerCase();
    const count = document.querySelectorAll(tag).length;
    return {
      containerSelector: tag,
      relativeFieldSelector: '',
      matchedCount: count,
    };
  }

  const { lca, c1, c2 } = lcaData;
  const containerSelector = deriveContainerSelector(lca, c1, c2);

  let matchedCount = 0;
  try {
    matchedCount = document.querySelectorAll(containerSelector).length;
  } catch (_) {
    matchedCount = 2;
  }

  const relativeFieldSelector = computeRelativeSelector(c1, el1);

  return {
    containerSelector,
    relativeFieldSelector,
    matchedCount,
  };
}
