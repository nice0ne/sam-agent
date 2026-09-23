import React, { useState, useRef } from 'react';
import {
  Download,
  Upload,
  HardDriveDownload,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  Database,
  FileText,
  Brain,
  CalendarClock,
  Check,
  AlertCircle,
  LoaderCircle,
  FolderArchive,
  RefreshCw,
  Trash2,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import {
  type BackupScopeOptions,
  type BackupArchiveManifest,
  type RestorePreview,
  type EncryptedBackupArchive,
  createBackupArchive,
  downloadBackupArchive,
  saveBackupToVfs,
  inspectBackupFile,
  unlockBackupArchive,
  restoreBackupData,
  executeFactoryReset,
} from '../../services/backup-restore';

export interface BackupRestoreCardProps {
  borderless?: boolean;
}

export const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({ borderless = false }) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // Export State
  const [scope, setScope] = useState<BackupScopeOptions>({
    includeConfigs: true,
    includeApiKeys: false,
    includeThreads: true,
    includeVfs: true,
    includeMemories: true,
    includeSchedules: true,
    includeProfileVault: true,
  });
  const [usePassword, setUsePassword] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Import State
  const [importedContent, setImportedContent] = useState<string | null>(null);
  const [importedFileName, setImportedFileName] = useState<string>('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [unlockedPayload, setUnlockedPayload] = useState<any | null>(null);

  // Restore Execution State
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);
  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string | null>(null);

  // Factory Reset Dialog State
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Export Download
  const handleExportDownload = async () => {
    try {
      setIsExporting(true);
      setExportSuccessMessage(null);
      const pwd = usePassword ? exportPassword : undefined;
      const manifest = await downloadBackupArchive(scope, pwd);
      setExportSuccessMessage(
        `Berkas cadangan berhasil diunduh (${manifest.itemCounts.threads} percakapan, ${manifest.itemCounts.vfsFiles} berkas VFS).`
      );
      setTimeout(() => setExportSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Gagal membuat cadangan: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Export to VFS
  const handleExportToVfs = async () => {
    try {
      setIsExporting(true);
      setExportSuccessMessage(null);
      const res = await saveBackupToVfs(scope);
      setExportSuccessMessage(`Tersimpan ke VFS: ${res.path}`);
      setTimeout(() => setExportSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Gagal menyimpan ke VFS: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Input Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportedFileName(file.name);
    setIsInspecting(true);
    setRestorePreview(null);
    setUnlockedPayload(null);
    setDecryptError(null);
    setRestoreSuccessMessage(null);
    setRestoreErrorMessage(null);

    try {
      const text = await file.text();
      setImportedContent(text);
      const preview = await inspectBackupFile(text);
      setRestorePreview(preview);

      if (!preview.valid && preview.error) {
        setRestoreErrorMessage(preview.error);
      } else if (!preview.isEncrypted && preview.rawArchive) {
        setUnlockedPayload(preview.rawArchive);
      }
    } catch (err: any) {
      setRestoreErrorMessage(`Gagal membaca berkas: ${err.message}`);
    } finally {
      setIsInspecting(false);
    }
  };

  // Handle Unlocking Encrypted Archive
  const handleUnlockArchive = async () => {
    if (!restorePreview || !restorePreview.rawArchive) return;
    setIsDecrypting(true);
    setDecryptError(null);

    try {
      const decrypted = await unlockBackupArchive(
        restorePreview.rawArchive as EncryptedBackupArchive,
        decryptPassword
      );
      setUnlockedPayload(decrypted);
      setDecryptPassword('');
    } catch (err: any) {
      setDecryptError(err.message || 'Password salah.');
    } finally {
      setIsDecrypting(false);
    }
  };

  // Handle Restore Execution
  const handleExecuteRestore = async () => {
    if (!unlockedPayload) return;
    const confirmPrompt =
      restoreMode === 'overwrite'
        ? 'PERINGATAN: Mode Overwrite akan menimpa/membersihkan percakapan dan berkas lama sebelum memulihkan data cadangan. Lanjutkan?'
        : 'Pulihkan data cadangan menggunakan mode Penggabungan (Merge)?';

    if (!window.confirm(confirmPrompt)) return;

    setIsRestoring(true);
    setRestoreSuccessMessage(null);
    setRestoreErrorMessage(null);

    try {
      const res = await restoreBackupData(unlockedPayload, restoreMode);
      if (res.success) {
        setRestoreSuccessMessage(
          `${res.message} Berhasil memulihkan ${res.restoredCounts.threads} percakapan, ${res.restoredCounts.vfsFiles} berkas VFS, dan ${res.restoredCounts.configs} pengaturan.`
        );
      } else {
        setRestoreErrorMessage(res.message);
      }
    } catch (err: any) {
      setRestoreErrorMessage(`Kesalahan pemulihan: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle Factory Reset
  const handleFactoryReset = async () => {
    if (resetInput.trim() !== 'RESET') return;
    setIsResetting(true);
    try {
      await executeFactoryReset();
      alert('Ekstensi berhasil di-reset ke kondisi awal pabrik. Memuat ulang halaman...');
      window.location.reload();
    } catch (err: any) {
      alert(`Gagal mereset: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  const activeManifest: BackupArchiveManifest | undefined =
    unlockedPayload?.manifest || restorePreview?.manifest;

  return (
    <div className={borderless ? "space-y-4 pt-1" : "p-3.5 rounded-xl border border-border bg-card/60 space-y-4 shadow-xs"}>
      {!borderless && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground font-semibold text-xs">
            <FolderArchive className="size-4 text-primary" />
            <span>Cadangan, Ekspor & Pemulihan Data (Backup & Restore)</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
            Format JSON v1
          </span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Cadangkan seluruh percakapan, berkas kerja Virtual File System (VFS), memori belajar agen,
        dan konfigurasi AI Anda ke berkas JSON terenkripsi atau pulihkan data dari perangkat lain.
      </p>

      {/* Tabs */}
      <div className="flex rounded-lg bg-muted/50 p-1 border border-border/60">
        <button
          type="button"
          onClick={() => setActiveTab('export')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
            activeTab === 'export'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Download className="size-3.5" />
          <span>Ekspor & Cadangkan</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('import')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
            activeTab === 'import'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Upload className="size-3.5" />
          <span>Impor & Pulihkan</span>
        </button>
      </div>

      {/* TAB 1: EXPORT */}
      {activeTab === 'export' && (
        <div className="space-y-3 pt-1">
          <label className="block text-[11px] font-semibold text-foreground/90 uppercase tracking-wider">
            Pilih Modul yang Ingin Dicadangkan:
          </label>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background/60 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={scope.includeConfigs}
                onChange={(e) => setScope((s) => ({ ...s, includeConfigs: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary size-3.5 cursor-pointer"
              />
              <span className="text-[11px] font-medium text-foreground">Konfigurasi & Model</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background/60 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={scope.includeThreads}
                onChange={(e) => setScope((s) => ({ ...s, includeThreads: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary size-3.5 cursor-pointer"
              />
              <span className="text-[11px] font-medium text-foreground">Riwayat Percakapan</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background/60 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={scope.includeVfs}
                onChange={(e) => setScope((s) => ({ ...s, includeVfs: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary size-3.5 cursor-pointer"
              />
              <span className="text-[11px] font-medium text-foreground">Berkas VFS Workspace</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background/60 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={scope.includeMemories}
                onChange={(e) => setScope((s) => ({ ...s, includeMemories: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary size-3.5 cursor-pointer"
              />
              <span className="text-[11px] font-medium text-foreground">Memori & Domain Learning</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background/60 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={scope.includeSchedules}
                onChange={(e) => setScope((s) => ({ ...s, includeSchedules: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary size-3.5 cursor-pointer"
              />
              <span className="text-[11px] font-medium text-foreground">Jadwal Tugas Rutin</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background/60 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={scope.includeProfileVault}
                onChange={(e) => setScope((s) => ({ ...s, includeProfileVault: e.target.checked }))}
                className="rounded border-border text-primary focus:ring-primary size-3.5 cursor-pointer"
              />
              <span className="text-[11px] font-medium text-foreground">Form Profile Vault</span>
            </label>
          </div>

          {/* Sensitive API Keys Warning Box */}
          <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scope.includeApiKeys}
                onChange={(e) => setScope((s) => ({ ...s, includeApiKeys: e.target.checked }))}
                className="rounded border-amber-500 text-amber-600 focus:ring-amber-500 size-3.5 cursor-pointer"
              />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <ShieldAlert className="size-3.5 text-amber-600 dark:text-amber-400" />
                Sertakan Kunci API (API Keys)
              </span>
            </label>
            <p className="text-[10px] text-muted-foreground leading-normal pl-5">
              Jika dicentang, API key Anthropic, OpenAI, Gemini, dll. akan dimasukkan ke dalam cadangan.
              Disarankan mengaktifkan proteksi password di bawah jika Anda menyertakan API key.
            </p>
          </div>

          {/* Password Protection */}
          <div className="p-2.5 rounded-lg border border-border bg-background/60 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => {
                  setUsePassword(e.target.checked);
                  if (!e.target.checked) setExportPassword('');
                }}
                className="rounded border-border text-primary focus:ring-primary size-3.5 cursor-pointer"
              />
              <span className="text-xs font-medium text-foreground flex items-center gap-1">
                <Lock className="size-3 text-primary" />
                Enkripsi Berkas Cadangan dengan Password (AES-256-GCM)
              </span>
            </label>

            {usePassword && (
              <div className="pt-1 space-y-1">
                <input
                  type="password"
                  placeholder="Masukkan password proteksi..."
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-[10px] text-muted-foreground">
                  Catat password ini dengan aman. Tanpa password, berkas tidak akan dapat dibuka.
                </span>
              </div>
            )}
          </div>

          {/* Export Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleExportDownload}
              disabled={isExporting}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  <span>Membuat Cadangan...</span>
                </>
              ) : (
                <>
                  <Download className="size-3.5" />
                  <span>Unduh File Cadangan (.json)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportToVfs}
              disabled={isExporting}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border bg-card hover:bg-muted text-foreground transition-all cursor-pointer shadow-2xs disabled:opacity-50"
              title="Simpan cadangan langsung ke /workspace di dalam VFS"
            >
              <HardDriveDownload className="size-3.5 text-muted-foreground" />
              <span>Simpan ke VFS</span>
            </button>
          </div>

          {exportSuccessMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <Check className="size-4 shrink-0" />
              <span>{exportSuccessMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: IMPORT & RESTORE */}
      {activeTab === 'import' && (
        <div className="space-y-3 pt-1">
          {/* File Picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-border/80 hover:border-primary rounded-xl bg-background/50 hover:bg-muted/30 transition-all cursor-pointer text-center"
            >
              <Upload className="size-6 text-muted-foreground" />
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-foreground">
                  {importedFileName ? importedFileName : 'Pilih Berkas Cadangan (.json)'}
                </span>
                <p className="text-[10px] text-muted-foreground">
                  Klik untuk menelusuri berkas cadangan SAM-Agent yang valid
                </p>
              </div>
            </button>
          </div>

          {/* Inspecting Spinner */}
          {isInspecting && (
            <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin text-primary" />
              <span>Memeriksa integritas berkas cadangan...</span>
            </div>
          )}

          {/* Error Message */}
          {restoreErrorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{restoreErrorMessage}</span>
            </div>
          )}

          {/* Encrypted Password Prompt */}
          {restorePreview?.isEncrypted && !unlockedPayload && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <Lock className="size-3.5" />
                <span>Berkas ini Terenkripsi</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Masukkan password yang digunakan saat mengekspor berkas ini untuk membuka data.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder="Password dekripsi..."
                  value={decryptPassword}
                  onChange={(e) => setDecryptPassword(e.target.value)}
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleUnlockArchive}
                  disabled={isDecrypting || !decryptPassword}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDecrypting ? 'Membuka...' : 'Buka Kunci'}
                </button>
              </div>

              {decryptError && (
                <span className="text-[11px] text-rose-500 font-medium block">{decryptError}</span>
              )}
            </div>
          )}

          {/* Restore Preview Summary Card */}
          {unlockedPayload && activeManifest && (
            <div className="p-3 rounded-lg border border-border bg-background/80 space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  <span>Ringkasan Berkas Cadangan</span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Dibuat: {new Date(activeManifest.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-muted/40 flex items-center justify-between">
                  <span className="text-muted-foreground">Percakapan:</span>
                  <strong className="text-foreground font-semibold">
                    {activeManifest.itemCounts.threads} thread
                  </strong>
                </div>
                <div className="p-2 rounded bg-muted/40 flex items-center justify-between">
                  <span className="text-muted-foreground">Berkas VFS:</span>
                  <strong className="text-foreground font-semibold">
                    {activeManifest.itemCounts.vfsFiles} file
                  </strong>
                </div>
                <div className="p-2 rounded bg-muted/40 flex items-center justify-between">
                  <span className="text-muted-foreground">Memori:</span>
                  <strong className="text-foreground font-semibold">
                    {activeManifest.itemCounts.episodicMemories} item
                  </strong>
                </div>
                <div className="p-2 rounded bg-muted/40 flex items-center justify-between">
                  <span className="text-muted-foreground">Konfigurasi:</span>
                  <strong className="text-foreground font-semibold">
                    {activeManifest.itemCounts.configsCount} keys
                  </strong>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-semibold text-foreground/90 uppercase tracking-wider block">
                  Pilih Metode Pemulihan:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRestoreMode('merge')}
                    className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                      restoreMode === 'merge'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="font-semibold text-xs text-foreground">Gabungkan (Merge)</div>
                    <span className="text-[10px] text-muted-foreground leading-normal block mt-0.5">
                      Aman. Menambahkan percakapan & berkas baru tanpa menghapus data yang ada.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRestoreMode('overwrite')}
                    className={`p-2 rounded-lg border text-left cursor-pointer transition-all ${
                      restoreMode === 'overwrite'
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="font-semibold text-xs text-foreground">Timpa (Overwrite)</div>
                    <span className="text-[10px] text-muted-foreground leading-normal block mt-0.5">
                      Bersihkan data saat ini dan ganti 100% dengan isi berkas cadangan.
                    </span>
                  </button>
                </div>
              </div>

              {/* Restore Button */}
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin" />
                    <span>Sedang Memulihkan Data...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" />
                    <span>Mulai Pemulihan Data Sekarang</span>
                  </>
                )}
              </button>
            </div>
          )}

          {restoreSuccessMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <Check className="size-4 shrink-0" />
              <span>{restoreSuccessMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Danger Zone: Factory Reset */}
      <div className="pt-3 border-t border-border/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-destructive uppercase tracking-wider flex items-center gap-1">
            <Trash2 className="size-3" />
            <span>Zona Bahaya: Reset Pabrik</span>
          </span>
          {!showResetConfirm && (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="text-[11px] text-destructive hover:underline cursor-pointer font-medium"
            >
              Reset ke Default Pabrik...
            </button>
          )}
        </div>

        {showResetConfirm && (
          <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2 text-xs">
            <p className="text-[11px] text-destructive leading-relaxed font-medium">
              Tindakan ini akan <strong>menghapus permanen</strong> seluruh percakapan, berkas VFS,
              memori belajar, dan pengaturan API key Anda. Data yang belum dicadangkan akan hilang.
            </p>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">
                Ketik kata <strong className="text-foreground">RESET</strong> untuk mengonfirmasi:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  placeholder="Ketik RESET"
                  className="flex-1 bg-background border border-destructive/40 rounded-lg px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive font-mono"
                />
                <button
                  type="button"
                  onClick={handleFactoryReset}
                  disabled={resetInput.trim() !== 'RESET' || isResetting}
                  className="px-3 py-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-medium rounded-lg transition-all cursor-pointer disabled:opacity-40"
                >
                  {isResetting ? 'Mereset...' : 'Hapus Semua'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetInput('');
                  }}
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
