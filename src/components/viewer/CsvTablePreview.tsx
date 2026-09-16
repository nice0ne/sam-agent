import React, { useState, useMemo } from 'react';
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export interface CsvTablePreviewProps {
  content: string;
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let insideQuotes = false;
    let field = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        cells.push(field.trim());
        field = '';
      } else {
        field += char;
      }
    }
    cells.push(field.trim());
    return cells;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export const CsvTablePreview: React.FC<CsvTablePreviewProps> = ({ content }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { headers, rows } = useMemo(() => parseCsv(content), [content]);

  const handleHeaderClick = (colIdx: number) => {
    if (sortCol === colIdx) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortCol(null);
        setSortDir('asc');
      }
    } else {
      setSortCol(colIdx);
      setSortDir('asc');
    }
  };

  const filteredAndSortedRows = useMemo(() => {
    let result = rows;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((row) =>
        row.some((cell) => cell.toLowerCase().includes(term))
      );
    }

    if (sortCol !== null) {
      result = [...result].sort((a, b) => {
        const valA = a[sortCol] || '';
        const valB = b[sortCol] || '';
        const numA = Number(valA);
        const numB = Number(valB);

        if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
          return sortDir === 'asc' ? numA - numB : numB - numA;
        }
        return sortDir === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      });
    }

    return result;
  }, [rows, searchTerm, sortCol, sortDir]);

  if (headers.length === 0 && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <p className="text-sm font-medium">Empty CSV Content</p>
        <p className="text-xs mt-1">This file contains no parsable rows or columns.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden p-6">
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search rows..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-muted/50 hover:bg-muted/70 focus:bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Row Count Badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">
            Showing <strong className="mx-1 text-foreground">{filteredAndSortedRows.length}</strong> of{' '}
            <strong className="mx-1 text-foreground">{rows.length}</strong> rows ({headers.length} columns)
          </span>
        </div>
      </div>

      {/* Interactive Table Container */}
      <div className="flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-muted/90 backdrop-blur sticky top-0 z-10 border-b border-border select-none">
            <tr>
              <th className="w-12 px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase text-center border-r border-border/40">
                #
              </th>
              {headers.map((h, i) => {
                const isSorted = sortCol === i;
                return (
                  <th
                    key={i}
                    onClick={() => handleHeaderClick(i)}
                    className="px-4 py-2.5 font-semibold text-foreground border-r border-border/40 last:border-r-0 hover:bg-muted cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{h}</span>
                      <span className="text-muted-foreground">
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredAndSortedRows.length > 0 ? (
              filteredAndSortedRows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-muted/40 transition-colors">
                  <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground/60 text-center select-none bg-muted/10 border-r border-border/40">
                    {rIdx + 1}
                  </td>
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-4 py-2 text-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis border-r border-border/40 last:border-r-0"
                    >
                      {row[cIdx] !== undefined ? row[cIdx] : ''}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={headers.length + 1}
                  className="py-12 text-center text-xs text-muted-foreground italic"
                >
                  No rows match the search query "{searchTerm}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CsvTablePreview;
