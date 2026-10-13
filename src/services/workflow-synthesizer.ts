import { RecordedAction } from '../../entrypoints/workflow-recorder.content/types';

export interface SynthesizedParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue: string;
  description: string;
}

export interface SynthesizedWorkflow {
  toolName: string;
  description: string;
  parameters: SynthesizedParameter[];
  code: string;
}

/**
 * Normalizes string into a clean camelCase identifier
 */
function toCamelCase(str: string): string {
  const cleaned = str
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim();
  if (!cleaned) return 'param';

  const parts = cleaned.split(/[\s_-]+/);
  return parts
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join('');
}

/**
 * Optimizes the raw action trace by removing redundant steps
 */
export function optimizeActionTrace(actions: RecordedAction[]): RecordedAction[] {
  if (!actions || actions.length === 0) return [];

  const optimized: RecordedAction[] = [];
  let lastAction: RecordedAction | null = null;

  // Track the most recent fill action per selector to collapse typing cycles
  const lastFillMap = new Map<string, number>();

  for (let i = 0; i < actions.length; i++) {
    const curr = actions[i];

    // Filter duplicate consecutive clicks on identical element within 400ms
    if (
      curr.type === 'click' &&
      lastAction &&
      lastAction.type === 'click' &&
      lastAction.target.selectors[0] === curr.target.selectors[0] &&
      curr.timestamp - lastAction.timestamp < 400
    ) {
      continue;
    }

    // For fills on the same input, only retain the final typed value
    if (curr.type === 'fill') {
      const primarySel = curr.target.selectors[0] || curr.target.name || 'input';
      if (lastFillMap.has(primarySel)) {
        const prevIdx = lastFillMap.get(primarySel)!;
        optimized[prevIdx] = curr; // Overwrite previous fill
        lastAction = curr;
        continue;
      }
      lastFillMap.set(primarySel, optimized.length);
    }

    optimized.push(curr);
    lastAction = curr;
  }

  return optimized;
}

/**
 * Infers dynamic parameters from user input steps
 */
