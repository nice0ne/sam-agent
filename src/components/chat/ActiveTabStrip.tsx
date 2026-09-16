import React, { useState, useEffect, useCallback } from 'react';
import { Globe, RotateCw, Layers } from 'lucide-react';
import { getOpenTabs, switchToTab, type TabInfo } from '../../services/tab-manager';

export const ActiveTabStrip: React.FC = () => {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTabs = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getOpenTabs();
      setTabs(data);
    } catch (err) {
      console.warn('[ActiveTabStrip] Failed to load tabs:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTabs();

    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return;
    }

    // Listen for tab switch, update, or removal events
    const tabActivatedHandler = () => {
      loadTabs();
    };
    const tabUpdatedHandler = () => {
      loadTabs();
    };
    const tabRemovedHandler = () => {
      loadTabs();
    };

    chrome.tabs.onActivated.addListener(tabActivatedHandler);
    chrome.tabs.onUpdated.addListener(tabUpdatedHandler);
    chrome.tabs.onRemoved.addListener(tabRemovedHandler);

    return () => {
      chrome.tabs.onActivated.removeListener(tabActivatedHandler);
      chrome.tabs.onUpdated.removeListener(tabUpdatedHandler);
      chrome.tabs.onRemoved.removeListener(tabRemovedHandler);
    };
  }, [loadTabs]);

  const handleTabClick = async (tabId: number) => {
    await switchToTab(tabId);
    await loadTabs();
  };

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-card/60 border-b border-border/70 text-[11px] overflow-x-auto no-scrollbar select-none shrink-0">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground shrink-0 font-medium mr-0.5">
        <Layers className="size-2.5 text-primary" />
        <span>Tabs ({tabs.length})</span>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all shrink-0 cursor-pointer border ${
              tab.active
                ? 'bg-background border-primary/40 text-foreground shadow-2xs'
                : 'bg-card/40 border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
            }`}
            title={`${tab.title}\n${tab.url}`}
          >
            {tab.active && (
              <span className="size-1 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            )}
            {tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://') ? (
              <img
                src={tab.favIconUrl}
                alt=""
                className="size-2.5 rounded-xs shrink-0 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Globe className="size-2.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate max-w-[85px]">{tab.title}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={loadTabs}
        className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors shrink-0 cursor-pointer"
        title="Refresh open tabs"
      >
        <RotateCw className={`size-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
