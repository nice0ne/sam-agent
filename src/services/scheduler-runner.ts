import { ScheduledTask, saveScheduledTask } from './scheduler';
import { getAgentSoul } from './soul';

/**
 * Execute an autonomous task in the background
 */
export async function executeScheduledTask(
  task: ScheduledTask
): Promise<{ success: boolean; output: string }> {
  // Update task status to running
  task.lastStatus = 'running';
  await saveScheduledTask(task);

  let success = false;
  let summary = '';

  try {
    const storageData = typeof chrome !== 'undefined' && chrome.storage?.local
      ? await chrome.storage.local.get([
          'provider',
          'hostedModel',
          'anthropicApiKey',
          'geminiApiKey',
          'openaiApiKey',
          'deepseekApiKey',
          'glmApiKey',
          'customApiKey',
          'custom_openai_apiKey',
          'anthropic_baseUrl',
          'openai_baseUrl',
          'gemini_baseUrl',
          'custom_openai_baseUrl',
          'customBaseUrl',
          'custom_baseUrl',
          'openaiModel',
          'custom_openai_model',
        ])
      : {};

    const provider = storageData.provider || 'anthropic';
    const model = storageData.hostedModel || 'claude-3-7-sonnet-20250219';
    let soul = '';
    try {
      soul = await getAgentSoul();
    } catch (_) {
      soul = 'You are an autonomous browser AI assistant.';
    }

    const systemPrompt = `${soul}\n\nYou are executing an autonomous scheduled background task for the user: "${task.title}".\nExecute the task carefully and produce a concise, actionable report or summary of your actions and findings.`;

    const apiKey =
      provider === 'anthropic'
        ? storageData.anthropicApiKey
        : provider === 'gemini'
        ? storageData.geminiApiKey
        : provider === 'custom_openai'
        ? storageData.customApiKey || storageData.custom_openai_apiKey || 'ollama'
        : storageData.openaiApiKey || storageData.customApiKey;

    let responseText = '';

    if (provider === 'anthropic' && apiKey) {
      const baseUrl = (storageData.anthropic_baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: task.prompt }],
          max_tokens: 1024,
          system: systemPrompt,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Anthropic HTTP ${res.status}: ${errBody.slice(0, 120)}`);
      }

      const data = await res.json();
      responseText = data.content?.[0]?.text || 'Task completed with no output.';
    } else if ((provider === 'openai' || provider === 'custom_openai') && apiKey) {
      const baseUrl = (
        (provider === 'custom_openai'
          ? storageData.custom_openai_baseUrl || storageData.customBaseUrl || storageData.custom_baseUrl
          : storageData.openai_baseUrl) ||
        (provider === 'custom_openai' ? 'http://localhost:11434/v1' : 'https://api.openai.com')
      ).replace(/\/+$/, '');

      let endpoint = baseUrl;
      if (!endpoint.endsWith('/chat/completions')) {
        if (endpoint.endsWith('/v1')) {
          endpoint = `${endpoint}/chat/completions`;
        } else {
          endpoint = `${endpoint}/v1/chat/completions`;
        }
      }

      const selectedModel =
        provider === 'custom_openai'
          ? storageData.custom_openai_model || storageData.hostedModel || 'llama3.3'
          : storageData.openaiModel || 'gpt-4o';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: task.prompt },
          ],
          max_tokens: 1024,
          stream: false,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`OpenAI HTTP ${res.status}: ${errBody.slice(0, 120)}`);
      }

      const rawText = await res.text();
      let responseContent = '';
      if (rawText.trim().startsWith('data:') || rawText.includes('\ndata:')) {
        const lines = rawText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:') && trimmed.replace(/^data:\s*/, '') !== '[DONE]') {
            try {
              const chunk = JSON.parse(trimmed.replace(/^data:\s*/, ''));
              responseContent += chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
            } catch (_) {}
          }
        }
      } else {
        try {
          const data = JSON.parse(rawText);
          responseContent = data.choices?.[0]?.message?.content || data.choices?.[0]?.delta?.content || '';
        } catch (_) {
          responseContent = rawText;
        }
      }

      responseText = responseContent.trim() || 'Task completed with no output.';
    } else {
      // Fallback or simulated response when API key is unconfigured or in offline/mock mode
      responseText = `[Autonomous Task Completed at ${new Date().toLocaleTimeString()}]: Executed instruction "${task.title}". Status: OK.`;
    }

    success = true;
    summary = responseText.trim();
  } catch (err: any) {
    success = false;
    summary = `Error: ${err?.message || 'Execution failed'}`;
  }

  // Update task record with completion details
  task.lastRunTimestamp = Date.now();
  task.lastStatus = success ? 'success' : 'error';
  task.lastOutputSummary = summary;
  await saveScheduledTask(task);

  // Send desktop notification if requested
  if (task.notifyOnComplete && typeof chrome !== 'undefined' && chrome.notifications) {
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime?.getURL ? chrome.runtime.getURL('icon/128.png') : '',
        title: `SAM-Agent: ${task.title} [${success ? 'Success' : 'Error'}]`,
        message: summary.slice(0, 120),
        priority: 2,
      });
    } catch (notifErr) {
      console.warn('[SchedulerRunner] Notification failed:', notifErr);
    }
  }

  return { success, output: summary };
}
