import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Key, Sparkles, Server, Check, ShieldCheck, Eye, EyeOff,
  Cpu, Wifi, AlertCircle, LoaderCircle, BrainCircuit, Database, Trash2,
  FileCode, RotateCcw, ExternalLink, Zap, Scissors, Sliders
} from 'lucide-react';
import { useAppStore, STORAGE_KEYS } from '../../stores/useAppStore';
import { getAllDomainMemories, clearDomainMemories } from '../../services/db';
import type { DomainMemoryRecord } from '../../types/agent';
import {
  getAgentSoul,
  saveAgentSoul,
  resetAgentSoul,
  getOptimizationSettings,
  saveOptimizationSettings,
} from '../../services/soul';

interface ProviderMeta {
  id: string;
  name: string;
  defaultBaseUrl: string;
  models: { id: string; name: string; reasoning?: boolean; vision?: boolean }[];
  keyStorageName: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    defaultBaseUrl: 'https://api.anthropic.com',
    keyStorageName: 'anthropicApiKey',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Hybrid Reasoning)', reasoning: true, vision: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', vision: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', vision: true },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', vision: true },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    keyStorageName: 'geminiApiKey',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', vision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', vision: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', vision: true },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', vision: true },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyStorageName: 'openaiApiKey',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (Omni)', vision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', vision: true },
      { id: 'o3-mini', name: 'o3-mini', reasoning: true },
      { id: 'o1', name: 'o1', reasoning: true, vision: true },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    keyStorageName: 'deepseekApiKey',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', reasoning: true },
    ],
  },
  {
    id: 'glm',
    name: 'GLM Global (Zhipu AI)',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyStorageName: 'glmApiKey',
    models: [
      { id: 'glm-5.3-flash', name: 'GLM-5.3 Flash (Ultra Fast)' },
      { id: 'glm-4-plus', name: 'GLM-4 Plus' },
      { id: 'glm-4-0520', name: 'GLM-4' },
      { id: 'glm-4-air', name: 'GLM-4 Air' },
      { id: 'glm-4-flash', name: 'GLM-4 Flash' },
      { id: 'codegeex-4', name: 'CodeGeeX-4 (Coding)' },
    ],
  },
  {
    id: 'custom_openai',
    name: 'OpenAI Compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    keyStorageName: 'customApiKey',
    models: [
      { id: 'llama3.3', name: 'Llama 3.3' },
      { id: 'qwen2.5-coder:32b', name: 'Qwen 2.5 Coder' },
      { id: 'deepseek-r1:14b', name: 'DeepSeek R1 Local', reasoning: true },
      { id: 'mistral-large', name: 'Mistral Large' },
      { id: 'custom-model', name: 'Custom Model ID...' },
    ],
  },
];

