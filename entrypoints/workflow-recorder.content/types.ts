export type ActionType = 'click' | 'fill' | 'select' | 'toggle' | 'navigate';

export interface TargetMetadata {
  tagName: string;
  selectors: string[]; // Order of resilience: test-id -> stable ID -> name/aria -> text-matching -> CSS path
  textMatch?: {
    tag: string;
    text: string;
  };
  name?: string;
  placeholder?: string;
  inputType?: string;
  ariaLabel?: string;
}

export interface RecordedAction {
  id: string;
  type: ActionType;
  target: TargetMetadata;
  value?: string;
  checked?: boolean;
  timestamp: number;
  url: string;
}

export type RecordingStatus = 'idle' | 'recording' | 'paused';

export interface WorkflowSessionState {
  tabId: number;
  status: RecordingStatus;
  startTime: number;
  actions: RecordedAction[];
  initialUrl: string;
}

// Runtime message payloads
export interface StartRecordingMsg {
  type: 'START_WORKFLOW_RECORDING';
  tabId?: number;
}

export interface FinishRecordingMsg {
  type: 'WORKFLOW_RECORDING_FINISH';
  tabId?: number;
  actions: RecordedAction[];
  initialUrl: string;
}

export interface CancelRecordingMsg {
  type: 'WORKFLOW_RECORDING_CANCEL';
  tabId?: number;
}

export interface StepCountMsg {
  type: 'WORKFLOW_RECORDING_STEP';
  stepCount: number;
  action: RecordedAction;
}
