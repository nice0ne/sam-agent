export type FieldAttribute = 'text' | 'href' | 'src' | 'value';

export type FieldType = 'string' | 'number' | 'currency' | 'url' | 'image';

export type PaginationMode = 'none' | 'next-button' | 'infinite-scroll';

export interface ScraperField {
  id: string;
  name: string;
  selector: string;
  attribute: FieldAttribute;
  type: FieldType;
}

export interface ScraperSchema {
  containerSelector: string;
  fields: ScraperField[];
  nextButtonSelector?: string;
  paginationMode: PaginationMode;
  maxPages: number;
  delayMs: number;
}

export interface ScrapeResult {
  rows: Record<string, any>[];
  totalRows: number;
  pagesCrawled: number;
  domain: string;
}

export type ScraperStep =
  | 'pick-1'
  | 'pick-2'
  | 'configured'
  | 'pick-subfield'
  | 'pick-next'
  | 'scraping'
  | 'idle'
  | 'preview'
  | 'crawling'
  | 'finished';

export interface ScrapeProgress {
  page: number;
  rows?: number;
  rowsCount?: number;
  status: string;
  message?: string;
}

export type CrawlProgress = ScrapeProgress;

export interface InferredPatternResult {
  containerSelector: string;
  relativeSelector: string;
  matchCount: number;
  suggestedAttribute: FieldAttribute;
  suggestedType: FieldType;
  sampleContainers?: HTMLElement[];
}

export interface ScraperRuntimeMessage {
  type:
    | 'SCRAPER_START_PICKER'
    | 'SCRAPER_ELEMENT_CLICKED'
    | 'SCRAPER_SCHEMA_UPDATED'
    | 'SCRAPER_RUN_CRAWL'
    | 'SCRAPER_CRAWL_PROGRESS'
    | 'SCRAPER_CRAWL_COMPLETE'
    | 'SCRAPER_STOP_CRAWL'
    | 'SCRAPER_CLOSE';
  payload?: any;
}
