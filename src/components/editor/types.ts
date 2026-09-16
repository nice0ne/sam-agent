export interface OpenFileTab {
  path: string;
  name: string;
  originalContent: string;
  draftContent: string;
  isDirty: boolean;
  mimeType: string;
  language: string;
}

export interface CursorPosition {
  line: number;
  column: number;
  selectionLength: number;
}
