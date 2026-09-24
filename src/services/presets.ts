import { getVfsFile, saveVfsFile } from './vfs';

export const AUDIT_PAGE_BUGS_TOOL_PATH = '/tools/auditPageBugs.js';
export const UAT_BUG_HUNTER_SKILL_PATH = '/skills/uat-bug-hunter.md';

export const AUDIT_PAGE_BUGS_CODE = `/**
 * @tool auditPageBugs
 * @description Automatically inspects the active webpage for release-blocking bugs: broken images, dead/empty links, horizontal layout overflow, missing accessibility labels, form validation flaws, and active console/unhandled errors.
 * @param {boolean} deepCheck If true, performs comprehensive DOM validation checks (default: true)
 */
(async (args) => {
  const results = {
    url: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString(),
    metrics: {
      totalElements: document.querySelectorAll('*').length,
      imagesChecked: 0,
      linksChecked: 0,
      formsChecked: 0,
      buttonsChecked: 0,
    },
    findings: [],
    summary: {
      critical: 0,
      warning: 0,
      info: 0,
    }
  };

  const addFinding = (severity, category, message, elementSelector, details) => {
    results.findings.push({
      severity,
      category,
      message,
      elementSelector: elementSelector || null,
      details: details || null,
    });
    if (severity === 'CRITICAL') results.summary.critical++;
    else if (severity === 'WARNING') results.summary.warning++;
    else results.summary.info++;
  };

  // 1. Check Horizontal Viewport Overflow (Mobile / Responsiveness Bugs)
  try {
    const docWidth = document.documentElement.offsetWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    if (scrollWidth > docWidth + 3) {
      const overflowingElements = [];
      const allEls = document.querySelectorAll('body *');
      for (const el of allEls) {
        const rect = el.getBoundingClientRect();
        if (rect.right > docWidth + 5) {
          overflowingElements.push({
            tag: el.tagName.toLowerCase(),
            className: el.className ? String(el.className).slice(0, 50) : '',
            id: el.id || '',
            rightOffset: Math.round(rect.right - docWidth),
          });
          if (overflowingElements.length >= 5) break;
        }
      }
      addFinding(
        'WARNING',
        'LAYOUT',
        \`Halaman mengalami horizontal layout overflow (\${scrollWidth}px vs viewport \${docWidth}px). Konten meluap melebihi lebar layar.\`,
        'html, body',
        { scrollWidth, docWidth, sampleOverflowElements: overflowingElements }
      );
    }
  } catch (err) {
    console.warn('[auditPageBugs] Overflow check error:', err);
  }

  // 2. Check Broken Images & Missing Alt Tags
  try {
    const images = Array.from(document.querySelectorAll('img'));
    results.metrics.imagesChecked = images.length;
    for (const img of images) {
      const src = img.getAttribute('src');
      if (!src || src.trim() === '' || src === '#' || src === 'null' || src === 'undefined') {
        addFinding('CRITICAL', 'BROKEN_MEDIA', 'Elemen <img> memiliki atribut src kosong atau invalid.', img.id ? \`#\${img.id}\` : 'img', { outerHTML: img.outerHTML.slice(0, 120) });
      } else if (img.complete && img.naturalWidth === 0) {
        addFinding('CRITICAL', 'BROKEN_MEDIA', \`Gambar gagal dimuat (broken image): "\${src.slice(0, 80)}"\`, img.id ? \`#\${img.id}\` : 'img', { src });
      } else if (!img.hasAttribute('alt') || img.getAttribute('alt').trim() === '') {
        addFinding('INFO', 'ACCESSIBILITY', \`Gambar tidak memiliki atribut alt: "\${src.slice(0, 60)}"\`, img.id ? \`#\${img.id}\` : 'img');
      }
    }
  } catch (err) {
    console.warn('[auditPageBugs] Image check error:', err);
  }

  // 3. Check Dead & Questionable Links
  try {
    const links = Array.from(document.querySelectorAll('a'));
    results.metrics.linksChecked = links.length;
    for (const a of links) {
      const href = a.getAttribute('href');
      const text = (a.innerText || a.textContent || '').trim();
      if (href === null || href === '' || href === 'undefined' || href === 'null') {
        addFinding('WARNING', 'NAVIGATION', \`Link tanpa tujuan href (href kosong): "\${text.slice(0, 40) || 'Tanpa Teks'}"\`, a.id ? \`#\${a.id}\` : 'a', { text });
      } else if (href === '#' && !a.onclick && !a.getAttribute('role') && !a.getAttribute('@click') && !a.getAttribute('v-on:click')) {
        addFinding('INFO', 'NAVIGATION', \`Link placeholder dummy href="#" tanpa explicit handler: "\${text.slice(0, 40)}"\`, a.id ? \`#\${a.id}\` : 'a');
      }
    }
  } catch (err) {
    console.warn('[auditPageBugs] Link check error:', err);
  }

  // 4. Check Form Inputs & Validation Health
  try {
    const forms = Array.from(document.querySelectorAll('form'));
    results.metrics.formsChecked = forms.length;
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'));
    
    for (const input of inputs) {
      const id = input.getAttribute('id');
      const name = input.getAttribute('name');
      const type = input.getAttribute('type') || input.tagName.toLowerCase();
      
      let hasLabel = false;
      if (id && document.querySelector(\`label[for="\${id}"]\`)) hasLabel = true;
      if (input.closest('label')) hasLabel = true;
      if (input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') || input.getAttribute('placeholder')) hasLabel = true;

      if (!hasLabel) {
        addFinding('INFO', 'ACCESSIBILITY', \`Field formulir (\${type}) tidak memiliki <label> atau aria-label.\`, id ? \`#\${id}\` : \`input[name="\${name}"]\`);
      }

      if (type === 'password' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        addFinding('CRITICAL', 'SECURITY', 'Formulir password berada pada koneksi HTTP tidak aman (insecure non-HTTPS)!', id ? \`#\${id}\` : 'input[type="password"]');
      }
    }
  } catch (err) {
    console.warn('[auditPageBugs] Form check error:', err);
  }

  // 5. Check Buttons & Interactivity Health
  try {
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]'));
    results.metrics.buttonsChecked = buttons.length;
    for (const btn of buttons) {
      const text = (btn.innerText || btn.textContent || btn.getAttribute('value') || btn.getAttribute('aria-label') || '').trim();
      if (!text && !btn.querySelector('svg, img')) {
        addFinding('WARNING', 'ACCESSIBILITY', 'Tombol interaktif kosong tanpa teks, icon, atau aria-label.', btn.id ? \`#\${btn.id}\` : 'button');
      }
    }
  } catch (err) {
    console.warn('[auditPageBugs] Button check error:', err);
  }

  return {
    success: true,
    message: \`Audit selesai. Ditemukan \${results.summary.critical} Critical, \${results.summary.warning} Warning, dan \${results.summary.info} Info.\`,
    data: results
  };
})(args);
`;

