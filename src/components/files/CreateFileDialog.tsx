import React, { useState } from 'react';
import { X, Plus, FileCode, FileText, Sparkles, Wrench, Layers } from 'lucide-react';
import { saveVfsFile } from '../../services/vfs';
import type { VfsFileRecord } from '../../types/agent';

export interface CreateFileDialogProps {
  isOpen: boolean;
  initialFolder?: string;
  onClose: () => void;
  onCreated: (file: VfsFileRecord) => void;
}

const TEMPLATES = [
  {
    id: 'skill',
    name: 'SOP / Skill Guide (.md)',
    folder: '/skills',
    ext: '.md',
    icon: Sparkles,
    content: `# SKILL: [Skill Name]
# Purpose: Define specialized workflow or guidelines for the AI agent

## Overview:
Explain the purpose of this skill and when the agent should apply it.

## Step-by-Step Procedure:
1. First step
2. Second step
3. Validation and output formatting
`,
  },
  {
    id: 'tool',
    name: 'Browser Tool Scriptlet (.js)',
    folder: '/tools',
    ext: '.js',
    icon: Wrench,
    content: `/**
 * @tool myCustomTool
 * @description Extracts or manipulates data on the active browser webpage.
 * @param {string} selector Target CSS selector
 */
(() => {
  const elements = document.querySelectorAll(args.selector || 'body');
  return {
    count: elements.length,
    url: window.location.href,
  };
})();
`,
  },
  {
    id: 'html',
    name: 'HTML Mockup / Dashboard (.html)',
    folder: '/workspace',
    ext: '.html',
    icon: Layers,
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>New Mockup</title>
</head>
<body class="bg-slate-900 text-white min-h-screen p-8">
  <div class="max-w-4xl mx-auto space-y-4">
    <h1 class="text-2xl font-bold">Interactive Prototype</h1>
    <p class="text-slate-400">Created with SAM-Agent VFS</p>
  </div>
</body>
</html>
`,
  },
  {
    id: 'blank',
    name: 'Blank File',
    folder: '/workspace',
    ext: '.txt',
    icon: FileText,
    content: '',
  },
];

export const CreateFileDialog: React.FC<CreateFileDialogProps> = ({
  isOpen,
  initialFolder = '/workspace',
  onClose,
  onCreated,
}) => {
  const [selectedFolder, setSelectedFolder] = useState(initialFolder);
  const [fileName, setFileName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('skill');
  const [customContent, setCustomContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tmpl = TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setSelectedFolder(tmpl.folder);
      setCustomContent(tmpl.content);
      if (!fileName) {
        setFileName(`new-item${tmpl.ext}`);
      } else {
        const base = fileName.split('.')[0] || 'new-item';
        setFileName(`${base}${tmpl.ext}`);
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) {
      setErrorMsg('File name cannot be empty');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const cleanFolder = selectedFolder.endsWith('/')
        ? selectedFolder.slice(0, -1)
        : selectedFolder;
      const cleanName = fileName.startsWith('/') ? fileName.slice(1) : fileName;
      const fullPath = `${cleanFolder}/${cleanName}`;

      const contentToSave = customContent || TEMPLATES.find((t) => t.id === selectedTemplateId)?.content || '';
      const saved = await saveVfsFile(fullPath, contentToSave);

      onCreated(saved);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create file');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Plus className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Create New VFS File</h2>
              <p className="text-[11px] text-muted-foreground">Add a skill, tool scriptlet, or workspace file</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-3.5">
          {/* Starter Template Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Template Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((tmpl) => {
                const Icon = tmpl.icon;
                const isSelected = selectedTemplateId === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleTemplateSelect(tmpl.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
                        : 'border-border/60 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <Icon className={`size-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-[11px] font-medium leading-tight truncate">{tmpl.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Folder Target */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Target Directory</label>
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono cursor-pointer"
            >
              <option value="/skills">📁 /skills (Agent SOPs & Guides)</option>
              <option value="/tools">📁 /tools (Tool Studio Scriptlets)</option>
              <option value="/workspace">📁 /workspace (AI Outputs & Mockups)</option>
              <option value="/data">📁 /data (Structured Datasets)</option>
              <option value="/">📁 / (Root VFS)</option>
            </select>
          </div>

          {/* File Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">File Name</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. seo-audit.md or scrapeProduct.js"
              className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              autoFocus
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !fileName.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <Plus className="size-3.5" />
              <span>Create File</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
