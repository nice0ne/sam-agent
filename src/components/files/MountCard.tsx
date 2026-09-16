import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  Code2,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  Clock,
  X,
  HardDrive,
} from 'lucide-react';
import type { StoredHandleRecord } from '../../types/agent';

export interface MountCardProps {
  record: StoredHandleRecord;
  onUnmount: (id: string) => void;
  onReauth: (name: string) => void;
}

type PermissionStatus = 'granted' | 'prompt' | 'denied' | 'checking';

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const MountCard: React.FC<MountCardProps> = ({ record, onUnmount, onReauth }) => {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('checking');
  const [isConfirmingUnmount, setIsConfirmingUnmount] = useState(false);

  const checkPermission = useCallback(async () => {
    try {
      if (record.handle && typeof record.handle.queryPermission === 'function') {
        const status = await record.handle.queryPermission({ mode: 'readwrite' });
        setPermissionStatus(status as PermissionStatus);
      } else {
        setPermissionStatus('prompt');
      }
    } catch (err) {
      console.warn('[MountCard] Permission query failed:', err);
      setPermissionStatus('prompt');
    }
  }, [record.handle]);

  useEffect(() => {
    checkPermission();

    const onFocus = () => {
      checkPermission();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkPermission]);

  const handleOpenInEditor = () => {
    const editorUrl = `editor.html?path=/${encodeURIComponent(record.name)}`;
    const url = chrome?.runtime?.getURL ? chrome.runtime.getURL(editorUrl) : editorUrl;
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="group relative flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border/80 bg-card/90 hover:bg-card hover:border-border transition-all shadow-2xs">
      {/* Icon & Details */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* Folder icon with green dot ("Local Mount") */}
        <div className="relative size-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
          <Folder className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-card"
            title="Local Mount"
          />
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-semibold text-foreground truncate select-text"
              title={record.name}
            >
              {record.name}
            </span>

            {/* Permission Badge */}
            {permissionStatus === 'checking' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border/60">
                <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse" />
                Checking
              </span>
            )}

            {permissionStatus === 'granted' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                <CheckCircle2 className="size-2.5" />
                Access Active
              </span>
            )}

            {(permissionStatus === 'prompt' || permissionStatus === 'denied') && (
              <div className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                  <ShieldAlert className="size-2.5" />
                  Access Needed
                </span>
                <button
                  type="button"
                  onClick={() => onReauth(record.name)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="Grant permissions for this folder"
                >
                  Grant Access
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono truncate">
            <span className="flex items-center gap-1">
              <HardDrive className="size-2.5 inline shrink-0" />
              <span>/{record.name}</span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="size-2.5 inline shrink-0" />
              <span>Mounted {formatRelativeTime(record.mountedAt)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Open in Editor */}
        <button
          type="button"
          onClick={handleOpenInEditor}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors text-xs font-medium cursor-pointer"
          title="Open in Editor"
        >
          <Code2 className="size-3.5" />
          <span className="hidden sm:inline text-[11px]">Editor</span>
        </button>

        {/* Unmount confirmation / button */}
        {isConfirmingUnmount ? (
          <div className="flex items-center gap-1 bg-destructive/10 border border-destructive/20 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => {
                onUnmount(record.id);
                setIsConfirmingUnmount(false);
              }}
              className="px-2 py-0.5 text-[10px] font-medium bg-destructive text-destructive-foreground hover:opacity-90 rounded-md transition-all cursor-pointer shadow-2xs"
            >
              Unmount?
            </button>
            <button
              type="button"
              onClick={() => setIsConfirmingUnmount(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Cancel"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsConfirmingUnmount(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            title="Unmount Folder"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