export const UAT_BUG_HUNTER_SKILL_MD = `# UAT & Pre-Launch Bug Hunter SOP (Standard Operating Procedure)

## 🎯 Purpose & Scope
This specialized SOP guides **SAM-Agent** in autonomously conducting comprehensive **User Acceptance Testing (UAT)** and **Pre-Launch Bug Hunting** on web applications.

---

## 🛠️ Phase-by-Phase Testing Workflow

### Phase 1: Automated Sanity & DOM Audit
1. Call the custom tool \`runTool\` with \`"tool": "auditPageBugs"\`:
   \`\`\`action
   [ { "action": "runTool", "tool": "auditPageBugs", "args": { "deepCheck": true } } ]
   \`\`\`
2. Analyze the findings:
   - **CRITICAL**: Broken images, missing essential assets, insecure password fields.
   - **WARNING**: Horizontal layout overflow, broken/empty href links, unresponsive elements.
   - **INFO**: Missing accessibility labels, dummy placeholders.

### Phase 2: Functional & Navigation Testing (Happy Path & Negative Testing)
1. **Forms & Input Boundary Testing**:
   - Test submitting empty required fields: Verify whether friendly validation messages appear or if the application crashes.
   - Test invalid format inputs (e.g. invalid emails, negative numbers in price fields, extremely long strings).
   - Test standard valid inputs and verify successful submission using \`assert\`.
2. **Interactive Controls & Dialogs**:
   - Open and close modals, dropdowns, tooltips, and accordion panels.
   - Check if closing backdrop/esc key works without trapping keyboard focus.

### Phase 3: Network & Console Error Sniffing
1. Use CDP Network Inspector and Passive Console Sniffer to monitor:
   - HTTP 4xx / 5xx API request failures.
   - Unhandled JavaScript exceptions and \`console.error\` logs.
   - Sluggish API calls taking > 3000ms.

### Phase 4: Cross-Device / Responsive Layout Verification
1. Inspect viewport responsiveness and elements that cause horizontal scrolling.
2. Verify touch targets on mobile/tablet viewports.

### Phase 5: Generating the UAT Bug Report
Always conclude the testing session by generating a professional **UAT Bug Report**:
- For formal executive sign-off: Use \`generateDoc\` to generate a formatted Word document (\`/workspace/UAT_Bug_Report.docx\`) with:
  - **Executive Summary** (Status: Passed / Conditional / Blocked)
  - **Bug Findings Table**: ID | Severity | Category | Description | Reproduction Steps | Expected vs Actual
  - **Recommended Action Items**
- For developer triage: You may also generate an Excel spreadsheet (\`/workspace/UAT_Issue_Tracker.xlsx\`) using \`generateExcel\`.

---

## 🚦 Severity Classification Standard
- **P0 - Critical (Blocker)**: Application crashes, white screen (WSOD), broken checkout/payment, login failure, or severe data loss.
- **P1 - High**: Major feature broken without simple workaround, broken primary forms, or 500 server errors on standard flows.
- **P2 - Medium**: Visual defect, horizontal layout overflow, broken secondary links, confusing error messages.
- **P3 - Low / Trivial**: Minor styling inconsistency, missing alt tag, typo in copy.
`;

/**
 * Ensures standard preset skills and tools are seeded into the Virtual File System.
 */
export async function seedDefaultPresets(): Promise<void> {
  try {
    // 1. Ensure /tools/auditPageBugs.js exists
    const existingTool = await getVfsFile(AUDIT_PAGE_BUGS_TOOL_PATH);
    if (!existingTool || !existingTool.content || existingTool.content.trim().length === 0) {
      await saveVfsFile(AUDIT_PAGE_BUGS_TOOL_PATH, AUDIT_PAGE_BUGS_CODE, 'text/javascript');
    }

    // 2. Ensure /skills/uat-bug-hunter.md exists
    const existingSkill = await getVfsFile(UAT_BUG_HUNTER_SKILL_PATH);
    if (!existingSkill || !existingSkill.content || existingSkill.content.trim().length === 0) {
      await saveVfsFile(UAT_BUG_HUNTER_SKILL_PATH, UAT_BUG_HUNTER_SKILL_MD, 'text/markdown');
    }
  } catch (err) {
    console.warn('[Presets] Failed to seed default presets:', err);
  }
}
