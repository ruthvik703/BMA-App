import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Student, Dojo } from '../types';
import { KARATE_RANKS, TOTS_RANKS, KOBUDO_RANKS } from '../constants';
import {
  X,
  Upload,
  Plus,
  Trash2,
  Users,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ClipboardPaste,
  Layers,
  Sparkles,
  ArrowRight,
  Info
} from 'lucide-react';

interface BulkStudentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultLocation?: string;
  defaultProgram?: 'karate' | 'tots' | 'kobudo' | string;
  availableLocations?: string[];
  customDojos?: Dojo[];
  onAddStudents: (students: Student[]) => Promise<void> | void;
}

export interface TableRowData {
  id: string;
  name: string;
  rank: string;
  secondaryRank?: string; // e.g. sai for kobudo
  beltSize: string;
  attendance: string | number;
  scheduleDay?: string;
  scheduleTime?: string;
  birthday?: string;
  weapons?: string;
  notes?: string;
  customValues: { [key: string]: string };
}

// Helper to normalize rank strings into specific valid rank IDs
export function resolveRank(rawRank: string, program: 'karate' | 'tots' | 'kobudo'): { id: string; name: string; color: string } {
  const clean = (rawRank || '').trim().toLowerCase().replace(/['"]/g, '');
  const rankPool = program === 'karate' ? KARATE_RANKS : (program === 'tots' ? TOTS_RANKS : KOBUDO_RANKS);

  if (!clean) {
    const def = rankPool[0];
    return { id: def.id, name: def.name, color: def.color };
  }

  // 1. Direct ID match
  const directId = rankPool.find(r => r.id.toLowerCase() === clean);
  if (directId) {
    return { id: directId.id, name: directId.name, color: directId.color };
  }

  // 2. Direct name match
  const directName = rankPool.find(r => r.name.toLowerCase() === clean);
  if (directName) {
    return { id: directName.id, name: directName.name, color: directName.color };
  }

  // 3. Smart pattern matching for Karate
  if (program === 'karate') {
    if (clean.includes('white')) return { id: 'white', name: 'White Belt', color: '#f4f4f5' };
    if (clean.includes('9th') || (clean.includes('red') && clean.includes('stripe'))) return { id: 'kyu9', name: '9th Kyu - Red with White Stripe', color: '#ef4444' };
    if (clean.includes('int. 8') || clean.includes('int 8') || clean.includes('red/white')) return { id: 'int8', name: 'Int. 8th Kyu - Red/White', color: 'linear-gradient(135deg, #ef4444 50%, #fafafa 50%)' };
    if (clean.includes('8th') || (clean.includes('red') && !clean.includes('white') && !clean.includes('orange'))) return { id: 'kyu8', name: '8th Kyu - Red Belt', color: '#ef4444' };
    if (clean.includes('int. 7') || clean.includes('int 7') || clean.includes('red/orange')) return { id: 'int7', name: 'Int. 7th Kyu - Red/Orange', color: 'linear-gradient(135deg, #ef4444 50%, #f97316 50%)' };
    if (clean.includes('7th') || (clean.includes('orange') && !clean.includes('red') && !clean.includes('yellow'))) return { id: 'kyu7', name: '7th Kyu - Orange Belt', color: '#f97316' };
    if (clean.includes('int. 6') || clean.includes('int 6') || clean.includes('orange/yellow')) return { id: 'int6', name: 'Int. 6th Kyu - Orange/Yellow', color: 'linear-gradient(135deg, #f97316 50%, #eab308 50%)' };
    if (clean.includes('6th') || (clean.includes('yellow') && !clean.includes('purple') && !clean.includes('orange'))) return { id: 'kyu6', name: '6th Kyu - Yellow Belt', color: '#eab308' };
    if (clean.includes('int. 5') || clean.includes('int 5') || clean.includes('yellow/purple')) return { id: 'int5', name: 'Int. 5th Kyu - Yellow/Purple', color: 'linear-gradient(135deg, #eab308 50%, #a855f7 50%)' };
    if (clean.includes('5th') || (clean.includes('purple') && !clean.includes('blue') && !clean.includes('yellow'))) return { id: 'kyu5', name: '5th Kyu - Purple Belt', color: '#a855f7' };
    if (clean.includes('int. 4') || clean.includes('int 4') || clean.includes('purple/blue')) return { id: 'int4', name: 'Int. 4th Kyu - Purple/Blue', color: 'linear-gradient(135deg, #a855f7 50%, #3b82f6 50%)' };
    if (clean.includes('4th') || (clean.includes('blue') && !clean.includes('purple') && !clean.includes('green'))) return { id: 'kyu4', name: '4th Kyu - Blue Belt', color: '#3b82f6' };
    if (clean.includes('int. 3') || clean.includes('int 3') || clean.includes('blue/green')) return { id: 'int3', name: 'Int. 3rd Kyu - Blue/Green', color: 'linear-gradient(135deg, #3b82f6 50%, #22c55e 50%)' };
    if (clean.includes('3rd kyu') || (clean.includes('green') && !clean.includes('blue') && !clean.includes('brown'))) return { id: 'kyu3', name: '3rd Kyu - Green Belt', color: '#22c55e' };
    if (clean.includes('3rd brown') || clean.includes('brown 3') || clean.includes('brown/white')) return { id: 'kyu2', name: '3rd Kyu - Brown with White Stripe', color: '#78350f' };
    if (clean.includes('2nd brown') || clean.includes('brown 2') || clean.includes('brown/red')) return { id: 'kyu1', name: '2nd Kyu - Brown with Red Stripe', color: '#78350f' };
    if (clean.includes('1st brown') || clean.includes('brown 1') || clean.includes('brown/black')) return { id: 'kyu0', name: '1st Kyu - Brown with Black Stripe', color: '#78350f' };
    if (clean.includes('1st kyu') || clean.includes('kyu 1') || clean.includes('solid brown') || clean === 'brown') return { id: 'kyu_1', name: '1st Kyu - Solid Brown Belt', color: '#78350f' };
    if (clean.includes('int. shodan') || clean.includes('int shodan') || clean.includes('intermediate shodan') || clean.includes('brown/black half')) return { id: 'int_shodan', name: 'Int. Shodan - Half Brown / Half Black', color: 'linear-gradient(135deg, #78350f 50%, #18181b 50%)' };
    if (clean.includes('shodan') || clean.includes('black') || clean.includes('1st dan')) return { id: 'shodan', name: 'Shodan - 1st Degree Black Belt', color: '#18181b' };
  }

  // 4. Smart pattern matching for Tots
  if (program === 'tots') {
    if (clean.includes('white') && !clean.includes('stripe')) return { id: 't_white', name: 'White Belt', color: '#f4f4f5' };
    if (clean.includes('yellow stripe') || clean.includes('yellow/white')) return { id: 't_yellow_stripe', name: 'White with Yellow Stripe', color: '#f4f4f5' };
    if (clean.includes('yellow') && !clean.includes('orange')) return { id: 't_yellow', name: 'Yellow Belt', color: '#eab308' };
    if (clean.includes('orange stripe') || clean.includes('orange/yellow')) return { id: 't_orange_stripe', name: 'Yellow with Orange Stripe', color: '#eab308' };
    if (clean.includes('orange')) return { id: 't_orange', name: 'Orange Belt', color: '#f97316' };
    if (clean.includes('red stripe')) return { id: 't_red_stripe', name: 'Orange with Red Stripe', color: '#f97316' };
    if (clean.includes('red')) return { id: 't_red', name: 'Red Belt', color: '#ef4444' };
    if (clean.includes('blue stripe')) return { id: 't_blue_stripe', name: 'Red with Blue Stripe', color: '#ef4444' };
    if (clean.includes('blue')) return { id: 't_blue', name: 'Blue Belt', color: '#3b82f6' };
    if (clean.includes('purple stripe')) return { id: 't_purple_stripe', name: 'Blue with Purple Stripe', color: '#3b82f6' };
    if (clean.includes('purple')) return { id: 't_purple', name: 'Purple Belt', color: '#a855f7' };
    if (clean.includes('green stripe')) return { id: 't_green_stripe', name: 'Purple with Green Stripe', color: '#a855f7' };
    if (clean.includes('green')) return { id: 't_green', name: 'Green Belt', color: '#22c55e' };
    if (clean.includes('brown stripe')) return { id: 't_brown_stripe', name: 'Green with Brown Stripe', color: '#22c55e' };
    if (clean.includes('brown')) return { id: 't_brown', name: 'Brown Belt', color: '#78350f' };
    if (clean.includes('black stripe')) return { id: 't_black_stripe', name: 'Brown with Black Stripe', color: '#78350f' };
    if (clean.includes('black')) return { id: 't_black', name: 'Black Belt', color: '#18181b' };
  }

  // 5. Smart pattern matching for Kobudo
  if (program === 'kobudo') {
    if (clean.includes('white')) return { id: 'k_white', name: 'White Belt', color: '#f4f4f5' };
    if (clean.includes('yellow')) return { id: 'k_yellow', name: 'Yellow Belt', color: '#eab308' };
    if (clean.includes('green')) return { id: 'k_green', name: 'Green Belt', color: '#22c55e' };
    if (clean.includes('brown')) return { id: 'k_brown', name: 'Brown Belt', color: '#78350f' };
    if (clean.includes('black')) return { id: 'k_black', name: 'Black Belt', color: '#18181b' };
  }

  // Fallback to first rank
  const def = rankPool[0];
  return { id: def.id, name: def.name, color: def.color };
}

// CSV/TSV line parser
function parseDelimiterLine(text: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if ((char === ',' || char === '\t') && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result.map(s => s.replace(/^["']|["']$/g, '').trim());
}

export function BulkStudentUploadModal({
  isOpen,
  onClose,
  defaultLocation = 'West Chester',
  defaultProgram = 'karate',
  availableLocations = [],
  customDojos = [],
  onAddStudents
}: BulkStudentUploadModalProps) {
  // Target location & program
  const [targetLocation, setTargetLocation] = useState<string>(defaultLocation);
  const [selectedProgram, setSelectedProgram] = useState<'karate' | 'tots' | 'kobudo' | string>(defaultProgram || 'karate');

  // Interactive spreadsheet rows
  const [rows, setRows] = useState<TableRowData[]>([]);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute all available locations
  const allLocations = useMemo(() => {
    const base = ['West Chester', 'Monroe', 'YMCA'];
    const customNames = customDojos.map(d => d.name);
    return Array.from(new Set([...base, ...availableLocations, ...customNames]));
  }, [availableLocations, customDojos]);

  // Check if targetLocation or selectedProgram matches a custom dojo
  const matchingCustomDojo = useMemo(() => {
    return customDojos.find(d => d.name.toLowerCase() === targetLocation.toLowerCase() || d.name.toLowerCase() === selectedProgram.toLowerCase()) || null;
  }, [customDojos, targetLocation, selectedProgram]);

  // Dynamic custom attributes configured for this program/dojo
  const programCustomFields = useMemo(() => {
    if (!matchingCustomDojo?.customProfileFields) return [];
    return matchingCustomDojo.customProfileFields.filter(f => f.enabled);
  }, [matchingCustomDojo]);

  // Reset and initialize default blank rows on modal open
  useEffect(() => {
    if (isOpen) {
      const loc = defaultLocation || 'West Chester';
      setTargetLocation(loc);

      // If the location matches a custom dojo, adapt selectedProgram
      const dojoMatch = customDojos.find(d => d.name.toLowerCase() === loc.toLowerCase());
      if (dojoMatch) {
        setSelectedProgram(dojoMatch.name);
      } else if (defaultProgram) {
        setSelectedProgram(defaultProgram);
      } else {
        setSelectedProgram('karate');
      }

      // Initialize 4 initial blank rows for quick typing
      setRows([
        createBlankRow(),
        createBlankRow(),
        createBlankRow(),
        createBlankRow(),
      ]);
      setStatusMessage(null);
      setPasteText('');
      setPasteModalOpen(false);
    }
  }, [isOpen, defaultLocation, defaultProgram]);

  // Create a blank row
  function createBlankRow(): TableRowData {
    const customValues: { [key: string]: string } = {};
    programCustomFields.forEach(f => {
      customValues[f.id] = '';
    });

    let defaultRank = 'white';
    if (selectedProgram === 'tots') defaultRank = 't_white';
    else if (selectedProgram === 'kobudo') defaultRank = 'k_white';

    return {
      id: Math.random().toString(36).substring(2, 9),
      name: '',
      rank: defaultRank,
      secondaryRank: selectedProgram === 'kobudo' ? 'k_white' : undefined,
      beltSize: '0',
      attendance: 0,
      scheduleDay: 'Monday',
      scheduleTime: '5:30 PM',
      birthday: '',
      weapons: 'Both',
      notes: '',
      customValues
    };
  }

  // Handle cell changes
  const handleCellChange = (id: string, field: keyof TableRowData | string, value: any) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      if (field in r) {
        return { ...r, [field]: value };
      }
      // Otherwise it's a customValue field
      return {
        ...r,
        customValues: {
          ...r.customValues,
          [field]: value
        }
      };
    }));
  };

  // Keyboard navigation: Enter or Tab in the last cell of the last row adds a new row!
  const handleCellKeyDown = (e: React.KeyboardEvent, rowIndex: number, isLastColumn: boolean) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If we are on the last row, add a new row
      if (rowIndex === rows.length - 1) {
        setRows(prev => [...prev, createBlankRow()]);
      }
      // Focus the next row's name input
      setTimeout(() => {
        const nextInput = document.querySelector<HTMLInputElement>(`input[data-row="${rowIndex + 1}"][data-col="name"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }, 50);
    } else if (e.key === 'Tab' && !e.shiftKey && isLastColumn) {
      if (rowIndex === rows.length - 1) {
        e.preventDefault();
        setRows(prev => [...prev, createBlankRow()]);
        setTimeout(() => {
          const nextInput = document.querySelector<HTMLInputElement>(`input[data-row="${rowIndex + 1}"][data-col="name"]`);
          if (nextInput) {
            nextInput.focus();
            nextInput.select();
          }
        }, 50);
      }
    }
  };

  // Add extra rows
  const handleAddRow = () => {
    setRows(prev => [...prev, createBlankRow()]);
  };

  const handleAddFiveRows = () => {
    setRows(prev => [...prev, createBlankRow(), createBlankRow(), createBlankRow(), createBlankRow(), createBlankRow()]);
  };

  const handleDeleteRow = (id: string) => {
    setRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : [createBlankRow()]));
  };

  const handleClearRows = () => {
    setRows([createBlankRow(), createBlankRow(), createBlankRow()]);
  };

  // Parse bulk pasted text (CSV or Tab-Separated from Sheets/Excel)
  const handleProcessPastedData = (text: string) => {
    if (!text.trim()) return;

    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) return;

    let startIndex = 0;
    const firstRowTokens = parseDelimiterLine(lines[0]).map(t => t.toLowerCase());

    // Check for header row
    const hasHeaderName = firstRowTokens.some(t => t.includes('name') || t.includes('student'));
    const hasHeaderRank = firstRowTokens.some(t => t.includes('rank') || t.includes('belt'));

    let nameCol = 0;
    let rankCol = 1;
    let sizeCol = 2;
    let attCol = 3;

    if (hasHeaderName || hasHeaderRank) {
      startIndex = 1;
      nameCol = firstRowTokens.findIndex(t => t.includes('name') || t.includes('student'));
      rankCol = firstRowTokens.findIndex(t => t.includes('rank') || t.includes('belt'));
      sizeCol = firstRowTokens.findIndex(t => t.includes('size'));
      attCol = firstRowTokens.findIndex(t => t.includes('attend') || t.includes('class'));
    }

    const progKey: 'karate' | 'tots' | 'kobudo' =
      selectedProgram === 'tots' ? 'tots' : selectedProgram === 'kobudo' ? 'kobudo' : 'karate';

    const newRows: TableRowData[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const tokens = parseDelimiterLine(lines[i]);
      if (tokens.length === 0 || !tokens.some(t => t.length > 0)) continue;

      const rawName = tokens[nameCol >= 0 ? nameCol : 0] || '';
      const rawRank = rankCol >= 0 && tokens[rankCol] ? tokens[rankCol] : '';
      const rawSize = sizeCol >= 0 && tokens[sizeCol] ? tokens[sizeCol] : '0';
      const rawAtt = attCol >= 0 && tokens[attCol] ? parseInt(tokens[attCol], 10) || 0 : 0;

      const resolved = resolveRank(rawRank, progKey);

      newRows.push({
        id: Math.random().toString(36).substring(2, 9),
        name: rawName,
        rank: resolved.id,
        secondaryRank: selectedProgram === 'kobudo' ? 'k_white' : undefined,
        beltSize: rawSize.replace(/[^0-9]/g, '') || '0',
        attendance: rawAtt,
        scheduleDay: 'Monday',
        scheduleTime: '5:30 PM',
        birthday: '',
        weapons: 'Both',
        notes: '',
        customValues: {}
      });
    }

    if (newRows.length > 0) {
      // Replace empty rows or append
      const existingFilled = rows.filter(r => r.name.trim().length > 0);
      setRows([...existingFilled, ...newRows]);
      setPasteModalOpen(false);
      setPasteText('');
      setStatusMessage({
        type: 'success',
        text: `Loaded ${newRows.length} student row(s) from clipboard!`
      });
    }
  };

  // Upload CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        handleProcessPastedData(content);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Calculate valid count
  const validRows = rows.filter(r => r.name.trim().length > 0);

  // Submit all valid rows to the roster
  const handleSubmitAll = async () => {
    if (validRows.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Please type or paste at least one student with a name.'
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const progKey: 'karate' | 'tots' | 'kobudo' =
        selectedProgram === 'tots' ? 'tots' : selectedProgram === 'kobudo' ? 'kobudo' : 'karate';

      const studentsToAdd: Student[] = validRows.map(r => {
        const studentId = `std_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const cleanAtt = Math.max(0, parseInt(String(r.attendance), 10) || 0);

        const newStudent: Student = {
          id: studentId,
          name: r.name.trim(),
          location: targetLocation,
          programs: [progKey],
          rankings: { [progKey]: r.rank || 'white' },
          attendance: { [progKey]: cleanAtt },
          beltSize: r.beltSize || '0',
          notes: r.notes?.trim() || undefined,
          birthday: r.birthday?.trim() || undefined,
          lastAttendanceUpdate: cleanAtt > 0 ? new Date().toLocaleDateString('en-CA') : undefined,
          customFields: Object.keys(r.customValues).length > 0 ? r.customValues : undefined
        };

        // Kobudo specifics
        if (selectedProgram === 'kobudo') {
          newStudent.kobudoRankings = {
            bo: r.rank || 'k_white',
            sai: r.secondaryRank || 'k_white'
          };
          newStudent.kobudoTestingWeapon = (r.weapons as any) || 'Both';
        }

        // Schedule specifics (if not YMCA)
        if (targetLocation !== 'YMCA' && r.scheduleDay && r.scheduleTime) {
          newStudent.scheduleDay1 = r.scheduleDay;
          newStudent.scheduleTime1 = r.scheduleTime;
        }

        return newStudent;
      });

      await onAddStudents(studentsToAdd);
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      console.error('Failed to add bulk students:', err);
      setIsSubmitting(false);
      setStatusMessage({
        type: 'error',
        text: 'Failed to save students to database. Please try again.'
      });
    }
  };

  if (!isOpen) return null;

  // Rank pool for active program
  const activeRanks =
    selectedProgram === 'tots'
      ? TOTS_RANKS
      : selectedProgram === 'kobudo'
      ? KOBUDO_RANKS
      : KARATE_RANKS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-4 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-500 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white uppercase tracking-wider">
                  Quick Student Entry Grid
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase bg-red-950/80 text-red-400 border border-red-800/60">
                  Spreadsheet Tabbing
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Tab seamlessly across cells. Pressing <span className="text-white font-mono font-bold">Enter</span> jumps down and creates a new row.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration Bar: Program & Location Adaptation */}
        <div className="p-4 bg-zinc-900/80 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Location Selector */}
            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Location:
              </span>
              <select
                value={targetLocation}
                onChange={(e) => setTargetLocation(e.target.value)}
                className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer"
              >
                {allLocations.map((loc) => (
                  <option key={loc} value={loc} className="bg-zinc-900 text-white">
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            {/* Program Selector */}
            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-xl">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Program / Format:
              </span>
              <select
                value={selectedProgram}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedProgram(val);
                  // Update rows with new default rank
                  let defRank = 'white';
                  if (val === 'tots') defRank = 't_white';
                  else if (val === 'kobudo') defRank = 'k_white';
                  setRows(prev => prev.map(r => ({
                    ...r,
                    rank: defRank,
                    secondaryRank: val === 'kobudo' ? 'k_white' : undefined
                  })));
                }}
                className="bg-transparent text-xs font-black text-white focus:outline-none cursor-pointer"
              >
                <option value="karate" className="bg-zinc-900 text-white">Karate (Standard)</option>
                <option value="tots" className="bg-zinc-900 text-white">Little Tots</option>
                <option value="kobudo" className="bg-zinc-900 text-white">Kobudo (Weapons)</option>
                {customDojos.map((d) => (
                  <option key={d.id} value={d.name} className="bg-zinc-900 text-white">
                    {d.name} (Custom)
                  </option>
                ))}
              </select>
            </div>

            {matchingCustomDojo && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-600/40 text-[10px] font-mono text-amber-300 font-bold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Adapted to {matchingCustomDojo.name} Profile Fields
              </span>
            )}
          </div>

          {/* Quick Import Tools */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPasteModalOpen(true)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
              title="Paste tab-separated or comma-separated list"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-zinc-400" />
              <span>Paste CSV / Sheets</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
              title="Upload CSV or TXT file"
            >
              <Upload className="w-3.5 h-3.5 text-zinc-400" />
              <span>Import File</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {/* Status notification */}
        {statusMessage && (
          <div className={`px-5 py-2.5 flex items-center gap-2 text-xs font-bold border-b ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-900'
              : 'bg-red-950/60 text-red-300 border-red-900'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Paste Drawer / Modal */}
        {pasteModalOpen && (
          <div className="p-4 bg-zinc-900 border-b border-zinc-800 animate-in slide-in-from-top-2 duration-200">
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                  <ClipboardPaste className="w-4 h-4 text-red-500" />
                  Paste Copied Rows (Excel, Google Sheets, or CSV)
                </span>
                <button
                  type="button"
                  onClick={() => setPasteModalOpen(false)}
                  className="text-zinc-500 hover:text-white text-xs font-bold"
                >
                  ✕ Close
                </button>
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Example:\nJohn Smith, White Belt, 0, 14\nSarah Connor, 9th Kyu, 1, 16\nMichael Chang, Yellow Belt, 2, 8"}
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none focus:border-red-600"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasteModalOpen(false)}
                  className="px-3 py-1.5 bg-zinc-800 text-zinc-300 text-xs font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleProcessPastedData(pasteText)}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider rounded-lg shadow-md"
                >
                  Populate Table
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Spreadsheet Grid */}
        <div className="flex-1 overflow-auto p-4">
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px] font-black select-none sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center text-zinc-600 font-mono">#</th>
                  <th className="py-2.5 px-3 min-w-[180px]">
                    Student Name <span className="text-red-500">*</span>
                  </th>
                  <th className="py-2.5 px-3 min-w-[160px]">
                    {selectedProgram === 'kobudo' ? 'Bo Rank' : 'Belt Rank'}
                  </th>
                  {selectedProgram === 'kobudo' && (
                    <th className="py-2.5 px-3 min-w-[160px]">Sai Rank</th>
                  )}
                  {selectedProgram === 'kobudo' && (
                    <th className="py-2.5 px-3 min-w-[110px]">Testing Weapon</th>
                  )}
                  {selectedProgram !== 'kobudo' && (
                    <th className="py-2.5 px-3 min-w-[90px]">Belt Size</th>
                  )}
                  <th className="py-2.5 px-3 min-w-[110px]">Classes Attended</th>
                  {targetLocation !== 'YMCA' && (
                    <>
                      <th className="py-2.5 px-3 min-w-[130px]">Class Day</th>
                      <th className="py-2.5 px-3 min-w-[120px]">Class Time</th>
                    </>
                  )}
                  <th className="py-2.5 px-3 min-w-[130px]">Birthday</th>
                  {programCustomFields.map(f => (
                    <th key={f.id} className="py-2.5 px-3 min-w-[140px] text-amber-400">
                      {f.label}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 min-w-[150px]">Notes</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850">
                {rows.map((row, index) => {
                  const isLast = index === rows.length - 1;
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-zinc-900/60 transition group focus-within:bg-zinc-900/80"
                    >
                      {/* Row Index */}
                      <td className="py-1 px-3 text-center text-zinc-600 font-mono text-[10px] select-none">
                        {index + 1}
                      </td>

                      {/* Student Name */}
                      <td className="py-1 px-2">
                        <input
                          type="text"
                          data-row={index}
                          data-col="name"
                          value={row.name}
                          onChange={(e) => handleCellChange(row.id, 'name', e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                          placeholder="e.g. Marcus Vance"
                          className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-white font-bold rounded-lg px-2.5 py-1.5 focus:outline-none transition"
                        />
                      </td>

                      {/* Primary Rank */}
                      <td className="py-1 px-2">
                        <select
                          value={row.rank}
                          onChange={(e) => handleCellChange(row.id, 'rank', e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                          className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-200 font-medium rounded-lg px-2.5 py-1.5 focus:outline-none transition cursor-pointer"
                        >
                          {activeRanks.map(r => (
                            <option key={r.id} value={r.id} className="bg-zinc-900 text-white">
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Kobudo Sai Rank */}
                      {selectedProgram === 'kobudo' && (
                        <td className="py-1 px-2">
                          <select
                            value={row.secondaryRank || 'k_white'}
                            onChange={(e) => handleCellChange(row.id, 'secondaryRank', e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                            className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-200 font-medium rounded-lg px-2.5 py-1.5 focus:outline-none transition cursor-pointer"
                          >
                            {KOBUDO_RANKS.map(r => (
                              <option key={r.id} value={r.id} className="bg-zinc-900 text-white">
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* Kobudo Weapon Preference */}
                      {selectedProgram === 'kobudo' && (
                        <td className="py-1 px-2">
                          <select
                            value={row.weapons || 'Both'}
                            onChange={(e) => handleCellChange(row.id, 'weapons', e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                            className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-200 font-medium rounded-lg px-2 py-1.5 focus:outline-none transition cursor-pointer"
                          >
                            <option value="Both">Both</option>
                            <option value="Bo">Bo</option>
                            <option value="Sai">Sai</option>
                          </select>
                        </td>
                      )}

                      {/* Belt Size (for non-kobudo) */}
                      {selectedProgram !== 'kobudo' && (
                        <td className="py-1 px-2">
                          <select
                            value={row.beltSize || '0'}
                            onChange={(e) => handleCellChange(row.id, 'beltSize', e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                            className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-200 font-mono font-bold rounded-lg px-2 py-1.5 focus:outline-none transition cursor-pointer"
                          >
                            {['0', '1', '2', '3', '4', '5', '6', '7'].map(num => (
                              <option key={num} value={num}>{num}</option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* Attendance Classes */}
                      <td className="py-1 px-2">
                        <input
                          type="number"
                          min="0"
                          value={row.attendance}
                          onChange={(e) => handleCellChange(row.id, 'attendance', e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                          className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-100 font-mono font-bold rounded-lg px-2.5 py-1.5 focus:outline-none transition text-center"
                        />
                      </td>

                      {/* Schedule (Day & Time) */}
                      {targetLocation !== 'YMCA' && (
                        <>
                          <td className="py-1 px-2">
                            <select
                              value={row.scheduleDay || 'Monday'}
                              onChange={(e) => handleCellChange(row.id, 'scheduleDay', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                              className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-200 rounded-lg px-2 py-1.5 focus:outline-none transition cursor-pointer"
                            >
                              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                <option key={day} value={day}>{day}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 px-2">
                            <input
                              type="text"
                              value={row.scheduleTime || '5:30 PM'}
                              onChange={(e) => handleCellChange(row.id, 'scheduleTime', e.target.value)}
                              onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                              placeholder="5:30 PM"
                              className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-200 rounded-lg px-2 py-1.5 focus:outline-none transition"
                            />
                          </td>
                        </>
                      )}

                      {/* Birthday */}
                      <td className="py-1 px-2">
                        <input
                          type="text"
                          value={row.birthday || ''}
                          onChange={(e) => handleCellChange(row.id, 'birthday', e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                          placeholder="YYYY-MM-DD"
                          className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-300 font-mono rounded-lg px-2.5 py-1.5 focus:outline-none transition"
                        />
                      </td>

                      {/* Custom Profile Fields */}
                      {programCustomFields.map(f => (
                        <td key={f.id} className="py-1 px-2">
                          <input
                            type="text"
                            value={row.customValues[f.id] || ''}
                            onChange={(e) => handleCellChange(row.id, f.id, e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, index, false)}
                            placeholder={f.label}
                            className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-amber-900/40 focus:border-amber-500 text-amber-200 rounded-lg px-2.5 py-1.5 focus:outline-none transition"
                          />
                        </td>
                      ))}

                      {/* Notes */}
                      <td className="py-1 px-2">
                        <input
                          type="text"
                          value={row.notes || ''}
                          onChange={(e) => handleCellChange(row.id, 'notes', e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, index, true)}
                          placeholder="Optional notes..."
                          className="w-full bg-zinc-900/80 focus:bg-zinc-900 border border-zinc-800 focus:border-red-600 text-zinc-300 rounded-lg px-2.5 py-1.5 focus:outline-none transition"
                        />
                      </td>

                      {/* Delete Row Action */}
                      <td className="py-1 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1.5 text-zinc-600 hover:text-red-400 rounded transition cursor-pointer"
                          title="Delete row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Quick Row Modifiers */}
          <div className="flex items-center justify-between mt-3 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddRow}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-red-500" />
                <span>Add Row</span>
              </button>
              <button
                type="button"
                onClick={handleAddFiveRows}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg font-bold transition cursor-pointer"
              >
                +5 Rows
              </button>
              <button
                type="button"
                onClick={handleClearRows}
                className="px-3 py-1.5 text-zinc-500 hover:text-red-400 rounded-lg transition cursor-pointer"
              >
                Clear Empty
              </button>
            </div>

            <span className="text-zinc-400 font-mono text-[11px]">
              <strong className="text-white">{validRows.length}</strong> student(s) ready to add to <strong className="text-red-400">{targetLocation}</strong>
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800 flex items-center justify-between gap-4 bg-zinc-900/60">
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <Info className="w-4 h-4 text-zinc-500" />
            <span>Tip: Hit <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 font-mono text-[10px]">Enter</kbd> to jump down or <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 font-mono text-[10px]">Tab</kbd> between cells.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting || validRows.length === 0}
              onClick={handleSubmitAll}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-red-950/50 flex items-center gap-2 active:scale-95"
            >
              <span>Add {validRows.length} Student{validRows.length === 1 ? '' : 's'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
