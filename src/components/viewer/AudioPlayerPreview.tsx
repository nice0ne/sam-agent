import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Repeat,
  Download,
  Music,
  AlertCircle,
  Check,
} from 'lucide-react';
import { triggerBlobDownload } from '../../services/archive';

export interface AudioPlayerPreviewProps {
  content: string;
  filePath?: string;
  mimeType?: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

const EQUALIZER_BARS = [
  { base: 35, delay: 0.1, duration: 0.7 },
  { base: 60, delay: 0.35, duration: 0.6 },
  { base: 25, delay: 0.15, duration: 0.8 },
  { base: 80, delay: 0.5, duration: 0.65 },
  { base: 45, delay: 0.2, duration: 0.75 },
  { base: 95, delay: 0.6, duration: 0.55 },
  { base: 65, delay: 0.3, duration: 0.7 },
  { base: 40, delay: 0.1, duration: 0.8 },
  { base: 85, delay: 0.45, duration: 0.6 },
  { base: 55, delay: 0.25, duration: 0.75 },
  { base: 90, delay: 0.55, duration: 0.5 },
  { base: 70, delay: 0.4, duration: 0.65 },
  { base: 85, delay: 0.3, duration: 0.7 },
  { base: 50, delay: 0.2, duration: 0.8 },
  { base: 95, delay: 0.6, duration: 0.55 },
  { base: 65, delay: 0.35, duration: 0.7 },
  { base: 45, delay: 0.15, duration: 0.75 },
  { base: 80, delay: 0.5, duration: 0.65 },
  { base: 55, delay: 0.25, duration: 0.8 },
  { base: 75, delay: 0.45, duration: 0.6 },
  { base: 35, delay: 0.1, duration: 0.75 },
  { base: 60, delay: 0.3, duration: 0.65 },
  { base: 40, delay: 0.2, duration: 0.7 },
  { base: 20, delay: 0.05, duration: 0.85 },
];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const padMins = mins < 10 ? `0${mins}` : `${mins}`;
  const padSecs = secs < 10 ? `0${secs}` : `${secs}`;
  return `${padMins}:${padSecs}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const AudioPlayerPreview: React.FC<AudioPlayerPreviewProps> = ({
  content,
  filePath,
  mimeType,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [error, setError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  const prevVolumeRef = useRef<number>(1);

  // Derive file name
  const fileName = useMemo(() => {
    if (filePath) {
      const cleanPath = filePath.replace(/\\/g, '/');
      const name = cleanPath.split('/').pop();
      if (name) return name;
    }
    return 'audio-track';
  }, [filePath]);

  // Derive format badge
  const formatBadge = useMemo(() => {
    if (filePath) {
      const ext = filePath.split('.').pop()?.toUpperCase();
      if (ext && ext.length >= 2 && ext.length <= 5) return ext;
    }
    if (mimeType) {
      const sub = mimeType.split('/')[1]?.toUpperCase();
      if (sub) {
        if (sub.includes('MPEG') || sub.includes('MP3')) return 'MP3';
        if (sub.includes('WAV') || sub.includes('WAVE')) return 'WAV';
        if (sub.includes('OGG')) return 'OGG';
        if (sub.includes('AAC')) return 'AAC';
        if (sub.includes('FLAC')) return 'FLAC';
        if (sub.includes('WEBM')) return 'WEBM';
        if (sub.includes('MP4') || sub.includes('M4A')) return 'M4A';
        return sub;
      }
    }
    return 'AUDIO';
  }, [filePath, mimeType]);

  // Calculate file size readout
  const fileSizeText = useMemo(() => {
    if (audioBlob && audioBlob.size > 0) {
      return formatBytes(audioBlob.size);
    }
    if (content.startsWith('data:')) {
      const base64Data = content.split(',')[1] || '';
      return formatBytes(Math.round(base64Data.length * 0.75));
    }
    if (content.length > 0) {
      return formatBytes(content.length);
    }
    return null;
  }, [audioBlob, content]);

  // Decode audio content & handle memory management
  useEffect(() => {
    if (!content) {
      setAudioUrl(null);
      setAudioBlob(null);
      setError('Audio content is empty');
      return;
    }

    setError(null);
    let createdUrl: string | null = null;

    try {
      if (
        content.startsWith('blob:') ||
        content.startsWith('http://') ||
        content.startsWith('https://')
      ) {
        setAudioUrl(content);
        return;
      }

      let blob: Blob;
      const dataUrlMatch = content.match(/^data:([^;]+);base64,(.*)$/s);

      if (dataUrlMatch) {
        const detectedMime = dataUrlMatch[1] || mimeType || 'audio/mpeg';
        const base64Data = dataUrlMatch[2].replace(/\s/g, '');
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        blob = new Blob([byteNumbers], { type: detectedMime });
      } else {
        const trimmed = content.trim();
        const detectedMime = mimeType || 'audio/mpeg';
        try {
          const byteCharacters = atob(trimmed.replace(/\s/g, ''));
          const byteNumbers = new Uint8Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          blob = new Blob([byteNumbers], { type: detectedMime });
        } catch {
          blob = new Blob([content], { type: detectedMime });
        }
      }

      setAudioBlob(blob);
      createdUrl = URL.createObjectURL(blob);
      setAudioUrl(createdUrl);
    } catch (err: unknown) {
      console.error('Failed to create audio URL:', err);
      const msg = err instanceof Error ? err.message : 'Failed to decode audio data';
      setError(msg);
    }

    return () => {
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [content, mimeType]);

  // Reset audio playback on source change
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.loop = isLooping;
    }
  }, [audioUrl]);

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (audio.paused) {
      audio.play().catch((err) => {
        console.warn('Audio playback interrupted or blocked:', err);
      });
    } else {
      audio.pause();
    }
  }, [audioUrl]);

  // Keyboard shortcut: Spacebar toggles playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  // Skip backwards or forwards
  const handleSkip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const maxDuration = duration || audio.duration || 0;
    const nextTime = Math.max(0, Math.min(maxDuration, audio.currentTime + seconds));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  // Timeline scrubber seek
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  // Playback speed selection
  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // Volume & Mute handling
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.muted = false;
    }
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      const restoreVol = prevVolumeRef.current > 0 ? prevVolumeRef.current : 1;
      setVolume(restoreVol);
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = restoreVol;
      }
    } else {
      prevVolumeRef.current = volume;
      setIsMuted(true);
      if (audioRef.current) {
        audioRef.current.muted = true;
      }
    }
  };

  // Loop toggle
  const handleToggleLoop = () => {
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    if (audioRef.current) {
      audioRef.current.loop = nextLoop;
    }
  };

  // Download audio file
  const handleDownload = () => {
    const ext = formatBadge.toLowerCase();
    const downloadFilename = fileName.includes('.') ? fileName : `${fileName}.${ext}`;

    if (audioBlob) {
      triggerBlobDownload(audioBlob, downloadFilename);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2000);
    } else if (audioUrl) {
      fetch(audioUrl)
        .then((res) => res.blob())
        .then((blob) => {
          triggerBlobDownload(blob, downloadFilename);
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 2000);
        })
        .catch((err) => {
          console.error('Download error:', err);
        });
    }
  };

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  // Render error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center select-none bg-muted/10">
        <div className="max-w-md w-full p-6 rounded-2xl border border-destructive/30 bg-card shadow-lg flex flex-col items-center">
          <div className="p-3 rounded-full bg-destructive/15 text-destructive mb-3">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-foreground">Audio Decoding Failed</h3>
          <p className="text-xs text-muted-foreground mt-1 text-center">{error}</p>

          <div className="mt-4 flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-muted text-muted-foreground border border-border">
              {formatBadge}
            </span>
            {fileSizeText && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono text-muted-foreground bg-muted">
                {fileSizeText}
              </span>
            )}
          </div>

          {audioBlob && (
            <button
              type="button"
              onClick={handleDownload}
              className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-card border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Audio File
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render empty content state
  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground bg-muted/10 select-none">
        <div className="p-3 rounded-2xl bg-muted/50 border border-border/50 mb-3">
          <Music className="w-8 h-8 opacity-50" />
        </div>
        <p className="text-sm font-medium text-foreground">No Audio Content</p>
        <p className="text-xs mt-1 text-muted-foreground">Audio file data is empty or missing.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 md:p-8 overflow-y-auto bg-muted/10 select-none">
      {/* Dynamic Keyframes for Animated Visualizer Bars */}
      <style>{`
        @keyframes sam-audio-bar-dance {
          0% {
            height: 15%;
            opacity: 0.6;
          }
          50% {
            height: 98%;
            opacity: 1;
          }
          100% {
            height: 25%;
            opacity: 0.75;
          }
        }
      `}</style>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
            audioRef.current.playbackRate = playbackRate;
            audioRef.current.volume = isMuted ? 0 : volume;
            audioRef.current.loop = isLooping;
          }
        }}
        onDurationChange={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          if (!isLooping) {
            setCurrentTime(0);
          }
        }}
        onError={() => {
          setError('Failed to play or decode this audio format.');
          setIsPlaying(false);
        }}
      />

      {/* Centered Audio Studio Player Card */}
      <div className="w-full max-w-lg p-6 md:p-8 rounded-3xl border border-border bg-card shadow-xl backdrop-blur flex flex-col gap-6">
        {/* Studio Card Header: Badges & Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold tracking-wider bg-primary/15 text-primary border border-primary/20">
              {formatBadge}
            </span>
            {fileSizeText && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono text-muted-foreground bg-muted border border-border/40">
                {fileSizeText}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleDownload}
            title="Download Audio"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              downloadSuccess
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {downloadSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Downloaded</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>

        {/* Center Studio Deck: Vinyl Disc & Track Info */}
        <div className="flex flex-col items-center text-center gap-4">
          {/* Vinyl Disc Container */}
          <div className="relative flex items-center justify-center">
            <div
              className={`w-28 h-28 rounded-full border-4 border-card/80 bg-neutral-900 shadow-2xl flex items-center justify-center transition-transform duration-700 ${
                isPlaying ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '8s' }}
            >
              {/* Concentric Vinyl Grooves */}
              <div className="w-22 h-22 rounded-full border border-neutral-700/60 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border border-neutral-700/40 flex items-center justify-center">
                  {/* Center Disc Label */}
                  <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-inner">
                    <Music className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Status Beacon */}
            <div className="absolute -bottom-1 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-card/90 border border-border shadow-xs text-[10px] font-mono font-medium">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50'
                }`}
              />
              <span className="text-muted-foreground">{isPlaying ? 'Playing' : 'Paused'}</span>
            </div>
          </div>

          {/* Filename & Track Readout */}
          <div className="max-w-full px-2">
            <h2
              className="text-base md:text-lg font-semibold text-foreground truncate"
              title={fileName}
            >
              {fileName}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Press Space to {isPlaying ? 'pause' : 'play'}
            </p>
          </div>
        </div>

        {/* Dynamic Equalizer Spectrum Bars */}
        <div className="flex items-end justify-center gap-1 h-14 px-4 py-2 bg-muted/25 rounded-2xl border border-border/40 overflow-hidden">
          {EQUALIZER_BARS.map((bar, idx) => (
            <div
              key={idx}
              className={`w-1 md:w-1.5 rounded-full transition-all duration-200 ${
                isPlaying ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
              style={{
                height: isPlaying ? `${bar.base}%` : '15%',
                animation: isPlaying
                  ? `sam-audio-bar-dance ${bar.duration}s ease-in-out infinite alternate`
                  : 'none',
                animationDelay: `${bar.delay}s`,
              }}
            />
          ))}
        </div>

        {/* Interactive Timeline Scrubber */}
        <div className="space-y-1.5">
          <div className="relative group flex items-center h-4">
            {/* Background Track */}
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden relative">
              {/* Progress Fill */}
              <div
                className="h-full bg-primary transition-[width] duration-75 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Scrubber Knob */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-primary border-2 border-card shadow-md pointer-events-none transition-transform group-hover:scale-125"
              style={{
                left: `${progressPercent}%`,
                transform: 'translate(-50%, 0)',
              }}
            />

            {/* Interactive Range Input Overlay */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleScrubberChange}
              disabled={!audioUrl || duration === 0}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Audio timeline slider"
            />
          </div>

          {/* Time Readouts */}
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main Controls Row: Loop, Skip Back, Play/Pause, Skip Forward, Volume */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Loop Button */}
          <button
            type="button"
            onClick={handleToggleLoop}
            title={isLooping ? 'Looping enabled' : 'Loop disabled'}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
              isLooping
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-muted/40 border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>

          {/* Skip Backwards 5s */}
          <button
            type="button"
            onClick={() => handleSkip(-5)}
            title="Skip Back 5s"
            className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Big Play / Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="p-4 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 translate-x-0.5 fill-current" />
            )}
          </button>

          {/* Skip Forward 5s */}
          <button
            type="button"
            onClick={() => handleSkip(5)}
            title="Skip Forward 5s"
            className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Volume / Mute Toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Volume2 className="w-4 h-4 text-foreground" />
            )}
          </button>
        </div>

        {/* Bottom Panel: Volume Slider & Playback Speed Pills */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border/60">
          {/* Volume Slider */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[11px] font-mono text-muted-foreground select-none">Vol:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-24 h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
              aria-label="Volume level"
            />
            <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">
              {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
            </span>
          </div>

          {/* Playback Speed Pills */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-mono text-muted-foreground mr-1 select-none">
              Speed:
            </span>
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => handleSpeedChange(speed)}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded-md transition-colors cursor-pointer ${
                  playbackRate === speed
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
