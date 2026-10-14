import { defineContentScript } from 'wxt/sandbox';
import { createShadowRootUi } from 'wxt/client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { ScraperToolbar } from './ScraperToolbar';
import {
  inferRepeatingPattern,
  computeRelativeSelector,
  getUniqueSelector,
  findLCAAndContainers,
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

    let shadowHostEl: HTMLElement | null = null;
    let containerEl: HTMLElement | null = null;

    const ui = await createShadowRootUi(ctx, {
      name: 'sam-web-scraper',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      isolateEvents: false,

      onMount(container, shadow, shadowHost) {
        shadowHostEl = shadowHost;
        containerEl = container;

        shadowHost.style.position = 'fixed';
        shadowHost.style.top = '0';
        shadowHost.style.left = '0';
        shadowHost.style.width = '0';
        shadowHost.style.height = '0';
        shadowHost.style.overflow = 'visible';
        shadowHost.style.zIndex = '2147483647';
        shadowHost.style.pointerEvents = 'none';

        const shadowHtml = shadow.querySelector('html');
        if (shadowHtml) {
          shadowHtml.style.pointerEvents = 'none';
          shadowHtml.style.background = 'transparent';
          shadowHtml.style.width = '0';
          shadowHtml.style.height = '0';
          shadowHtml.style.overflow = 'visible';
        }

        container.style.pointerEvents = 'none';
        container.style.background = 'transparent';
        container.style.width = '0';
        container.style.height = '0';
        container.style.overflow = 'visible';

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
            const isInsideShadow = (e: MouseEvent): boolean => {
              const path = e.composedPath ? e.composedPath() : [];
              if (shadowHostEl && (path.includes(shadowHostEl) || e.target === shadowHostEl)) return true;
              if (containerEl && (path.includes(containerEl) || e.target === containerEl)) return true;
              return false;
            };

            const handleMouseMove = (e: MouseEvent) => {
              if (isInsideShadow(e)) {
                setHoverRect(null);
                return;
              }

              const target = e.target as HTMLElement | null;
              const currentStep = stepRef.current;

              if (
                !target ||
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
              if (isInsideShadow(e)) {
                // Click is on the toolbar or inside the shadow root; do not intercept!
                return;
              }

              const target = e.target as HTMLElement | null;
              if (!target) return;

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

                const detectedFields: ScraperField[] = [];

                // 1. Table row (<tr>) auto-detection: extract all columns
                const lcaData = findLCAAndContainers(el1, target);
                const sampleContainer = lcaData?.c1 || el1.closest('tr') || el1.parentElement || el1;

                if (sampleContainer && sampleContainer.tagName.toLowerCase() === 'tr') {
                  const cells = Array.from(sampleContainer.querySelectorAll('td, th')) as HTMLElement[];
                  const table = sampleContainer.closest('table');
                  const thElements = table ? Array.from(table.querySelectorAll('thead th, tr:first-child th')) : [];

                  if (cells.length > 0) {
                    cells.forEach((cell, idx) => {
                      const rawThName = thElements[idx]?.textContent?.trim() || '';
                      const headerName = rawThName.length > 0 && rawThName.length < 30 ? rawThName : `Column ${idx + 1}`;
                      detectedFields.push({
                        id: `col-${idx + 1}`,
                        name: headerName,
                        selector: `td:nth-of-type(${idx + 1}), th:nth-of-type(${idx + 1})`,
                        attribute: 'text',
                        type: 'string',
                      });
                    });
                  }
                }

                // 2. Card / list items auto-detection: extract Title, Link, and Image
                if (detectedFields.length === 0) {
                  const tag = target.tagName.toLowerCase();
                  const isImg = tag === 'img';
                  const isLink = tag === 'a' || !!target.closest('a');

                  detectedFields.push({
                    id: 'col-1',
                    name: isImg ? 'Image' : isLink ? 'Title' : 'Text',
                    selector: pattern.relativeFieldSelector,
                    attribute: isImg ? 'src' : 'text',
                    type: isImg ? 'image' : 'string',
                  });

                  // If it's a link or sample container has a link, auto-include Link URL
                  const linkEl = isLink ? (tag === 'a' ? target : target.closest('a')) : sampleContainer.querySelector('a');
                  if (linkEl && !isImg) {
                    const linkRel = sampleContainer !== linkEl ? computeRelativeSelector(sampleContainer, linkEl as HTMLElement) : '';
                    detectedFields.push({
                      id: 'col-link',
                      name: 'Link',
                      selector: linkRel || 'a',
                      attribute: 'href',
                      type: 'url',
                    });
                  }

                  // If sample container contains an image, auto-include Image column
                  const imgEl = sampleContainer.querySelector('img');
                  if (imgEl && !isImg) {
                    const imgRel = computeRelativeSelector(sampleContainer, imgEl);
                    detectedFields.push({
                      id: 'col-img',
                      name: 'Image',
                      selector: imgRel || 'img',
                      attribute: 'src',
                      type: 'image',
                    });
                  }
                }

                setFields(detectedFields);
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

            // 1. Resolve container elements with fallbacks
            let containers: HTMLElement[] = [];
            try {
              if (containerSelector) {
                containers = Array.from(document.querySelectorAll(containerSelector)) as HTMLElement[];
              }
            } catch (err) {
              console.warn('[SAM Scraper] containerSelector query failed:', err);
            }

            if (containers.length === 0 && firstElRef.current) {
              const el = firstElRef.current;
              const tr = el.closest('tr');
              if (tr && tr.parentElement) {
                containers = Array.from(tr.parentElement.querySelectorAll('tr')) as HTMLElement[];
              } else if (el.parentElement) {
                const tag = el.tagName.toLowerCase();
                containers = Array.from(document.querySelectorAll(tag)) as HTMLElement[];
              }
            }

            const extractedRows: Record<string, any>[] = [];

            for (const card of containers) {
              const row: Record<string, any> = {};
              for (const field of fields) {
                let el: Element | null = null;
                try {
                  if (field.selector) {
                    el = card.querySelector(field.selector);
                  } else {
                    el = card;
                  }
                } catch (_) {
                  el = card;
                }

                // Fallback if specific nested selector wasn't found
                if (!el) {
                  if (field.attribute === 'href' || field.type === 'url') {
                    el = card.querySelector('a') || card;
                  } else if (field.attribute === 'src' || field.type === 'image') {
                    el = card.querySelector('img') || card;
                  } else {
                    el = card;
                  }
                }

                if (field.attribute === 'href' || field.type === 'url') {
                  const a = el as HTMLAnchorElement;
                  const href =
                    a.href ||
                    a.getAttribute('href') ||
                    (el.closest('a') as HTMLAnchorElement)?.href ||
                    (el.querySelector('a') as HTMLAnchorElement)?.href ||
                    '';
                  row[field.name] = href;
                } else if (field.attribute === 'src' || field.type === 'image') {
                  const img = el as HTMLImageElement;
                  const src =
                    img.src ||
                    img.getAttribute('data-src') ||
                    img.getAttribute('data-original') ||
                    img.getAttribute('src') ||
                    (el.querySelector('img') as HTMLImageElement)?.src ||
                    '';
                  row[field.name] = src;
                } else if (field.attribute === 'value') {
                  row[field.name] = (el as HTMLInputElement).value || '';
                } else {
                  let text = el.textContent?.trim() || '';
                  if (!text && el !== card) {
                    text = card.textContent?.trim() || '';
                  }
                  row[field.name] = text;
                }
              }

              // Keep row if at least one column has non-empty text
              const hasContent = Object.values(row).some(
                (v) => v !== '' && v !== null && v !== undefined
              );
              if (hasContent) {
                extractedRows.push(row);
              }
            }

            setScrapeProgress({ page: 1, rows: extractedRows.length, status: 'Done' });

            const payloadData = {
              schema,
              rows: extractedRows,
              totalRows: extractedRows.length,
              pagesCrawled: 1,
              domain: window.location.hostname,
              url: window.location.href,
              timestamp: Date.now(),
            };

            // 1. Notify background service worker to open studio and persist results
            try {
              if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                chrome.runtime.sendMessage({
                  type: 'SCRAPER_OPEN_STUDIO',
                  ...payloadData,
                }).catch((err) => {
                  console.warn('[SAM Scraper] Background message error:', err);
                });
              }
            } catch (err) {
              console.warn('[SAM Scraper] Failed to notify studio via runtime message:', err);
            }

            // 2. Safe storage cache fallback (ignoring context restrictions)
            try {
              if (typeof chrome !== 'undefined') {
                if (chrome.storage?.local) {
                  chrome.storage.local.set({
                    sam_persisted_scraper_result: payloadData,
                  }).catch(() => {});
                }
                if (chrome.storage?.session) {
                  chrome.storage.session.set({
                    scraper_session: payloadData,
                    scraper_last_result: payloadData,
                    last_scraper_result: payloadData,
                  }).catch(() => {});
                }
              }
            } catch (_) {}

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
