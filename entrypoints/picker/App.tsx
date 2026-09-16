import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen,
  FolderSync,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Check,
  HardDrive,
  X,
} from 'lucide-react';
import { storeHandle, getStoredHandle, verifyPermission } from '../../src/services/handle-store';
import { db } from '../../src/services/db';

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export type PickerStatus = 'idle' | 'picking' | 'storing' | 'success' | 'error';

export const App: React.FC = () => {
  const [status, setStatus] = useState<PickerStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);

  // Extract query params (e.g. ?reauth=<name>)
  const queryParams = new URLSearchParams(window.location.search);
  const reauthName = queryParams.get('reauth')?.trim();

  // Sync theme with chrome.storage.local
  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.body.classList.remove('dark');
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['themeMode'], (result) => {
        const savedTheme = result.themeMode;
        applyTheme(savedTheme ? savedTheme === 'dark' : true);
      });

      const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && changes.themeMode) {
          applyTheme(changes.themeMode.newValue === 'dark');
        }
      };
      chrome.storage.onChanged.addListener(onStorage);
      return () => {
        chrome.storage.onChanged.removeListener(onStorage);
      };
    } else {
      applyTheme(true);
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'DIRECTORY_CANCELLED' }).catch(() => {});
    }
    window.close();
  }, []);

  // Keyboard shortcut: Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel]);

  const handleSelectFolder = async () => {
    try {
      setStatus('picking');
      setErrorMsg(undefined);

      // If re-authorizing an existing mount, attempt to re-verify permission first
      if (reauthName) {
        try {
          const existing = await getStoredHandle(reauthName);
          if (existing && existing.handle) {
            const granted = await verifyPermission(existing.handle, true);
            if (granted) {
              setStatus('storing');
              existing.mountedAt = Date.now();
              await db.handles.put(existing);

              if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                await chrome.runtime.sendMessage({
                  type: 'DIRECTORY_PICKED',
                  name: existing.name,
                  id: existing.id,
                  reauth: true,
                }).catch(() => {});
              }

              setStatus('success');
              setTimeout(() => {
                window.close();
              }, 1000);
              return;
            }
          }
        } catch (reauthErr) {
          console.warn('[picker] Reauth check failed, prompting picker:', reauthErr);
        }
      }

      // Check support for File System Access API
      if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('File System Access API (showDirectoryPicker) is not supported in this browser.');
      }

      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      if (!handle) {
        setStatus('idle');
        return;
      }

      setStatus('storing');
      const record = await storeHandle(handle, 'readwrite', reauthName || undefined);

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({
          type: 'DIRECTORY_PICKED',
          name: record.name || handle.name,
          id: record.id,
        }).catch(() => {});
      }

      setStatus('success');
      setTimeout(() => {
        window.close();
      }, 1000);
    } catch (err: unknown) {
      const error = err as Error;
      if (error?.name === 'AbortError') {
        // User dismissed the native folder picker
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          await chrome.runtime.sendMessage({ type: 'DIRECTORY_CANCELLED' }).catch(() => {});
        }
        window.close();
        return;
      }

      console.error('[picker] Failed to pick directory:', err);
      setStatus('error');
      setErrorMsg(error?.message || 'Failed to select and mount folder.');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background text-foreground select-none relative overflow-hidden">
      {/* Subtle ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Dialog Card */}
      <div className="w-full max-w-md bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl shadow-2xl p-6 sm:p-7 relative z-10 space-y-6">
        {/* Header with Icon and Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="size-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs shrink-0">
              {reauthName ? (
                <FolderSync className="size-5.5" />
              ) : (
                <FolderOpen className="size-5.5" />
              )}
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                {reauthName ? 'Re-authorize Folder Access' : 'Mount Local Folder'}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {reauthName ? 'Resume workspace syncing' : 'Connect folder to SAM-Agent'}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-mono font-medium tracking-wide shrink-0">
            <ShieldCheck className="size-3" />
            <span>Native File System</span>
          </span>
        </div>

        {/* Content Section */}
        {status === 'success' ? (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
            <div className="size-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm">
              <CheckCircle2 className="size-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Folder Mounted Successfully!</h3>
              <p className="text-xs text-muted-foreground">Closing window and returning to agent...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Description of permissions requested */}
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Read and write access to browse and save files in this directory.
              </p>

              {reauthName && (
                <div className="p-2.5 rounded-lg bg-muted/60 border border-border/60 text-xs text-foreground flex items-center gap-2">
                  <HardDrive className="size-4 text-primary shrink-0" />
                  <span className="truncate">
                    Folder: <strong className="font-mono text-primary">{reauthName}</strong>
                  </span>
                </div>
              )}

              {/* Security & Access Highlights */}
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/50 text-[11px] text-muted-foreground space-y-2">
                <div className="flex items-start gap-2">
                  <Check className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>Files remain on your local disk with zero external server uploads.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>The agent reads and updates project code directly upon your request.</span>
                </div>
              </div>
            </div>

            {/* Error Message Card */}
            {status === 'error' && (
              <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2.5">
                <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                <div className="space-y-1 flex-1">
                  <p className="font-medium">Failed to mount folder</p>
                  <p className="text-[11px] text-destructive/90 leading-normal">
                    {errorMsg || 'Permission was denied or an error occurred while selecting the directory.'}
                  </p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={status === 'picking' || status === 'storing'}
                className="flex-1 px-4 py-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border/80 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>

              {status === 'error' ? (
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all cursor-pointer"
                >
                  <RotateCw className="size-3.5" />
                  <span>Try Again</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  disabled={status === 'picking' || status === 'storing'}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'picking' ? (
                    <>
                      <RotateCw className="size-3.5 animate-spin" />
                      <span>Selecting Folder...</span>
                    </>
                  ) : status === 'storing' ? (
                    <>
                      <RotateCw className="size-3.5 animate-spin" />
                      <span>Mounting Directory...</span>
                    </>
                  ) : reauthName ? (
                    <>
                      <FolderSync className="size-3.5" />
                      <span>Re-authorize Folder</span>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="size-3.5" />
                      <span>Select Local Folder</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
