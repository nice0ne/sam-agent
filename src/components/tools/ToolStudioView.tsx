import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Wrench,
  Plus,
  RotateCw,
  Play,
  Code2,
  Trash2,
  AlertTriangle,
  Search,
  X,
  FileCode,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import {
  listUserTools,
  toggleUserTool,
  createUserToolTemplate,
  deleteVfsFile,
  UserToolMeta,
} from '../../services/tool-registry';
import { useAppStore } from '../../stores/useAppStore';
import { TestRunModal } from './TestRunModal';

export const ToolStudioView: React.FC = () => {
  const { setView, activeThreadId, navigateToChat, navigateToThreads } = useAppStore();

  const [tools, setTools] = useState<UserToolMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [activeTestTool, setActiveTestTool] = useState<UserToolMeta | null>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<UserToolMeta | null>(null);

  // Create Tool Form/Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDesc, setNewToolDesc] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Load tools on mount
  const loadTools = async () => {
    try {
      const items = await listUserTools();
      setTools(items);
    } catch (err) {
      console.error('[ToolStudioView] Failed to load user tools:', err);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadTools().finally(() => setIsLoading(false));
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadTools();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Toggle tool enabled status
  const handleToggle = async (tool: UserToolMeta) => {
    const nextState = !tool.enabled;
    try {
      await toggleUserTool(tool.name, nextState);
      setTools((prev) =>
        prev.map((t) => (t.name === tool.name ? { ...t, enabled: nextState } : t))
      );
    } catch (err) {
      console.error('[ToolStudioView] Error toggling tool:', err);
    }
  };

  // Open Monaco code editor for tool
  const handleEditCode = (toolPath: string) => {
    const editorUrl = `editor.html?path=${encodeURIComponent(toolPath)}`;
    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(editorUrl)
      : editorUrl;

    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  // Confirm delete tool
  const handleConfirmDelete = async () => {
    if (!toolToDelete) return;
    try {
      await deleteVfsFile(toolToDelete.path);
      setTools((prev) => prev.filter((t) => t.path !== toolToDelete.path));
      setToolToDelete(null);
    } catch (err) {
      console.error('[ToolStudioView] Error deleting tool:', err);
    }
  };

  // Create tool template & launch code editor
  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newToolName.trim();
    if (!trimmedName) {
      setCreateError('Please enter a tool name (e.g. scrapeReviews or getMetaTags).');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const filePath = await createUserToolTemplate(trimmedName, newToolDesc.trim());
      setIsCreateOpen(false);
      setNewToolName('');
      setNewToolDesc('');
      await loadTools();

      // Open new tool in code editor
      handleEditCode(filePath);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create tool template.');
    } finally {
      setIsCreating(false);
    }
  };

  // Filter tools
  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) {
      return tools;
    }
    const q = searchQuery.toLowerCase().trim();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.path.toLowerCase().includes(q)
    );
  }, [tools, searchQuery]);

  return (
    <div className="relative flex flex-col h-screen bg-background text-foreground select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-3.5 py-3 border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-20 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (activeThreadId) {
                navigateToChat(activeThreadId);
              } else {
                setView('chat');
              }
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all cursor-pointer"
            title="Back to Chat"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
              <span>Custom Tool Studio</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono">
                {tools.length}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all cursor-pointer"
            title="Refresh Tools"
          >
            <RotateCw className={`size-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
          </button>

          {/* New Tool Button */}
          <button
            type="button"
            onClick={() => {
              setNewToolName('');
              setNewToolDesc('');
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground hover:opacity-90 rounded-lg text-xs font-medium cursor-pointer shadow-2xs active:scale-95 transition-all"
            title="Create New Custom Tool Scriptlet"
          >
            <Plus className="size-3.5" />
            <span className="hidden xs:inline">+ New Tool</span>
          </button>
        </div>
      </header>

      {/* Search Filter Bar */}
      {tools.length > 0 && (
        <div className="p-3 border-b border-border/60 bg-muted/20">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools by name, description, or path..."
              className="w-full bg-background pl-8 pr-8 py-1.5 rounded-lg border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all select-text"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {tools.length === 0 ? (
          /* Clean Empty State */
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="size-12 rounded-2xl bg-muted/50 border border-border flex items-center justify-center text-primary shadow-2xs">
              <Wrench className="size-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-foreground">No Custom Tools Created Yet</h3>
              <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
                User-defined browser scriptlets saved in VFS <span className="font-mono text-foreground font-medium">/tools/*.js</span> will appear here. SAM-Agent can invoke them directly via the <span className="font-mono text-primary font-medium">runTool</span> action block.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setNewToolName('');
                  setNewToolDesc('');
                  setCreateError(null);
                  setIsCreateOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-xl text-xs font-medium cursor-pointer shadow-xs active:scale-95 transition-all"
              >
                <Plus className="size-3.5" />
                <span>Create Your First Tool</span>
              </button>
            </div>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center p-6 space-y-2">
            <div className="size-10 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground">
              <Search className="size-5" />
            </div>
            <h3 className="text-xs font-semibold text-foreground">No matching tools</h3>
            <p className="text-[11px] text-muted-foreground max-w-xs">
              No tools matched &ldquo;{searchQuery}&rdquo;. Try another search term.
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {filteredTools.map((tool) => (
              <div
                key={tool.name}
                className={`group relative rounded-xl border transition-all p-3 shadow-2xs space-y-2.5 ${
                  tool.enabled
                    ? 'border-border/80 bg-card/80 hover:bg-card'
                    : 'border-border/40 bg-muted/20 opacity-75'
                }`}
              >
                {/* Tool Header: Name + Switch Toggle */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <FileCode className="size-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-xs text-foreground truncate select-text">
                          {tool.name}
                        </span>
                        {tool.enabled ? (
                          <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-500 text-[9px] font-medium border border-emerald-500/20">
                            Active
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground text-[9px] font-medium border border-border">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {tool.path}
                      </div>
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <label
                    className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5"
                    title={tool.enabled ? 'Click to disable tool' : 'Click to enable tool'}
                  >
                    <input
                      type="checkbox"
                      checked={tool.enabled}
                      onChange={() => handleToggle(tool)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {/* Description and Params */}
                <div className="space-y-1 text-xs">
                  <p className="text-muted-foreground text-[11px] leading-relaxed select-text">
                    {tool.description || 'No description provided.'}
                  </p>
                  {tool.paramsHelp && tool.paramsHelp !== 'None' && (
                    <div className="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded-md px-2 py-1 select-text">
                      <span className="text-foreground/80 font-semibold">params:</span> {tool.paramsHelp}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <span className="text-[10px] text-muted-foreground">
                    Updated {new Date(tool.updatedAt).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-1">
                    {/* Test Run */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTestTool(tool);
                        setIsTestModalOpen(true);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors cursor-pointer"
                      title="Test Run on Active Tab"
                    >
                      <Play className="size-3 text-emerald-500" />
                      <span>Test Run</span>
                    </button>

                    {/* Edit Code */}
                    <button
                      type="button"
                      onClick={() => handleEditCode(tool.path)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-foreground bg-secondary hover:bg-secondary/80 border border-border transition-colors cursor-pointer"
                      title="Edit Code in Code Editor"
                    >
                      <Code2 className="size-3 text-primary" />
                      <span>Edit Code</span>
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => setToolToDelete(tool)}
                      className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      title="Delete Tool"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Tool Modal / Form */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form
            onSubmit={handleCreateTool}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Sparkles className="size-3.5" />
                </div>
                <h3 className="text-xs font-semibold text-foreground">Create Custom Tool</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">
                  Tool Name <span className="text-primary">*</span>
                </label>
                <input
                  type="text"
                  value={newToolName}
                  onChange={(e) => {
                    setNewToolName(e.target.value);
                    setCreateError(null);
                  }}
                  placeholder="e.g. scrapeReviews or extractEmails"
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all select-text"
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground">
                  Will be saved as <span className="font-mono">/tools/{newToolName.trim() || 'tool_name'}.js</span>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">
                  Description (Optional)
                </label>
                <textarea
                  value={newToolDesc}
                  onChange={(e) => setNewToolDesc(e.target.value)}
                  rows={2}
                  placeholder="Briefly describe what this scriptlet extracts or performs..."
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all select-text resize-none"
                />
              </div>

              {createError && (
                <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-2">
                  {createError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating || !newToolName.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium cursor-pointer transition-all shadow-xs disabled:opacity-50 disabled:pointer-events-none active:scale-95"
              >
                {isCreating ? 'Creating...' : 'Create & Open Editor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Modal: Delete Tool */}
      {toolToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4.5 shrink-0" />
              <h3 className="text-xs font-semibold text-foreground">Delete Custom Tool?</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed break-all">
              Are you sure you want to delete <span className="font-mono font-medium text-foreground">{toolToDelete.name}</span> (<span className="font-mono text-[10px]">{toolToDelete.path}</span>)? This will remove the scriptlet file from VFS.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setToolToDelete(null)}
                className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 text-xs font-medium cursor-pointer transition-all shadow-xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Run Modal */}
      <TestRunModal
        tool={activeTestTool}
        isOpen={isTestModalOpen}
        onClose={() => {
          setIsTestModalOpen(false);
          setActiveTestTool(null);
        }}
      />
    </div>
  );
};
