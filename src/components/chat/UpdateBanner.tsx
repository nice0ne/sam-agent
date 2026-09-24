import React, { useState, useEffect } from 'react';
import { Rocket, ExternalLink, X, Sparkles } from 'lucide-react';
import {
  checkForUpdates,
  dismissUpdate,
  openReleasesPage,
  cleanVersion,
  UpdateInfo,
} from '../../services/update-checker';

export const UpdateBanner: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const check = async () => {
      try {
        const info = await checkForUpdates(false);
        if (!isMounted) return;

        // Check if user previously dismissed this exact version
        const alreadyDismissed =
          info.dismissedVersion &&
          cleanVersion(info.dismissedVersion) === cleanVersion(info.latestVersion);

        if (info.hasUpdate && !alreadyDismissed) {
          setUpdateInfo(info);
          setIsVisible(true);
        }
      } catch (err) {
        console.warn('[UpdateBanner] Check failed:', err);
      }
    };

    check();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isVisible || !updateInfo || isDismissed) {
    return null;
  }

  const handleOpenRelease = () => {
    openReleasesPage(updateInfo.releaseUrl);
  };

  const handleDismiss = async () => {
    setIsDismissed(true);
    setIsVisible(false);
    await dismissUpdate(updateInfo.latestVersion);
  };

  return (
    <div className="relative z-20 px-3 py-2 bg-gradient-to-r from-primary/15 via-blue-500/10 to-indigo-500/15 border-b border-primary/25 backdrop-blur-md transition-all animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative size-6 rounded-md bg-primary/20 text-primary flex items-center justify-center shrink-0 shadow-2xs">
            <Rocket className="size-3.5" />
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-blue-500 ring-1 ring-card animate-ping" />
          </div>
          <div className="min-w-0 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-foreground truncate">
              <span>Versi Baru Tersedia:</span>
              <span className="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary font-mono text-[10px] font-semibold border border-primary/30">
                v{updateInfo.latestVersion}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {updateInfo.releaseName || 'Pembaruan fitur & peningkatan performa terbaru.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleOpenRelease}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-medium transition-colors shadow-2xs cursor-pointer"
            title="Buka halaman rilis di GitHub untuk download ZIP"
          >
            <span>Lihat Rilis</span>
            <ExternalLink className="size-3" />
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
            title="Tutup pemberitahuan"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
