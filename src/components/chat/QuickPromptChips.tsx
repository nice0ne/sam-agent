import React from 'react';
import { Globe, FileSpreadsheet, FileCode, Search, Presentation, FileText } from 'lucide-react';

export interface QuickPromptChipsProps {
  onSelectPrompt: (prompt: string) => void;
}

interface PromptChip {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
}

const CHIPS: PromptChip[] = [
  {
    label: 'Generate Document (Word)',
    icon: FileText,
    prompt: 'Buatkan dokumen laporan komprehensif dalam format Word (generateDoc) lengkap dengan judul, ringkasan eksekutif, analisis poin-poin, dan tabel data.',
  },
  {
    label: 'Office Summary & PPTX',
    icon: Presentation,
    prompt: 'Rangkum isi dokumen Office ini secara komprehensif, lalu buatkan presentasi PowerPoint (generatePptx) lengkap dengan slide interaktif.',
  },
  {
    label: 'Summarize Page',
    icon: Globe,
    prompt: 'Summarize the content of the current active webpage, extracting key takeaways and action items.',
  },
  {
    label: 'Extract Table to CSV',
    icon: FileSpreadsheet,
    prompt: 'Inspect this page, locate the main data tables, and extract the structured data into a CSV file in /workspace.',
  },
  {
    label: 'Generate HTML Report',
    icon: FileCode,
    prompt: 'Create an interactive HTML report / dashboard visualizing the findings from this page and save it to /workspace/report.html.',
  },
  {
    label: 'Inspect Form & Links',
    icon: Search,
    prompt: 'Analyze all interactive elements, input fields, forms, and outbound links on this page.',
  },
];

export const QuickPromptChips: React.FC<QuickPromptChipsProps> = ({ onSelectPrompt }) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none py-1">
      {CHIPS.map((chip, idx) => {
        const Icon = chip.icon;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectPrompt(chip.prompt)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/80 bg-background/80 hover:bg-muted/80 hover:border-primary/40 text-[11px] text-muted-foreground hover:text-foreground font-medium shrink-0 transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
          >
            <Icon className="size-3 text-primary shrink-0" />
            <span>{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
};
