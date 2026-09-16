import React, { useState, useEffect } from 'react';
import { X, Check, Copy, ExternalLink, Key, Eye, EyeOff, LoaderCircle, AlertCircle, Share2 } from 'lucide-react';
import { getGitHubToken, saveGitHubToken, createGitHubGist } from '../../services/gist';
import type { VfsFileRecord } from '../../types/agent';

export interface GistPublishModalProps {
  file: VfsFileRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const GistPublishModal: React.FC<GistPublishModalProps> = ({ file, isOpen, onClose }) => {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [rememberToken, setRememberToken] = useState(true);
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && file) {
      setError(null);
      setResultUrl(null);
      setCopied(false);
      setDescription(`Artifact from SAM-Agent: ${file.name}`);
      getGitHubToken().then((t) => setToken(t));
    }
  }, [isOpen, file]);

  if (!isOpen || !file) return null;

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please provide a GitHub Personal Access Token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (rememberToken) {
        await saveGitHubToken(token);
      }
      const res = await createGitHubGist({
        token,
        description,
        isPublic,
        filename: file.name,
        content: file.content,
      });
      setResultUrl(res.htmlUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to publish Gist.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!resultUrl) return;
    navigator.clipboard.writeText(resultUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <Share2 className="size-4 text-primary" />
            <span>Share to GitHub Gist</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5">
          {resultUrl ? (
            <div className="space-y-3 py-2 text-center animate-in fade-in">
              <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
                <Check className="size-6" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-foreground">Gist Published Successfully!</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Your file is now live on GitHub Gist.</p>
              </div>

              <div className="flex items-center gap-1.5 p-1.5 bg-background border border-border rounded-lg">
                <input
                  type="text"
                  readOnly
                  value={resultUrl}
                  className="w-full text-xs font-mono bg-transparent px-1 text-foreground focus:outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded font-medium shrink-0 flex items-center gap-1 cursor-pointer hover:opacity-90"
                >
                  {copied ? <Check className="size-3 text-emerald-300" /> : <Copy className="size-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                  <ExternalLink className="size-3.5" />
                  <span>Open in GitHub</span>
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePublish} className="space-y-3">
              {/* File details */}
              <div className="p-2.5 rounded-lg bg-background border border-border/80 flex items-center justify-between text-xs">
                <span className="font-mono text-foreground truncate max-w-[200px]">{file.path}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  {file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`}
                </span>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Visibility Switch */}
              <div className="flex items-center justify-between p-2 rounded-lg border border-border/80 bg-background/50">
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-foreground">{isPublic ? 'Public Gist' : 'Secret Gist (Unlisted)'}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {isPublic ? 'Visible to anyone and searchable' : 'Only people with the link can view'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic(!isPublic)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isPublic ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isPublic ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* GitHub Token */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                    <Key className="size-3 text-primary" />
                    <span>Personal Access Token (classic / fine-grained)</span>
                  </label>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=gist&description=ICT+Agent+Extension"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                  >
                    <span>Create token</span>
                    <ExternalLink className="size-2.5" />
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full bg-background border border-border rounded-lg pl-2.5 pr-8 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <input
                    type="checkbox"
                    id="rememberToken"
                    checked={rememberToken}
                    onChange={(e) => setRememberToken(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-0 cursor-pointer size-3"
                  />
                  <label htmlFor="rememberToken" className="text-[10px] text-muted-foreground cursor-pointer">
                    Remember token locally in Chrome
                  </label>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] flex items-start gap-1.5">
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                  <span className="break-all">{error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg shadow-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="size-3.5 animate-spin" />
                      <span>Publishing...</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="size-3.5" />
                      <span>Publish Gist</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
