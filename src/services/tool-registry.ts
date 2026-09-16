import { listVfsFiles, saveVfsFile, getVfsFile, deleteVfsFile } from './vfs';

export interface UserToolMeta {
  name: string;
  path: string;
  description: string;
  paramsHelp: string;
  code: string;
  enabled: boolean;
  updatedAt: number;
}

const STORAGE_KEY_USER_TOOLS = 'userToolsConfig';

/**
 * Parse JSDoc comments to extract @tool or @name, @description, and @param declarations.
 */
export function parseToolJSDoc(code: string): {
  name?: string;
  description: string;
  paramsHelp: string;
} {
  const jsdocMatch = code.match(/\/\*\*([\s\S]*?)\*\//);
  if (!jsdocMatch) {
    return {
      description: '',
      paramsHelp: '',
    };
  }

  const jsdoc = jsdocMatch[1];
  const lines = jsdoc.split('\n');

  let name: string | undefined;
  const descLines: string[] = [];
  const paramLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\s*\*\s?/, '').trim();
    if (!line) continue;

    if (line.startsWith('@tool')) {
      const match = line.match(/^@tool\s+([a-zA-Z0-9_-]+)/);
      if (match) {
        name = match[1];
      }
    } else if (line.startsWith('@name')) {
      const match = line.match(/^@name\s+([a-zA-Z0-9_-]+)/);
      if (match && !name) {
        name = match[1];
      }
    } else if (line.startsWith('@description') || line.startsWith('@desc')) {
      const descText = line.replace(/^@(description|desc)\s*/, '').trim();
      if (descText) descLines.push(descText);
    } else if (line.startsWith('@param')) {
      const paramText = line.replace(/^@param\s*/, '').trim();
      if (paramText) paramLines.push(paramText);
    } else if (!line.startsWith('@')) {
      // General description line before other tags if descLines is still empty
      if (descLines.length === 0 && !line.startsWith('@')) {
        descLines.push(line);
      }
    }
  }

  return {
    name,
    description: descLines.join(' ').trim(),
    paramsHelp: paramLines.join('; ').trim(),
  };
}

/**
 * List all user tools saved in VFS under /tools/*.js
 * and merge with enabled status stored in chrome.storage.local
 */
export async function listUserTools(): Promise<UserToolMeta[]> {
  const files = await listVfsFiles('/tools');
  const jsFiles = files.filter(
    (f) => f.path.startsWith('/tools/') && f.path.endsWith('.js')
  );

  let enabledConfig: Record<string, boolean> = {};
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(STORAGE_KEY_USER_TOOLS);
      if (stored && stored[STORAGE_KEY_USER_TOOLS]) {
        enabledConfig = stored[STORAGE_KEY_USER_TOOLS];
      }
    }
  } catch (err) {
    console.warn('[ToolRegistry] Failed to read userToolsConfig from chrome.storage:', err);
  }

  const tools: UserToolMeta[] = [];

  for (const file of jsFiles) {
    const parsed = parseToolJSDoc(file.content);
    // Derive tool name from jsdoc tag or filename
    const fileBaseName = file.name.replace(/\.js$/, '');
    const toolName = parsed.name || fileBaseName;
    const isEnabled = enabledConfig[toolName] !== false; // enabled by default unless explicitly false

    tools.push({
      name: toolName,
      path: file.path,
      description: parsed.description || `Custom tool defined in ${file.path}`,
      paramsHelp: parsed.paramsHelp || 'None',
      code: file.content,
      enabled: isEnabled,
      updatedAt: file.updatedAt,
    });
  }

  return tools;
}

/**
 * Toggle enabled state of a user tool in chrome.storage.local
 */
export async function toggleUserTool(toolName: string, enabled: boolean): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(STORAGE_KEY_USER_TOOLS);
      const config: Record<string, boolean> = stored?.[STORAGE_KEY_USER_TOOLS] || {};
      config[toolName] = enabled;
      await chrome.storage.local.set({ [STORAGE_KEY_USER_TOOLS]: config });
    }
  } catch (err) {
    console.error('[ToolRegistry] Failed to toggle tool state:', err);
    throw err;
  }
}