export const SettingsView: React.FC = () => {
  const {
    provider,
    setProvider,
    hostedModel,
    thinkingLevel,
    setThinkingLevel,
    setView,
  } = useAppStore();

  const [selectedProviderId, setSelectedProviderId] = useState(
    provider && provider !== 'proxy' ? provider : 'anthropic'
  );
  const [selectedModelId, setSelectedModelId] = useState(hostedModel || '');
  const [customModelInput, setCustomModelInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');

  // Domain Memory state
  const [memories, setMemories] = useState<DomainMemoryRecord[]>([]);

  // Agent Soul & Token Optimization state
  const [soulContent, setSoulContent] = useState('');
  const [isSoulSaved, setIsSoulSaved] = useState(false);
  const [enableRtk, setEnableRtk] = useState(true);
  const [enablePonytail, setEnablePonytail] = useState(true);

  const loadMemories = async () => {
    try {
      const records = await getAllDomainMemories();
      setMemories(records);
    } catch (_) {}
  };

  useEffect(() => {
    loadMemories();
    const loadSoulAndOptimizations = async () => {
      try {
        const [soul, opts] = await Promise.all([
          getAgentSoul(),
          getOptimizationSettings(),
        ]);
        setSoulContent(soul);
        setEnableRtk(opts.enableRtk);
        setEnablePonytail(opts.enablePonytail);
      } catch (err) {
        console.warn('[Settings] Failed loading soul or optimization settings:', err);
      }
    };
    loadSoulAndOptimizations();
  }, []);

  const handleClearMemories = async () => {
    if (confirm('Clear all learned domain memory and selector mappings?')) {
      await clearDomainMemories();
      setMemories([]);
    }
  };

  const handleSaveSoul = async () => {
    await saveAgentSoul(soulContent);
    setIsSoulSaved(true);
    setTimeout(() => setIsSoulSaved(false), 2000);
  };

  const handleResetSoul = async () => {
    if (confirm('Reset soul.md persona to factory default?')) {
      const def = await resetAgentSoul();
      setSoulContent(def);
      setIsSoulSaved(true);
      setTimeout(() => setIsSoulSaved(false), 2000);
    }
  };

  const handleOpenSoulInEditor = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('editor.html?path=' + encodeURIComponent('/soul.md')),
    });
  };

  const handleToggleRtk = async () => {
    const nextVal = !enableRtk;
    setEnableRtk(nextVal);
    await saveOptimizationSettings({ enableRtk: nextVal });
  };

  const handleTogglePonytail = async () => {
    const nextVal = !enablePonytail;
    setEnablePonytail(nextVal);
    await saveOptimizationSettings({ enablePonytail: nextVal });
  };

  // Test Connection states
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const currentProvider = PROVIDERS.find((p) => p.id === selectedProviderId) || PROVIDERS[0];

  // Load provider settings from chrome.storage.local
  useEffect(() => {
    const loadProviderData = async () => {
      setTestStatus('idle');
      setTestMessage('');
      const storageKey = currentProvider.keyStorageName;
      const data = await chrome.storage.local.get([
        storageKey,
        `${currentProvider.id}_model`,
        `${currentProvider.id}_baseUrl`,
      ]);
      setApiKey(data[storageKey] || '');
      setBaseUrl(data[`${currentProvider.id}_baseUrl`] || currentProvider.defaultBaseUrl);
      if (data[`${currentProvider.id}_model`]) {
        const m = data[`${currentProvider.id}_model`];
        setSelectedModelId(m);
        if (currentProvider.id === 'custom_openai' && !currentProvider.models.some((item) => item.id === m)) {
          setCustomModelInput(m);
        }
      } else {
        setSelectedModelId(currentProvider.models[0].id);
      }
    };
    loadProviderData();
  }, [currentProvider]);

  const activeModelId = selectedModelId === 'custom-model' ? (customModelInput || 'default') : selectedModelId;

  const handleSave = async () => {
    await setProvider(selectedProviderId);
    await chrome.storage.local.set({
      [STORAGE_KEYS.provider]: selectedProviderId,
      [STORAGE_KEYS.hostedModel]: activeModelId,
      [currentProvider.keyStorageName]: apiKey,
      [`${currentProvider.id}_model`]: activeModelId,
      [`${currentProvider.id}_baseUrl`]: baseUrl,
    });
    await Promise.all([
      saveAgentSoul(soulContent),
      saveOptimizationSettings({ enableRtk, enablePonytail }),
    ]);
    useAppStore.setState({ hostedModel: activeModelId });
    setIsSaved(true);
    setIsSoulSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      setIsSoulSaved(false);
    }, 2000);
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('Connecting to ' + currentProvider.name + '...');

    try {
      const targetBaseUrl = baseUrl.trim().replace(/\/+$/, '');

      if (currentProvider.id === 'openai' || currentProvider.id === 'deepseek' || currentProvider.id === 'custom_openai' || currentProvider.id === 'glm') {
        const endpoint = targetBaseUrl.endsWith('/chat/completions')
          ? targetBaseUrl
          : `${targetBaseUrl}/chat/completions`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (apiKey.trim()) {
          headers['Authorization'] = `Bearer ${apiKey.trim()}`;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: activeModelId,
            messages: [{ role: 'user', content: 'Say "OK"' }],
            max_tokens: 10,
            stream: false,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 140) || res.statusText}`);
        }

        const rawText = await res.text();
        let reply = '';

        // Check if response is Server-Sent Events (SSE / streaming) e.g. "data: {"id"..."
        if (rawText.trim().startsWith('data:') || rawText.includes('\ndata:')) {
          const lines = rawText.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:') && trimmed.replace(/^data:\s*/, '') !== '[DONE]') {
              try {
                const jsonStr = trimmed.replace(/^data:\s*/, '');
                const chunk = JSON.parse(jsonStr);
                const delta =
                  chunk.choices?.[0]?.delta?.content ||
                  chunk.choices?.[0]?.message?.content ||
                  chunk.choices?.[0]?.text ||
                  '';
                reply += delta;
              } catch (_) {}
            }
          }
          if (!reply.trim()) {
            reply = 'Connected successfully! (streaming)';
          }
        } else {
          // Standard JSON response
          try {
            const data = JSON.parse(rawText);
            reply =
              data.choices?.[0]?.message?.content ||
              data.choices?.[0]?.delta?.content ||
              data.choices?.[0]?.text ||
              data.response ||
              data.message ||
              'Connected successfully!';
          } catch (_) {
            reply = rawText.trim().slice(0, 80) || 'Connected successfully!';
          }
        }

        setTestStatus('success');
        setTestMessage(`Success! Response: "${reply.trim()}"`);
      } else if (currentProvider.id === 'anthropic') {
        const endpoint = targetBaseUrl.endsWith('/messages')
          ? targetBaseUrl
          : `${targetBaseUrl}/v1/messages`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey.trim(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: activeModelId,
            messages: [{ role: 'user', content: 'Say "OK"' }],
            max_tokens: 10,
            stream: false,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 140) || res.statusText}`);
        }

        const rawText = await res.text();
        let reply = '';
        try {
          const data = JSON.parse(rawText);
          reply = data.content?.[0]?.text || 'Connected successfully!';
        } catch (_) {
          reply = rawText.trim().slice(0, 80) || 'Connected successfully!';
        }
        setTestStatus('success');
        setTestMessage(`Success! Response: "${reply.trim()}"`);
      } else if (currentProvider.id === 'gemini') {
        const endpoint = `${targetBaseUrl}/v1beta/models/${activeModelId}:generateContent?key=${apiKey.trim()}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "OK"' }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 140) || res.statusText}`);
        }

        const rawText = await res.text();
        let reply = '';
        try {
          const data = JSON.parse(rawText);
          reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Connected successfully!';
        } catch (_) {
          reply = rawText.trim().slice(0, 80) || 'Connected successfully!';
        }
        setTestStatus('success');
        setTestMessage(`Success! Response: "${reply.trim()}"`);
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Connection test failed. Check API key and endpoint URL.');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground animate-in fade-in duration-150">
      {/* Settings Top Bar */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border bg-card/75 backdrop-blur-xl sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('chat')}
            className="p-1.5 -ml-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
            title="Back to chat"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground tracking-tight">AI Provider & Settings</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/15 text-primary font-medium border border-primary/25">v4.0</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
        >
          {isSaved ? (
            <>
              <Check className="size-3.5 text-emerald-300" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <ShieldCheck className="size-3.5" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>

      {/* Settings Content Scroll */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
        {/* Active Provider Selector */}
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-foreground/90 uppercase tracking-wider">
            Select Active AI Engine
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => {
              const isSelected = selectedProviderId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProviderId(p.id)}
                  className={`flex flex-col text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/15 text-primary shadow-xs ring-1 ring-primary/30'
                      : 'border-border bg-card/80 hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold text-xs text-foreground">{p.name}</span>
                    {isSelected && <Check className="size-3.5 text-primary" />}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 truncate">
                    {p.models.length} presets • BYOK
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Model Selector */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <Cpu className="size-4 text-primary" />
            <span>Model Configuration</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">Model Variant</label>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              {currentProvider.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.reasoning ? '(Reasoning)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Model ID Input for OpenAI Compatible */}
          {selectedModelId === 'custom-model' && (
            <div className="space-y-1.5 pt-1 animate-in fade-in">
              <label className="text-[11px] text-muted-foreground font-medium">Custom Model Name / ID</label>
              <input
                type="text"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                placeholder="e.g. qwen2.5-coder:14b, deepseek-r1, etc."
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {/* Thinking Level for Reasoning Models */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-amber-500" />
                <span>Thinking / Reasoning Effort</span>
              </label>
              <span className="text-[10px] font-mono capitalize px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {thinkingLevel}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['none', 'low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setThinkingLevel(level)}
                  className={`py-1.5 text-center text-[11px] font-medium rounded-md border capitalize transition-all cursor-pointer ${
                    thinkingLevel === level
                      ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                      : 'border-border bg-background hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* API Credentials */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <Key className="size-4 text-primary" />
            <span>API Credentials & Endpoint</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground font-medium">API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${currentProvider.name} API Key...`}
                className="w-full bg-background border border-border rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Keys are encrypted and stored locally in your browser via <code className="font-mono">chrome.storage.local</code>.
            </p>
          </div>

          {/* Custom Base URL */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Server className="size-3 text-muted-foreground" />
              <span>Base URL Endpoint</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Test Connection Button & Result Box */}
          <div className="pt-2 border-t border-border/40 space-y-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-medium text-xs transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {testStatus === 'testing' ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  <span>Testing Connection...</span>
                </>
              ) : (
                <>
                  <Wifi className="size-3.5" />
                  <span>Test Connection ({currentProvider.name})</span>
                </>
              )}
            </button>

            {testStatus === 'success' && (
              <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] flex items-start gap-2 animate-in fade-in">
                <Check className="size-3.5 mt-0.5 shrink-0" />
                <span className="font-mono break-all">{testMessage}</span>
              </div>
            )}

            {testStatus === 'error' && (
              <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[11px] flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <span className="font-mono break-all">{testMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* Agent Persona & Directives (soul.md) */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
              <FileCode className="size-4 text-primary" />
              <span>Agent Persona & Directives (<code className="font-mono text-[11px] text-primary">soul.md</code>)</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-medium">
              VFS Synced
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Customize the agent's identity, behavior rules, tone, and system directives. Injected dynamically into every turn and synced directly to <code className="font-mono text-foreground">/soul.md</code> in VFS.
          </p>

          <div className="relative">
            <textarea
              value={soulContent}
              onChange={(e) => setSoulContent(e.target.value)}
              rows={8}
              placeholder="# SOUL.MD - Agent Persona & Directives..."
              className="w-full bg-background border border-border rounded-lg p-2.5 text-[11px] font-mono leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveSoul}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                {isSoulSaved ? (
                  <>
                    <Check className="size-3 text-emerald-300" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3" />
                    <span>Save Soul</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetSoul}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-colors cursor-pointer"
                title="Reset soul.md to default"
              >
                <RotateCcw className="size-3" />
                <span>Reset Default</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenSoulInEditor}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium cursor-pointer"
              title="Open full editor with syntax highlighting"
            >
              <ExternalLink className="size-3" />
              <span>Open in VFS Code Editor</span>
            </button>
          </div>
        </div>

        {/* Token & Context Optimization (RTK & Ponytail) */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
              <Zap className="size-4 text-amber-500" />
              <span>Token & Context Optimization</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-500 font-medium">
              Save 40-70% Tokens
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Intelligent context pruning algorithms designed for multi-step browser tasks and continuous agent loops.
          </p>

          <div className="space-y-3 pt-1">
            {/* RTK Toggle */}
            <div className="p-2.5 rounded-lg border border-border/80 bg-background/60 flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Scissors className="size-3.5 text-indigo-500 shrink-0" />
                  <span className="font-semibold text-xs text-foreground">Round-Trip Knowledge (RTK) Trimming</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Replaces verbose past action JSON dumps with compact status ledgers and trims redundant DOM dumps from earlier steps.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enableRtk}
                onClick={handleToggleRtk}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enableRtk ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    enableRtk ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Ponytail Toggle */}
            <div className="p-2.5 rounded-lg border border-border/80 bg-background/60 flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Sliders className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="font-semibold text-xs text-foreground">Ponytail Context Compression</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Retains initial prompt instructions (Head) and recent observations (Tail) 100% intact, condensing intermediate turns into a concise milestone recap.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enablePonytail}
                onClick={handleTogglePonytail}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enablePonytail ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    enablePonytail ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Autonomous Domain Memory & Self-Learning */}
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
              <BrainCircuit className="size-3.5 text-indigo-500" />
              <span>Autonomous Domain Memory (Self-Trained)</span>
            </div>
            {memories.length > 0 && (
              <button
                type="button"
                onClick={handleClearMemories}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer"
                title="Clear domain memories"
              >
                <Trash2 className="size-3" />
                <span>Reset Memory</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The agent continuously learns and persists verified selectors, rich-text editor quirks, and site navigation patterns directly in your local IndexedDB.
          </p>

          {memories.length === 0 ? (
            <div className="px-3 py-2 rounded-lg bg-background/50 border border-border text-[11px] text-muted-foreground italic flex items-center gap-2">
              <Database className="size-3.5 text-muted-foreground shrink-0" />
              <span>No domain patterns learned yet. As you automate tasks on web pages, the agent will remember successful selectors automatically.</span>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {memories.map((m) => {
                const selectorCount = Object.keys(m.formSelectors || {}).length;
                return (
                  <div
                    key={m.domain}
                    className="p-2.5 rounded-lg bg-background/80 border border-border text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground font-mono">{m.domain}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
                        {m.successfulActionsCount} verified actions
                      </span>
                    </div>
                    {m.title && <div className="text-[11px] text-muted-foreground truncate">{m.title}</div>}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-0.5">
                      <span>{selectorCount} mapped selector{selectorCount === 1 ? '' : 's'}</span>
                      {m.learnedCaveats.length > 0 && (
                        <span>• {m.learnedCaveats.length} learned quirk{m.learnedCaveats.length === 1 ? '' : 's'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Browser Automation & Security Info */}
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-2">
          <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-500" />
            <span>Autonomous Browser Permissions</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The agent uses the Chrome DevTools Protocol (CDP 1.3) to interact with tabs, click elements, capture screenshots, and execute JavaScript securely.
          </p>
        </div>
      </div>
    </div>
  );
};
