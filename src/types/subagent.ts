export type WorkerRole = 'researcher' | 'scraper' | 'analyst';

export interface WorkerSpec {
  id: string;
  name: string;
  role: WorkerRole;
  taskPrompt: string;
  targetUrls?: string[];
  maxSteps?: number;
  color?: string;
}

export interface WorkerDeliverable {
  workerId: string;
  name: string;
  role: WorkerRole;
  status: 'completed' | 'failed' | 'timeout';
  summary: string;
  extractedData?: Record<string, any>[];
  artifactsCreated?: string[];
  stepsUsed: number;
  durationMs: number;
  error?: string;
  logs?: string[];
}

export interface PipelineWorkerState {
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: number;
  maxSteps: number;
  lastThought?: string;
  name?: string;
  role?: WorkerRole;
  logs?: string[];
}

export interface PipelineProgress {
  planTitle: string;
  totalWorkers: number;
  completedWorkers: number;
  workers: Record<string, PipelineWorkerState>;
}
