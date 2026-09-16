import React from 'react';
import { UploadCloud, FileArchive } from 'lucide-react';

export interface DropZoneOverlayProps {
  isDragging: boolean;
}

export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = ({ isDragging }) => {
  if (!isDragging) return null;

  return (
    <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 border-2 border-dashed border-primary animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
      <div className="flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary mb-3 shadow-inner">
        <UploadCloud className="size-8 animate-bounce" />
      </div>
      <h3 className="font-semibold text-sm text-foreground">Drop files or ZIP archive here</h3>
      <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
        ZIP files will be automatically unpacked into VFS; loose files will be saved to <code className="font-mono text-primary">/workspace</code>.
      </p>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
        <FileArchive className="size-3.5" />
        <span>Auto-Unpack & VFS Sync</span>
      </div>
    </div>
  );
};
