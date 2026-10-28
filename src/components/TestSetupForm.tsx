import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { getNextRank, checkEligibility, getGroupLabel, getTestTime, getStudentRankId, getProgramOverride } from '../constants';
import { DojoLogo } from './DojoLogo';
import { Printer, Calendar, ShieldAlert, Check, Square, CheckSquare, RefreshCw, Layers } from 'lucide-react';
import { formatDateForDateInput, formatDateForDisplay } from '../dateHelpers';

interface TestSetupFormProps {
  students: Student[];
  onUpdateStudent: (student: Student) => void;
  testDate: string;
  onTestDateChange: (date: string) => void;
  classesBuffer?: number;
  testingLock?: { date: string; month: string; studentIds: string[] } | null;
  onUpdateTestingLock?: (lock: { date: string; month: string; studentIds: string[] } | null) => void;
}

const getMonthName = (dateStr: string) => {
  if (!dateStr) return new Date().toLocaleString('en-US', { month: 'long' });
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const lower = dateStr.toLowerCase();
  for (const m of months) {
    if (lower.includes(m)) {
      return m.charAt(0).toUpperCase() + m.slice(1);
    }
  }
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-US', { month: 'long' });
    }
  } catch (e) {}
  return dateStr;
};

const getMonthYearString = (dateStr: string) => {
  if (!dateStr) return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
  } catch (e) {}
  return getMonthName(dateStr);
};