/**
 * Normalizes tool name and creates a starter template in /tools/${cleanName}.js
 */
export async function createUserToolTemplate(
  name: string,
  description?: string
): Promise<string> {
  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'new_tool';
  const filePath = `/tools/${cleanName}.js`;
  const desc = description || `Custom tool ${cleanName}`;

  const boilerplate = `/**
 * @tool ${cleanName}
 * @description ${desc}
 * @param {string} [query] - Optional search or target query
 * @returns {Promise<any>|any} Result returned to SAM-Agent
 */
(async (args) => {
  // Access args passed from agent: args.query, args.target, etc.
  console.log('[Tool:${cleanName}] running with args:', args);

  // You have full access to DOM and window in the active web page
  const title = document.title;
  const url = window.location.href;

  return {
    success: true,
    message: "Executed ${cleanName} successfully",
    url,
    title,
    args
  };
})(args);
`;

  await saveVfsFile(filePath, boilerplate, 'text/javascript');
  return filePath;
}

/**
 * Generates prompt section describing active user tools and the action block format.
 */
export function formatUserToolsPrompt(tools: UserToolMeta[]): string {
  const enabledTools = tools.filter((t) => t.enabled);
  if (enabledTools.length === 0) {
    return '';
  }

  let prompt = `\n### CUSTOM USER TOOLS (VFS /tools/):\n`;
  prompt += `You have access to custom user-defined browser tools that execute directly inside the active web page.\n`;
  prompt += `To invoke a custom tool, use the \`runTool\` action block:\n`;
  prompt += `\`\`\`action\n[\n  { "action": "runTool", "tool": "tool_name", "args": { "paramName": "value" } }\n]\n\`\`\`\n\n`;
  prompt += `Available Custom Tools:\n`;

  for (const tool of enabledTools) {
    prompt += `- **${tool.name}** (path: \`${tool.path}\`)\n`;
    prompt += `  - Description: ${tool.description}\n`;
    prompt += `  - Parameters: ${tool.paramsHelp}\n`;
  }

  return prompt;
}

/**
 * Executes a user tool by name inside the specified browser tab via chrome.scripting.executeScript.
 */
export async function executeUserTool(
  tabId: number,
  toolName: string,
  args: Record<string, any> = {}
): Promise<any> {
  const tools = await listUserTools();
  const tool = tools.find((t) => t.name.toLowerCase() === toolName.toLowerCase());

  if (!tool) {
    return {
      success: false,
      tool: toolName,
      error: `Custom tool "${toolName}" not found in VFS /tools/. Available tools: ${tools.map((t) => t.name).join(', ') || 'none'}`,
    };
  }

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
      tool: toolName,
      error: 'No active browser tab found to execute custom tool.',
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: 'MAIN',
      func: (codeToRun: string, toolArgs: Record<string, any>) => {
        try {
          const fn = new Function(
            'args',
            `return (async () => {
              try {
                ${codeToRun}
              } catch (innerErr) {
                return {
                  success: false,
                  error: innerErr && innerErr.message ? innerErr.message : String(innerErr),
                  stack: innerErr && innerErr.stack ? innerErr.stack : undefined
                };
              }
            })();`
          );
          return fn(toolArgs);
        } catch (syntaxErr: any) {
          return {
            success: false,
            error: `Syntax or compilation error: ${syntaxErr?.message || syntaxErr}`,
          };
        }
      },
      args: [tool.code, args],
    });

    if (results && results[0]) {
      return results[0].result;
    }

    return {
      success: false,
      tool: toolName,
      error: 'No result returned from tab execution.',
    };
  } catch (err: any) {
    console.error(`[ToolRegistry] Error executing tool "${toolName}":`, err);
    return {
      success: false,
      tool: toolName,
      error: `Failed to execute tool in tab ${targetTabId}: ${err?.message || String(err)}`,
    };
  }
}

// Re-export VFS helper functions for convenience
export { getVfsFile, deleteVfsFile };