export function inferParameters(actions: RecordedAction[]): {
  parameters: SynthesizedParameter[];
  actionParamMap: Map<string, string>;
} {
  const parameters: SynthesizedParameter[] = [];
  const actionParamMap = new Map<string, string>();
  const usedNames = new Set<string>();

  let paramIndex = 1;

  for (const act of actions) {
    if (act.type === 'fill' && act.value !== undefined) {
      const target = act.target;
      let rawCandidate = '';

      if (target.placeholder) {
        rawCandidate = target.placeholder.replace(/^(enter|type|search|input)\s+/i, '');
      } else if (target.name) {
        rawCandidate = target.name;
      } else if (target.ariaLabel) {
        rawCandidate = target.ariaLabel;
      } else if (target.selectors[0]?.includes('#')) {
        rawCandidate = target.selectors[0].replace(/^#/, '');
      }

      let candidateName = toCamelCase(rawCandidate);
      if (!candidateName || candidateName === 'param' || candidateName.length < 2) {
        candidateName = `inputField${paramIndex++}`;
      }

      // Ensure unique parameter name
      let finalName = candidateName;
      let counter = 2;
      while (usedNames.has(finalName)) {
        finalName = `${candidateName}${counter++}`;
      }
      usedNames.add(finalName);

      // Infer parameter description
      let desc = `Value for ${target.name || target.placeholder || target.selectors[0] || 'input'}`;
      if (candidateName.toLowerCase().includes('search') || candidateName.toLowerCase().includes('query')) {
        desc = 'Search query string';
      } else if (candidateName.toLowerCase().includes('email')) {
        desc = 'Email address';
      } else if (candidateName.toLowerCase().includes('password')) {
        desc = 'User password';
      }

      parameters.push({
        name: finalName,
        type: 'string',
        defaultValue: act.value,
        description: desc,
      });

      actionParamMap.set(act.id, finalName);
    }
  }

  return { parameters, actionParamMap };
}

/**
 * Synthesizes executable JavaScript code from actions and parameters
 */
export function synthesizeWorkflowCode(
  toolName: string,
  description: string,
  actions: RecordedAction[],
  parameters: SynthesizedParameter[],
  actionParamMap: Map<string, string>
): string {
  // Build JSDoc header
  let jsdoc = `/**\n * @tool ${toolName}\n * @description ${description || `Automatically executes recorded workflow for ${actions[0]?.url || 'target page'}.`}\n`;
  for (const param of parameters) {
    jsdoc += ` * @param {${param.type}} ${param.name} ${param.description} (default: "${param.defaultValue.replace(/"/g, '\\"')}")\n`;
  }
  jsdoc += ` */\n`;

  // Build function body
  let code = `${jsdoc}(async (args = {}) => {\n`;
  code += `  // Helper: locate element across resilient selector cascade and text fallback\n`;
  code += `  const findEl = (selectors, textMatch) => {\n`;
  code += `    for (const sel of selectors) {\n`;
  code += `      try {\n`;
  code += `        const el = document.querySelector(sel);\n`;
  code += `        if (el) return el;\n`;
  code += `      } catch (_) {}\n`;
  code += `    }\n`;
  code += `    if (textMatch && textMatch.text) {\n`;
  code += `      const all = document.querySelectorAll(textMatch.tag || '*');\n`;
  code += `      const targetText = textMatch.text.trim().toLowerCase();\n`;
  code += `      for (const el of all) {\n`;
  code += `        if (el.textContent && el.textContent.trim().toLowerCase() === targetText) {\n`;
  code += `          return el;\n`;
  code += `        }\n`;
  code += `      }\n`;
  code += `    }\n`;
  code += `    return null;\n`;
  code += `  };\n\n`;

  code += `  // Helper: wait until element appears with timeout\n`;
  code += `  const waitEl = async (selectors, textMatch, timeout = 6000) => {\n`;
  code += `    const start = Date.now();\n`;
  code += `    while (Date.now() - start < timeout) {\n`;
  code += `      const found = findEl(selectors, textMatch);\n`;
  code += `      if (found) return found;\n`;
  code += `      await new Promise((r) => setTimeout(r, 200));\n`;
  code += `    }\n`;
  code += `    throw new Error(\`Element not found within \${timeout}ms: \${selectors.slice(0, 3).join(' | ')}\`);\n`;
  code += `  };\n\n`;

  code += `  const delay = (ms) => new Promise((r) => setTimeout(r, ms));\n\n`;

  let stepNumber = 1;
  for (const act of actions) {
    const selArray = JSON.stringify(act.target.selectors);
    const textMatchJson = act.target.textMatch ? JSON.stringify(act.target.textMatch) : 'null';

    code += `  // Step ${stepNumber++}: ${act.type.toUpperCase()} on ${act.target.selectors[0] || act.target.tagName}\n`;
    code += `  try {\n`;

    if (act.type === 'click') {
      code += `    const el = await waitEl(${selArray}, ${textMatchJson});\n`;
      code += `    el.scrollIntoView({ behavior: 'smooth', block: 'center' });\n`;
      code += `    await delay(150);\n`;
      code += `    el.click();\n`;
      code += `    await delay(300);\n`;
    } else if (act.type === 'fill') {
      const paramName = actionParamMap.get(act.id);
      const defaultVal = (act.value || '').replace(/"/g, '\\"');
      code += `    const el = await waitEl(${selArray}, ${textMatchJson});\n`;
      code += `    el.focus();\n`;
      if (paramName) {
        code += `    el.value = args.${paramName} !== undefined ? args.${paramName} : "${defaultVal}";\n`;
      } else {
        code += `    el.value = "${defaultVal}";\n`;
      }
      code += `    el.dispatchEvent(new Event('input', { bubbles: true }));\n`;
      code += `    el.dispatchEvent(new Event('change', { bubbles: true }));\n`;
      code += `    await delay(200);\n`;
    } else if (act.type === 'select') {
      code += `    const el = await waitEl(${selArray}, ${textMatchJson});\n`;
      code += `    el.value = "${(act.value || '').replace(/"/g, '\\"')}";\n`;
      code += `    el.dispatchEvent(new Event('change', { bubbles: true }));\n`;
      code += `    await delay(200);\n`;
    } else if (act.type === 'toggle') {
      code += `    const el = await waitEl(${selArray}, ${textMatchJson});\n`;
      code += `    el.checked = ${Boolean(act.checked)};\n`;
      code += `    el.dispatchEvent(new Event('change', { bubbles: true }));\n`;
      code += `    await delay(150);\n`;
    } else if (act.type === 'navigate') {
      code += `    if (!window.location.href.includes("${(act.value || '').replace(/"/g, '\\"')}")) {\n`;
      code += `      window.location.href = "${(act.value || '').replace(/"/g, '\\"')}";\n`;
      code += `      await delay(1500);\n`;
      code += `    }\n`;
    }

    code += `  } catch (err) {\n`;
    code += `    return {\n`;
    code += `      success: false,\n`;
    code += `      failedStep: ${stepNumber - 1},\n`;
    code += `      action: "${act.type}",\n`;
    code += `      error: err && err.message ? err.message : String(err)\n`;
    code += `    };\n`;
    code += `  }\n\n`;
  }

  code += `  return {\n`;
  code += `    success: true,\n`;
  code += `    message: "Workflow executed successfully.",\n`;
  code += `    completedSteps: ${stepNumber - 1},\n`;
  code += `    url: window.location.href\n`;
  code += `  };\n`;
  code += `});\n`;

  return code;
}

/**
 * Main synthesis entry point
 */
export function synthesizeWorkflow(
  rawToolName: string,
  rawDescription: string,
  rawActions: RecordedAction[]
): SynthesizedWorkflow {
  const toolName = toCamelCase(rawToolName || 'myRecordedWorkflow');
  const description = rawDescription || 'Automated workflow synthesized from user recording.';
  const optimizedActions = optimizeActionTrace(rawActions);
  const { parameters, actionParamMap } = inferParameters(optimizedActions);
  const code = synthesizeWorkflowCode(
    toolName,
    description,
    optimizedActions,
    parameters,
    actionParamMap
  );

  return {
    toolName,
    description,
    parameters,
    code,
  };
}