export function TestSetupForm({ students, onUpdateStudent, testDate, onTestDateChange, classesBuffer = 0, testingLock, onUpdateTestingLock }: TestSetupFormProps) {
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  
  const displayDate = formatDateForDisplay(testDate);
  const inputDate = formatDateForDateInput(testDate);

  // Filter students to show ONLY those who are ELIGIBLE to test
  const eligibleCandidates = useMemo(() => {
    const candidates: any[] = [];
    students.forEach(student => {
      student.programs.forEach(prog => {
        const eligibility = checkEligibility(student, prog, classesBuffer);
        const override = getProgramOverride(student, prog);
        const isEligible = override === 'eligible'
          ? true
          : override === 'ineligible'
            ? false
            : testingLock
              ? (testingLock.studentIds.includes(student.id) && eligibility.eligible)
              : eligibility.eligible;

        if (isEligible) {
          const curRank = getStudentRankId(student, prog);
          const targetRank = getNextRank(prog, curRank);
          if (targetRank) {
            const groupLabel = getGroupLabel(prog, curRank);
            const testTime = getTestTime(prog, curRank);
            candidates.push({
              ...student,
              activeProgram: prog,
              isEligible: true,
              targetRank,
              // Group by specific type (Program + Category) AND Test Time
              testSession: `${groupLabel} at ${testTime}`
            });
          }
        }
      });
    });
    return candidates;
  }, [students, classesBuffer, testingLock]);

  // Get unique sessions based on time
  const sessions = useMemo(() => {
    const times = new Set<string>();
    eligibleCandidates.forEach(c => times.add(c.testSession));
    return Array.from(times).sort();
  }, [eligibleCandidates]);

  // Group filter
  const filteredCandidates = useMemo(() => {
    const list = !selectedTime && sessions.length > 0 ? eligibleCandidates.filter(s => s.testSession === sessions[0]) : eligibleCandidates.filter(s => s.testSession === selectedTime);
    return list.sort((a, b) => (a.targetRank.order || 0) - (b.targetRank.order || 0));
  }, [eligibleCandidates, selectedTime, sessions]);

  // Fast toggles for card checklists
  const toggleStudentField = (
    studentId: string, 
    field: 'cardFormCollected' | 'stickerPlaced' | 'testingFeePaid',
    program?: string
  ) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let updated: Student;
    if (field === 'testingFeePaid' && program) {
      const currentPaidMap = student.testingFeePaidByProgram || {};
      const nextPaidState = !(currentPaidMap[program] ?? student.testingFeePaid ?? false);
      updated = {
        ...student,
        testingFeePaid: nextPaidState, // sync legacy field as fallback
        testingFeePaidByProgram: {
          ...currentPaidMap,
          [program]: nextPaidState
        }
      };
    } else {
      updated = {
        ...student,
        [field]: !student[field]
      };
    }
    onUpdateStudent(updated);
  };

  // Helper to decide if Terms/History is required (Int 8th Kyu and above)
  const isTermsRequired = (targetRankId: string) => {
    const nonTermsIds = ['white', 't_white', 't_red', 't_orange', 't_yellow', 't_purple', 't_blue', 't_green', 't_brown', 't_black', 'kyu9', 'k_kyu9', 'k_white'];
    return !nonTermsIds.includes(targetRankId);
  };

  const [printAll, setPrintAll] = useState(false);
  
  const triggerPrint = (all: boolean = false) => {
    setPrintAll(all);
    window.focus();
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const renderSheet = (sessionCandidates: any[], sessionName: string, pageNum = 1, totalPages = 1) => {
    const displaySessionName = totalPages > 1 
      ? `${sessionName} (Page ${pageNum} of ${totalPages})` 
      : sessionName;

    return (
      <div 
        key={`${sessionName}-p${pageNum}`}
        className={`bg-white text-black p-8 rounded-lg shadow-2xl origin-top transition duration-150 w-full mb-8 print:mb-0 print-sheet-landscape`}
        style={{
          width: '11.0in',
          height: '8.5in',
          padding: '0.4in 0.5in',
          boxSizing: 'border-box',
        }}
      >
        {/* Header row from original sheet */}
        <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-4">
            <DojoLogo size={70} />
            <div>
              <h1 className="text-3xl font-black uppercase text-[#ef4444] tracking-wider leading-none m-0 p-0 font-sans">
                BUCKNER MARTIAL ARTS
              </h1>
              <h2 className="text-xl font-extrabold tracking-widest text-zinc-800 uppercase mt-1 leading-none font-sans">
                Test Setup Form
              </h2>
            </div>
          </div>

          {/* Date and Test blanks */}
          <div className="flex flex-col gap-2 min-w-[320px] text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-900 uppercase">Date:</span>
              <span className="border-b border-black flex-1 font-mono font-black text-sm text-black pb-0.5 select-text">
                {displayDate || '_______________________'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-900 uppercase font-bold">Test:</span>
              <span className="border-b border-black flex-1 font-sans font-black text-xs text-zinc-800 pb-0.5 select-text">
                {displaySessionName || '_______________________'}
              </span>
            </div>
          </div>
        </div>

      <table className="w-full border-collapse border border-black font-sans text-xs">
        <thead>
          <tr className="bg-[#bfdbfe] border-b border-black font-extrabold uppercase text-center text-zinc-900 text-[10.5px]">
            <th className="border border-black px-3 py-2.5 text-center w-[28%] font-black font-sans">Student Name</th>
            <th className="border border-black px-2 py-2.5 w-[18%] font-black font-sans">Tested Rank</th>
            <th className="border border-black px-2 py-2.5 w-[8%] font-black font-sans">Size</th>
            <th className="border border-black px-2 py-2.5 w-[10%] font-black font-sans">Paid</th>
            <th className="border border-black px-2 py-2.5 w-[12%] font-black font-sans">Terms/History</th>
            <th className="border border-black px-2 py-2.5 w-[8%] font-black font-sans">Sticker</th>
            <th className="border border-black px-2 py-2.5 w-[8%] font-black font-sans">Card</th>
            <th className="border border-black px-2 py-2.5 w-[8%] font-black font-sans">READY</th>
          </tr>
        </thead>
        <tbody>
          {sessionCandidates.map((candidate) => {
            const nextBelt = candidate.targetRank;

            return (
              <tr key={`${sessionName}-p${pageNum}-${candidate.id}-${candidate.activeProgram}`} className="h-9 border-b border-black font-sans text-zinc-950 font-bold text-center">
                <td className="border border-black px-3 py-1 text-center font-black text-sm font-sans">
                  {candidate.name}
                </td>
                <td className="border border-black px-2 py-1 text-xs text-left">
                  <div className="flex items-center gap-1.5">
                    <div 
                      className="relative w-4 h-2 rounded border border-gray-400 shrink-0 overflow-hidden" 
                      style={{ 
                        background: nextBelt?.color && nextBelt.color.includes('linear-gradient') ? undefined : (nextBelt?.color || '#f4f4f5'),
                        backgroundImage: nextBelt?.color && nextBelt.color.includes('linear-gradient') ? nextBelt.color : undefined 
                      }} 
                    >
                      {nextBelt?.stripe && nextBelt.stripe.style === 'horizontal' && (
                        <div 
                          className="absolute inset-x-0 h-px"
                          style={{ 
                            backgroundColor: nextBelt.stripe.color,
                            top: 'calc(50% - 0.5px)'
                          }} 
                        />
                      )}
                    </div>
                    <span className="font-sans text-[11px] font-bold text-zinc-950 truncate">{nextBelt?.name || 'White Belt'}</span>
                  </div>
                </td>
                <td className="border border-black px-2 py-1 text-sm font-mono text-center">
                  {candidate.activeProgram === 'tots' ? '0' : (candidate.beltSize || '0')}
                </td>
                <td className="border border-black px-2 py-1 text-center">
                  <div className="flex items-center justify-center">
                    <button onClick={() => toggleStudentField(candidate.id, 'testingFeePaid', candidate.activeProgram)} className="p-1 hover:bg-gray-150 rounded transition print:hidden">
                      {(candidate.testingFeePaidByProgram?.[candidate.activeProgram] ?? candidate.testingFeePaid) ? <CheckSquare className="w-5 h-5 text-green-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                    </button>
                    <span className="hidden print:inline-block text-xs font-sans">{(candidate.testingFeePaidByProgram?.[candidate.activeProgram] ?? candidate.testingFeePaid) ? 'YES' : ''}</span>
                  </div>
                </td>
                <td className="border border-black px-2 py-1 text-center text-[10px] uppercase font-black font-sans">
                  {/* Empty for manual sign-off / terms/history notes */}
                </td>
                <td className="border border-black px-2 py-1 text-center">
                  <div className="flex items-center justify-center">
                    <button onClick={() => toggleStudentField(candidate.id, 'stickerPlaced')} className="p-1 hover:bg-gray-150 rounded transition print:hidden">
                      {candidate.stickerPlaced ? <CheckSquare className="w-5 h-5 text-green-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                    </button>
                    <span className="hidden print:inline-block text-xs font-sans">{candidate.stickerPlaced ? 'YES' : ''}</span>
                  </div>
                </td>
                <td className="border border-black px-2 py-1 text-center">
                  <div className="flex items-center justify-center">
                    <button onClick={() => toggleStudentField(candidate.id, 'cardFormCollected')} className="p-1 hover:bg-gray-150 rounded transition print:hidden">
                      {candidate.cardFormCollected ? <CheckSquare className="w-5 h-5 text-green-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                    </button>
                    <span className="hidden print:inline-block text-xs font-sans">{candidate.cardFormCollected ? 'YES' : ''}</span>
                  </div>
                </td>
                <td className="border border-black px-2 py-1 text-center">
                  {/* Always blank */}
                </td>
              </tr>
            );
          })}
          {/* Fill space */}
          {Array.from({ length: Math.max(0, 15 - sessionCandidates.length) }).map((_, i) => (
            <tr key={`filler-${sessionName}-p${pageNum}-${i}`} className="h-9 border-b border-black">
              <td className="border border-black px-3 py-1"></td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1"></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

  return (
    <div className="space-y-6">
      
      {/* Configuration Header (Print Hidden) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg print:hidden space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-bold text-zinc-100 uppercase tracking-tight">Test Setup</h3>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  if (testingLock) {
                    setShowUnlockConfirm(true);
                  } else {
                    const currentMonthStr = getMonthYearString(testDate);
                    const idsToLock = Array.from(new Set(eligibleCandidates.map(c => c.id)));
                    onUpdateTestingLock?.({
                      date: new Date().toISOString(),
                      month: currentMonthStr,
                      studentIds: idsToLock
                    });
                  }
                }}
                className={`w-full md:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-black text-[10px] sm:text-xs tracking-wider transition shadow-xl cursor-pointer font-sans uppercase active:scale-95 ${
                  testingLock 
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 shadow-zinc-900/40' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40'
                }`}
              >
                {testingLock ? `Locked: ${testingLock.month}` : `Lock ${getMonthName(testDate)} List`}
              </button>
              <button
                onClick={() => triggerPrint(false)}
                className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] sm:text-xs tracking-wider sm:tracking-widest transition shadow-xl shadow-red-900/40 cursor-pointer font-sans uppercase active:scale-95"
              >
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Print Current</span>
              </button>
              <button
                onClick={() => triggerPrint(true)}
                className="w-full md:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] sm:text-xs tracking-wider sm:tracking-widest transition shadow-xl shadow-red-900/40 cursor-pointer font-sans uppercase active:scale-95"
              >
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Print All</span>
              </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Test Date (Edit on Roster)</label>
            <input 
              type="date" 
              value={inputDate}
              disabled
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-100 font-sans uppercase font-black cursor-not-allowed select-none focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">View Session (by Time)</label>
            <select
              value={selectedTime || (sessions.length > 0 ? sessions[0] : '')}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-100 font-sans focus:outline-none focus:border-red-600 uppercase font-black"
            >
              {sessions.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Informative tips */}
        <div className="p-3 bg-red-950/20 border border-red-900/20 rounded-lg text-xs text-zinc-400 flex items-start gap-2 select-none">
          <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p>
            This dashboard displays **only students eligible for testing**. Quick toggles permit tracking which students have submitted their testing cards, resolved fees, completed history essays, and had their belt labels printed/fastened.
          </p>
        </div>
      </div>

      {/* PAPER CONTAINER DRAW BLOCK */}
      <div className="w-full overflow-x-auto py-4 select-none bg-zinc-950 shrink-0 print-clean-wrapper">
        <div className="min-w-[11.0in] flex flex-col items-center px-4 print-clean-align">
          {/* Screen-only: Show selected session with pagination support */}
          <div className="print:hidden w-full flex flex-col items-center">
            {(() => {
              const currentSessionName = selectedTime || (sessions.length > 0 ? sessions[0] : 'No Test Session Found');
              const currentCandidates = filteredCandidates;
              const chunkSize = 15;
              const chunks: any[][] = [];
              for (let i = 0; i < currentCandidates.length; i += chunkSize) {
                chunks.push(currentCandidates.slice(i, i + chunkSize));
              }
              if (chunks.length === 0) {
                chunks.push([]);
              }
              return chunks.map((chunk, idx) => 
                renderSheet(chunk, currentSessionName, idx + 1, chunks.length)
              );
            })()}
          </div>

          {/* Print-only: Show sessions based on printAll state with pagination support */}
          <div className="hidden print:block w-full">
            {printAll ? (
              sessions.flatMap(sessionName => {
                const sessionCandidates = eligibleCandidates
                  .filter(s => s.testSession === sessionName)
                  .sort((a, b) => (a.targetRank.order || 0) - (b.targetRank.order || 0));
                
                const chunkSize = 15;
                const chunks: any[][] = [];
                for (let i = 0; i < sessionCandidates.length; i += chunkSize) {
                  chunks.push(sessionCandidates.slice(i, i + chunkSize));
                }
                if (chunks.length === 0) {
                  chunks.push([]);
                }
                return chunks.map((chunk, idx) => 
                  renderSheet(chunk, sessionName, idx + 1, chunks.length)
                );
              })
            ) : (
              (() => {
                const currentSessionName = selectedTime || (sessions.length > 0 ? sessions[0] : 'No Test Session Found');
                const currentCandidates = filteredCandidates;
                const chunkSize = 15;
                const chunks: any[][] = [];
                for (let i = 0; i < currentCandidates.length; i += chunkSize) {
                  chunks.push(currentCandidates.slice(i, i + chunkSize));
                }
                if (chunks.length === 0) {
                  chunks.push([]);
                }
                return chunks.map((chunk, idx) => 
                  renderSheet(chunk, currentSessionName, idx + 1, chunks.length)
                );
              })()
            )}
          </div>
        </div>
      </div>

      {/* Unlock Confirmation Modal */}
      {showUnlockConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 print:hidden animate-in fade-in md:pl-20 duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative m-4">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-950/50 flex items-center justify-center mb-2">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Unlock Testing List?</h3>
              <p className="text-sm text-zinc-400">
                This will unlock the current testing list. Students will be evaluated based on their real-time auto-eligibility again.
                <br /><br />
                <span className="font-bold text-red-400">Warning: This action cannot be undone.</span>
              </p>
              
              <div className="grid grid-cols-2 gap-3 w-full mt-4">
                <button
                  type="button"
                  onClick={() => setShowUnlockConfirm(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors uppercase tracking-wider text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateTestingLock?.(null);
                    setShowUnlockConfirm(false);
                  }}
                  className="px-4 py-2.5 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white transition-colors uppercase tracking-wider text-xs"
                >
                  Unlock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page {
            size: letter landscape;
            margin: 0;
          }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body, html, #root, main {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            display: block !important;
          }
          .print\\:hidden, #header-and-nav, .controls-bar, .dashboard-stats {
            display: none !important;
          }
          .print-clean-wrapper {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            background: transparent !important;
            width: 100% !important;
          }
          .print-clean-align {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            min-width: 0 !important;
            display: block !important;
          }
          .print-clean-align > * {
            margin: 0 !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          .print-sheet-landscape {
            width: 11in !important;
            height: 8.5in !important;
            max-width: 11in !important;
            max-height: 8.5in !important;
            box-sizing: border-box !important;
            padding: 0.4in 0.5in !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            break-inside: avoid !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .print-sheet-landscape:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
