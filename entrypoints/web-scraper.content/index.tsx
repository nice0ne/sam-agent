import { defineContentScript } from 'wxt/sandbox';
import { createShadowRootUi } from 'wxt/client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { ScraperToolbar } from './ScraperToolbar';
import {
  inferRepeatingPattern,
  computeRelativeSelector,
  getUniqueSelector,
} from '../../src/services/scraper-pattern';
import {
  ScraperStep,
  ScraperField,
  ScraperSchema,
  ScrapeProgress,
} from './types';

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  cssInjectionMode: 'manual',

  async main(ctx) {
    if (document.querySelector('sam-web-scraper')) {
      console.log('[SAM Web Scraper] Already mounted, skipping.');
      return;
    }

    let containerEl: HTMLElement | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: 'sam-web-scraper',
      position: 'modal',
      zIndex: 2147483647,
      anchor: 'body',
      isolateEvents: false,

      onMount(container) {
        containerEl = container;
        const root = ReactDOM.createRoot(container);

        function ScraperApp() {
          const [step, setStep] = useState<ScraperStep>('pick-1');
          const [firstEl, setFirstEl] = useState<HTMLElement | null>(null);
          const [containerSelector, setContainerSelector] = useState<string>('');
          const [fields, setFields] = useState<ScraperField[]>([]);
          const [nextButtonSelector, setNextButtonSelector] = useState<string | undefined>(undefined);
          const [matchedCount, setMatchedCount] = useState<number>(0);
          const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
          const [cardRects, setCardRects] = useState<DOMRect[]>([]);
          const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress | null>(null);

          const stepRef = useRef(step);
          stepRef.current = step;

          const firstElRef = useRef(firstEl);
          firstElRef.current = firstEl;

          const containerSelectorRef = useRef(containerSelector);
          containerSelectorRef.current = containerSelector;

          const fieldsRef = useRef(fields);
          fieldsRef.current = fields;

          // Helper to update card bounding rects
          const updateCardRects = useCallback(() => {
            if (!containerSelectorRef.current) {
              setCardRects([]);
              return;
            }
            try {
              const elements = Array.from(document.querySelectorAll(containerSelectorRef.current));
              const rects = elements
                .map((el) => el.getBoundingClientRect())
                .filter((r) => r.width > 0 && r.height > 0);
              setCardRects(rects);
            } catch (_) {
              setCardRects([]);
            }
          }, []);

          // Listen for scroll & resize to update highlights
          useEffect(() => {
            const handleScrollOrResize = () => {
              updateCardRects();
            };
            window.addEventListener('scroll', handleScrollOrResize, { passive: true });
            window.addEventListener('resize', handleScrollOrResize, { passive: true });
            return () => {
              window.removeEventListener('scroll', handleScrollOrResize);
              window.removeEventListener('resize', handleScrollOrResize);
            };
          }, [updateCardRects]);

          // Global mouse hover and click capture
          useEffect(() => {
            const isInsideShadow = (target: Node | null): boolean => {
              if (!target || !containerEl) return false;
              return containerEl.contains(target);
            };

            const handleMouseMove = (e: MouseEvent) => {
              const target = e.target as HTMLElement | null;
              const currentStep = stepRef.current;

              if (
                !target ||
                isInsideShadow(target) ||
                currentStep === 'configured' ||
                currentStep === 'scraping'
              ) {
                setHoverRect(null);
                return;
              }

              const rect = target.getBoundingClientRect();
              setHoverRect(rect);
            };

            const handleClick = (e: MouseEvent) => {
              const target = e.target as HTMLElement | null;
              if (!target || isInsideShadow(target)) return;

              const currentStep = stepRef.current;

              if (
                currentStep === 'pick-1' ||
                currentStep === 'pick-2' ||
                currentStep === 'pick-subfield' ||
                currentStep === 'pick-next'
              ) {
                e.preventDefault();
                e.stopPropagation();
              }

              if (currentStep === 'pick-1') {
                setFirstEl(target);
                setStep('pick-2');
                setHoverRect(null);
              } else if (currentStep === 'pick-2') {
                const el1 = firstElRef.current;
                if (!el1) return;

                const pattern = inferRepeatingPattern(el1, target);
                setContainerSelector(pattern.containerSelector);
                setMatchedCount(pattern.matchedCount);

                const tag = target.tagName.toLowerCase();
                const isImg = tag === 'img';
                const isLink = tag === 'a' || !!target.closest('a');

                const initialField: ScraperField = {
                  id: 'col-1',
                  name: isImg ? 'Image' : isLink ? 'Link' : 'Title',
                  selector: pattern.relativeFieldSelector,
                  attribute: isImg ? 'src' : isLink && tag === 'a' ? 'href' : 'text',
                  type: isImg ? 'image' : isLink ? 'url' : 'string',
                };

                setFields([initialField]);
                setStep('configured');
                setHoverRect(null);

                // Compute card rects for matching containers
                setTimeout(() => {
                  try {
                    const cards = Array.from(document.querySelectorAll(pattern.containerSelector));
                    const rects = cards
                      .map((c) => c.getBoundingClientRect())
                      .filter((r) => r.width > 0 && r.height > 0);
                    setCardRects(rects);
                  } catch (_) {}
                }, 50);
              } else if (currentStep === 'pick-subfield') {
                const sel = containerSelectorRef.current;
                const card = target.closest(sel) as HTMLElement | null;
                const tag = target.tagName.toLowerCase();
                const isImg = tag === 'img';
                const isLink = tag === 'a';

                let relSelector = '';
                if (card) {
                  relSelector = computeRelativeSelector(card, target);
                } else {
                  relSelector = getUniqueSelector(target);
                }

                const currentFields = fieldsRef.current;
                const fieldNum = currentFields.length + 1;
                const newField: ScraperField = {
                  id: `col-${Date.now()}`,
                  name: isImg ? `Image ${fieldNum}` : isLink ? `Link ${fieldNum}` : `Column ${fieldNum}`,
                  selector: relSelector,
                  attribute: isImg ? 'src' : isLink ? 'href' : 'text',
                  type: isImg ? 'image' : isLink ? 'url' : 'string',
                };

                setFields([...currentFields, newField]);
                setStep('configured');
                setHoverRect(null);
                updateCardRects();
              } else if (currentStep === 'pick-next') {
                const selector = getUniqueSelector(target);
                setNextButtonSelector(selector);
                setStep('configured');
                setHoverRect(null);
              }
            };

            window.addEventListener('mousemove', handleMouseMove, true);
            window.addEventListener('click', handleClick, true);

            return () => {
              window.removeEventListener('mousemove', handleMouseMove, true);
              window.removeEventListener('click', handleClick, true);
            };
          }, [updateCardRects]);

          const handleAddField = () => {
            setStep('pick-subfield');
          };

          const handlePickNextButton = () => {
            setStep('pick-next');
          };

          const handleReset = () => {
            setStep('pick-1');
            setFirstEl(null);
            setContainerSelector('');
            setFields([]);
            setMatchedCount(0);
            setCardRects([]);
            setHoverRect(null);
          };

          const handleCancel = async () => {
            try {
              await chrome.runtime.sendMessage({
                type: 'SCRAPER_CANCEL',
              });
            } catch (_) {}
            ui.remove();
          };

          const handleExtract = async () => {
            setStep('scraping');
            setScrapeProgress({ page: 1, rows: 0, status: 'Extracting DOM...' });

            const schema: ScraperSchema = {
              containerSelector,
              fields,
              nextButtonSelector,
              paginationMode: nextButtonSelector ? 'next-button' : 'none',
              maxPages: 1,
              delayMs: 1000,
            };

            // Extract rows from current page
            const containers = Array.from(document.querySelectorAll(containerSelector));
            const extractedRows: Record<string, any>[] = [];

            for (const card of containers) {
              const row: Record<string, any> = {};
              for (const field of fields) {
                const el = field.selector ? card.querySelector(field.selector) : card;
                if (!el) {
                  row[field.name] = '';
                  continue;
                }

                if (field.attribute === 'href') {
                  row[field.name] = (el as HTMLAnchorElement).href || el.getAttribute('href') || '';
                } else if (field.attribute === 'src') {
                  row[field.name] =
                    (el as HTMLImageElement).src ||
                    el.getAttribute('data-src') ||
                    el.getAttribute('data-original') ||
                    el.getAttribute('src') ||
                    '';
                } else if (field.attribute === 'value') {
                  row[field.name] = (el as HTMLInputElement).value || '';
                } else {
                  row[field.name] = el.textContent?.trim() || '';
                }
              }
              extractedRows.push(row);
            }

            setScrapeProgress({ page: 1, rows: extractedRows.length, status: 'Done' });

            try {
              if (typeof chrome !== 'undefined' && chrome.storage?.session) {
                await chrome.storage.session.set({
                  scraper_session: {
                    schema,
                    rows: extractedRows,
                    totalRows: extractedRows.length,
                    url: window.location.href,
                    timestamp: Date.now(),
                  },
                });
              }

              await chrome.runtime.sendMessage({
                type: 'SCRAPER_OPEN_STUDIO',
                schema,
                rows: extractedRows,
                url: window.location.href,
              });
            } catch (err) {
              console.warn('[SAM Scraper] Failed to notify studio:', err);
            }

            setTimeout(() => {
              ui.remove();
            }, 600);
          };

          return (
            <>
              {/* Hover highlight overlay (purple dashed outline) */}
              {hoverRect && (
                <div
                  style={{
                    position: 'fixed',
                    left: `${hoverRect.left}px`,
                    top: `${hoverRect.top}px`,
                    width: `${hoverRect.width}px`,
                    height: `${hoverRect.height}px`,
                    border: '2px dashed #a855f7',
                    background: 'rgba(168, 85, 247, 0.14)',
                    boxShadow: '0 0 12px rgba(168, 85, 247, 0.3)',
                    pointerEvents: 'none',
                    zIndex: 2147483646,
                    borderRadius: '4px',
                    transition: 'all 0.05s ease',
                  }}
                />
              )}

              {/* Matched container cards highlight overlay (emerald outline) */}
              {cardRects.map((rect, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'fixed',
                    left: `${rect.left}px`,
                    top: `${rect.top}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                    border: '2px solid #10b981',
                    background: 'rgba(16, 185, 129, 0.08)',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.25)',
                    pointerEvents: 'none',
                    zIndex: 2147483645,
                    borderRadius: '6px',
                  }}
                />
              ))}

              {/* Floating Pill Toolbar */}
              <ScraperToolbar
                step={step}
                matchedCount={matchedCount}
                fields={fields}
                hasNextButton={!!nextButtonSelector}
                scrapeProgress={scrapeProgress}
                onAddField={handleAddField}
                onPickNextButton={handlePickNextButton}
                onExtract={handleExtract}
                onCancel={handleCancel}
                onReset={handleReset}
              />
            </>
          );
        }

        root.render(<ScraperApp />);
        return root;
      },

      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
