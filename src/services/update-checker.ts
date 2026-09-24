export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt: string;
  lastChecked: number;
  dismissedVersion?: string;
}

const STORAGE_KEY_UPDATE = 'sam_update_info';
const STORAGE_KEY_DISMISSED = 'sam_dismissed_version';
const GITHUB_REPO = 'nice0ne/sam-agent';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Normalizes version strings by removing leading 'v' and whitespace.
 */
export function cleanVersion(v: string): string {
  return (v || '').trim().replace(/^v/i, '');
}

/**
 * Returns true if candidateVersion is strictly greater than currentVersion using semantic versioning.
 */
export function isNewerVersion(currentVer: string, candidateVer: string): boolean {
  const current = cleanVersion(currentVer).split('.').map((n) => parseInt(n, 10) || 0);
  const candidate = cleanVersion(candidateVer).split('.').map((n) => parseInt(n, 10) || 0);

  const length = Math.max(current.length, candidate.length);
  for (let i = 0; i < length; i++) {
    const c = current[i] || 0;
    const n = candidate[i] || 0;
    if (n > c) return true;
    if (n < c) return false;
  }
  return false;
}

/**
 * Gets the currently installed version from extension manifest.
 */
export function getCurrentVersion(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
    return chrome.runtime.getManifest().version || '4.6.4';
  }
  return '4.6.4';
}

/**
 * Checks for updates from GitHub releases API.
 * Uses cached result if within CACHE_TTL_MS unless forceRefresh is true.
 */
export async function checkForUpdates(forceRefresh = false): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();
  const now = Date.now();

  // 1. Read cached state
  let cached: Partial<UpdateInfo> | null = null;
  let dismissedVersion: string | undefined;

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const stored = await chrome.storage.local.get([STORAGE_KEY_UPDATE, STORAGE_KEY_DISMISSED]);
      cached = stored[STORAGE_KEY_UPDATE] || null;
      dismissedVersion = stored[STORAGE_KEY_DISMISSED] || undefined;
    }
  } catch (err) {
    console.warn('[UpdateChecker] Failed to read cache:', err);
  }

  // 2. Return cached if valid and not expired
  if (!forceRefresh && cached && cached.lastChecked && now - cached.lastChecked < CACHE_TTL_MS) {
    const hasUpdate = isNewerVersion(currentVersion, cached.latestVersion || currentVersion);
    return {
      hasUpdate,
      currentVersion,
      latestVersion: cached.latestVersion || currentVersion,
      releaseName: cached.releaseName || '',
      releaseNotes: cached.releaseNotes || '',
      releaseUrl: cached.releaseUrl || `https://github.com/${GITHUB_REPO}/releases`,
      publishedAt: cached.publishedAt || '',
      lastChecked: cached.lastChecked,
      dismissedVersion,
    };
  }

  // 3. Fetch latest release from GitHub API
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      // If rate limited or 404, fallback to cache or current version
      if (cached && cached.latestVersion) {
        return {
          hasUpdate: isNewerVersion(currentVersion, cached.latestVersion),
          currentVersion,
          latestVersion: cached.latestVersion,
          releaseName: cached.releaseName || '',
          releaseNotes: cached.releaseNotes || '',
          releaseUrl: cached.releaseUrl || `https://github.com/${GITHUB_REPO}/releases`,
          publishedAt: cached.publishedAt || '',
          lastChecked: now,
          dismissedVersion,
        };
      }
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion: currentVersion,
        releaseName: '',
        releaseNotes: '',
        releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
        publishedAt: '',
        lastChecked: now,
        dismissedVersion,
      };
    }

    const data = await response.json();
    const rawTag = data.tag_name || data.name || currentVersion;
    const latestVersion = cleanVersion(rawTag);
    const hasUpdate = isNewerVersion(currentVersion, latestVersion);
    const releaseUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/${rawTag}`;

    const updateInfo: UpdateInfo = {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseName: data.name || `SAM-Agent v${latestVersion}`,
      releaseNotes: data.body || '',
      releaseUrl,
      publishedAt: data.published_at || new Date().toISOString(),
      lastChecked: now,
      dismissedVersion,
    };

    // Save to storage
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY_UPDATE]: updateInfo });
    }

    return updateInfo;
  } catch (err) {
    console.warn('[UpdateChecker] Network error checking updates:', err);
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseName: '',
      releaseNotes: '',
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
      publishedAt: '',
      lastChecked: now,
      dismissedVersion,
    };
  }
}

/**
 * Dismisses update notification for a specific version.
 */
export async function dismissUpdate(version: string): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY_DISMISSED]: cleanVersion(version) });
    }
  } catch (err) {
    console.warn('[UpdateChecker] Failed to dismiss update:', err);
  }
}

/**
 * Opens GitHub releases page in a new browser tab.
 */
export function openReleasesPage(url?: string): void {
  const targetUrl = url || `https://github.com/${GITHUB_REPO}/releases`;
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: targetUrl });
      return;
    }
  } catch (_) {}
  window.open(targetUrl, '_blank', 'noopener,noreferrer');
}
