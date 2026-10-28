import React, { useState, useMemo, useEffect } from "react";
import { Student, AveryTemplate } from "../types";
import { AVERY_TEMPLATES, getNextRank, checkEligibility, getStudentRankId, getProgramOverride } from "../constants";
import {
  Printer,
  Settings,
  Info,
  Grid,
  FileText,
  CheckSquare,
  Square,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import QRCode from "qrcode";

const getMonthName = (dateStr: string) => {
  if (!dateStr) return new Date().toLocaleString('en-US', { month: 'long' });
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const lower = dateStr.toLowerCase();
  for (const m of months) {
    if (lower.includes(m)) {
      return m.charAt(0).toUpperCase() + m.slice(1);
    }
  }
  const parts = dateStr.split('-');
  if (parts.length >= 2) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
    const dateObj = new Date(y, m, d);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleString('en-US', { month: 'long' });
    }
  }
  const dateObj = new Date(dateStr);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toLocaleString('en-US', { month: 'long' });
  }
  return new Date().toLocaleString('en-US', { month: 'long' });
};

interface StickerSheetProps {
  students: Student[];
  testDate: string;
  classesBuffer?: number;
  testingLock?: { date: string; month: string; studentIds: string[] } | null;
  onUpdateTestingLock?: (
    lock: { date: string; month: string; studentIds: string[] } | null,
  ) => void;
  onUpdateStudent?: (student: Student) => void;
  onBulkUpdate?: (updatedStudentsList: Student[]) => Promise<void>;
}

export function StickerSheet({
  students,
  testDate,
  classesBuffer = 0,
  testingLock,
  onUpdateTestingLock,
  onUpdateStudent,
  onBulkUpdate,
}: StickerSheetProps) {
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("avery-5160");
  const [startingIndex, setStartingIndex] = useState(0); // 0-based index to start printing from (saves partially used sheets!)
  const [labelType, setLabelType] = useState<"belt" | "qr">("belt");
  const [qrCodeDataUrls, setQrCodeDataUrls] = useState<{ [studentId: string]: string }>({});

  // Generate QR codes for all students offline using qrcode library
  useEffect(() => {
    const generateQRs = async () => {
      const newMap: { [studentId: string]: string } = {};
      for (const s of students) {
        if (s.barcode) {
          try {
            const url = await QRCode.toDataURL(s.barcode, {
              margin: 1,
              width: 150,
              color: {
                dark: "#000000",
                light: "#ffffff",
              },
            });
            newMap[s.id] = url;
          } catch (err) {
            console.error("Failed to generate QR for", s.id, err);
          }
        }
      }
      setQrCodeDataUrls(newMap);
    };
    if (students.length > 0) {
      generateQRs();
    }
  }, [students]);

  // Filter students based on locked testing setup list or show all active students when unlocked
  const lockedStudents = useMemo(() => {
    let list = students.filter((s) => !s.inactive);
    if (testingLock) {
      list = list.filter((s) => testingLock.studentIds.includes(s.id));
    }
    if (labelType === "qr") {
      list = list.filter((s) => s.programs.includes("karate"));
    }
    return list;
  }, [students, testingLock, labelType]);

  // Selected individual stickers tracked as keys of "studentId|program"
  const [selectedStickers, setSelectedStickers] = useState<string[]>([]);

  // Automatically select eligible stickers based on current lock or real-time evaluation
  useEffect(() => {
    const initial: string[] = [];
    students.forEach((s) => {
      if (labelType === "qr" && !s.programs.includes("karate")) {
        return;
      }
      const isCandidate = testingLock ? testingLock.studentIds.includes(s.id) : !s.inactive;
      if (isCandidate) {
        s.programs.forEach((prog) => {
          const eligibility = checkEligibility(s, prog, classesBuffer);
          const override = getProgramOverride(s, prog);
          const isElig = override === 'eligible'
            ? true
            : override === 'ineligible'
              ? false
              : testingLock
                ? (testingLock.studentIds.includes(s.id) && eligibility.eligible)
                : eligibility.eligible;
          if (isElig) {
            initial.push(`${s.id}|${prog}`);
          }
        });
      }
    });
    setSelectedStickers(initial);
  }, [students, testingLock, classesBuffer, labelType]);

  // Custom template overrides
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [showBeltBar, setShowBeltBar] = useState(false); // Default to false for B&W print compatibility
  const [showOutline, setShowOutline] = useState(true);
  const [customTitle, setCustomTitle] = useState("Buckner Martial Arts");

  const [filterProgram, setFilterProgram] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterEligibility, setFilterEligibility] = useState<string>("all");
  const [filterSchedule, setFilterSchedule] = useState<string>("all");

  // Reset program filter when in QR mode since QR code is only for Karate
  useEffect(() => {
    if (labelType === "qr") {
      setFilterProgram("all");
    }
  }, [labelType]);

  // Compile list of unique active schedules dynamically across currently displayed students (locked or all active)
  const availableClasses = useMemo(() => {
    const classesMap = new Map<string, { day: string; time: string; studentIds: Set<string> }>();
    
    lockedStudents.forEach((s) => {
      // Class 1
      if (s.scheduleDay1 && s.scheduleTime1) {
        const key = `${s.scheduleDay1} - ${s.scheduleTime1}`;
        if (!classesMap.has(key)) {
          classesMap.set(key, { day: s.scheduleDay1, time: s.scheduleTime1, studentIds: new Set() });
        }
        classesMap.get(key)!.studentIds.add(s.id);
      }
      
      // Class 2
      if (s.scheduleDay2 && s.scheduleTime2) {
        const key = `${s.scheduleDay2} - ${s.scheduleTime2}`;
        if (!classesMap.has(key)) {
          classesMap.set(key, { day: s.scheduleDay2, time: s.scheduleTime2, studentIds: new Set() });
        }
        classesMap.get(key)!.studentIds.add(s.id);
      }
      
      // Kobudo Saturday 9:00 AM automatically
      if (s.programs?.includes("kobudo")) {
        const key = "Saturday - 9:00 AM";
        if (!classesMap.has(key)) {
          classesMap.set(key, { day: "Saturday", time: "9:00 AM", studentIds: new Set() });
        }
        classesMap.get(key)!.studentIds.add(s.id);
      }
    });
    
    const dayOrder: { [key: string]: number } = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };
    
    const getTimeVal = (t: string) => {
      const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return 0;
      let hrs = parseInt(match[1]);
      const mins = parseInt(match[2]);
      const pm = match[3].toUpperCase() === "PM";
      if (pm && hrs !== 12) hrs += 12;
      if (!pm && hrs === 12) hrs = 0;
      return hrs * 60 + mins;
    };
    
    return Array.from(classesMap.values()).sort((a, b) => {
      const dayDiff = (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99);
      if (dayDiff !== 0) return dayDiff;
      return getTimeVal(a.time) - getTimeVal(b.time);
    });
  }, [lockedStudents]);

  const allStickerItems = useMemo(() => {
    const list: { student: Student; program: "karate" | "tots" | "kobudo"; id: string; key: string }[] = [];
    lockedStudents.forEach((student) => {
      student.programs.forEach((prog) => {
        if (labelType === "qr" && prog !== "karate") return;
        
        list.push({
          student,
          program: prog,
          id: student.id,
          key: `${student.id}|${prog}`
        });
      });
    });
    return list;
  }, [lockedStudents, labelType]);

  const filteredStickerItems = useMemo(() => {
    return allStickerItems.filter((item) => {
      const { student, program } = item;

      // 1. Program Type Filter (only in belt mode or if not hidden)
      if (labelType === "belt" && filterProgram !== "all") {
        if (program !== filterProgram) return false;
      }

      // 2. Location Filter
      if (filterLocation !== "all") {
        if (student.location !== filterLocation) return false;
      }

      // 3. Eligibility Filter
      if (filterEligibility !== "all") {
        const eligibility = checkEligibility(student, program, classesBuffer);
        const override = getProgramOverride(student, program);
        let isElig = override === "eligible"
          ? true
          : override === "ineligible"
            ? false
            : testingLock
              ? (testingLock.studentIds.includes(student.id) && eligibility.eligible)
              : eligibility.eligible;
        if (student.passedStickerPending) {
          isElig = true;
        }

        if (filterEligibility === "eligible" && !isElig) return false;
        if (filterEligibility === "ineligible" && isElig) return false;
      }

      // 4. Schedule Filter
      if (filterSchedule !== "all") {
        const class1Key = student.scheduleDay1 && student.scheduleTime1 ? `${student.scheduleDay1} - ${student.scheduleTime1}` : "";
        const class2Key = student.scheduleDay2 && student.scheduleTime2 ? `${student.scheduleDay2} - ${student.scheduleTime2}` : "";
        const kobudoKey = program === "kobudo" ? "Saturday - 9:00 AM" : "";
        if (
          class1Key !== filterSchedule &&
          class2Key !== filterSchedule &&
          kobudoKey !== filterSchedule
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allStickerItems, labelType, filterProgram, filterLocation, filterEligibility, filterSchedule, testingLock, classesBuffer]);

  // Reset selected schedule filter if it is no longer available
  useEffect(() => {
    if (filterSchedule !== "all" && !availableClasses.some((c) => `${c.day} - ${c.time}` === filterSchedule)) {
      setFilterSchedule("all");
    }
  }, [availableClasses, filterSchedule]);

  // Load selected template
  const currentTemplate = useMemo(() => {
    const t = AVERY_TEMPLATES.find((x) => x.id === selectedTemplateId);
    return t || AVERY_TEMPLATES[0];
  }, [selectedTemplateId]);

  // Fine-tuning settings in state, initialized when template changes
  const [marginTop, setMarginTop] = useState(currentTemplate.marginTop);
  const [marginLeft, setLeftMargin] = useState(currentTemplate.marginLeft);
  const [columnGap, setColumnGap] = useState(currentTemplate.columnGap);
  const [rowGap, setRowGap] = useState(currentTemplate.rowGap);
  const [labelWidth, setLabelWidth] = useState(currentTemplate.width);
  const [labelHeight, setLabelHeight] = useState(currentTemplate.height);

  // Sync state if template selection changes
  React.useEffect(() => {
    setMarginTop(currentTemplate.marginTop);
    setLeftMargin(currentTemplate.marginLeft);
    setColumnGap(currentTemplate.columnGap);
    setRowGap(currentTemplate.rowGap);
    setLabelWidth(currentTemplate.width);
    setLabelHeight(currentTemplate.height);
  }, [currentTemplate]);

  const maxLabels = currentTemplate.columns * currentTemplate.rows;

  // Toggle individual sticker
  const toggleSticker = (studentId: string, program: string) => {
    const key = `${studentId}|${program}`;
    setSelectedStickers((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  };

  const selectAll = () => {
    setSelectedStickers((prev) => {
      const next = [...prev];
      filteredStickerItems.forEach((item) => {
        if (!next.includes(item.key)) {
          next.push(item.key);
        }
      });
      return next;
    });
  };

  const selectNone = () => {
    setSelectedStickers((prev) => {
      const filteredKeys = new Set(filteredStickerItems.map(item => item.key));
      return prev.filter((key) => !filteredKeys.has(key));
    });
  };

  const selectEligible = () => {
    setSelectedStickers((prev) => {
      const filteredKeys = new Set(filteredStickerItems.map(item => item.key));
      const base = prev.filter((key) => !filteredKeys.has(key));

      filteredStickerItems.forEach((item) => {
        const { student, program } = item;
        const eligibility = checkEligibility(student, program, classesBuffer);
        const override = getProgramOverride(student, program);
        let isElig = override === "eligible"
          ? true
          : override === "ineligible"
            ? false
            : testingLock
              ? (testingLock.studentIds.includes(student.id) && eligibility.eligible)
              : eligibility.eligible;
        if (student.passedStickerPending) {
          isElig = true;
        }
        if (isElig) {
          base.push(item.key);
        }
      });
      return base;
    });
  };

  const selectUnprinted = () => {
    setSelectedStickers((prev) => {
      const filteredKeys = new Set(filteredStickerItems.map(item => item.key));
      const base = prev.filter((key) => !filteredKeys.has(key));

      filteredStickerItems.forEach((item) => {
        const { student } = item;
        const isUnprinted = student.barcodePrinted === false || student.barcodePrinted === undefined;
        if (isUnprinted) {
          base.push(item.key);
        }
      });
      return base;
    });
  };

  const handleMarkAsPrinted = async () => {
    if (!onBulkUpdate) return;
    
    const selectedStudentIds = new Set<string>();
    selectedStickers.forEach((key) => {
      const [studentId] = key.split("|");
      selectedStudentIds.add(studentId);
    });

    const studentsToUpdate: Student[] = [];
    students.forEach((s) => {
      if (selectedStudentIds.has(s.id)) {
        if (labelType === "qr") {
          studentsToUpdate.push({
            ...s,
            barcodePrinted: true,
            barcodePrintedCount: (s.barcodePrintedCount || 0) + 1,
          });
        } else {
          studentsToUpdate.push({
            ...s,
            passedStickerPending: false,
            stickerPlaced: true,
          });
        }
      }
    });

    if (studentsToUpdate.length > 0) {
      await onBulkUpdate(studentsToUpdate);
      // Clear the printed queue
      setSelectedStickers((prev) => {
        return prev.filter((key) => {
          const [studentId] = key.split("|");
          return !selectedStudentIds.has(studentId);
        });
      });
    }
  };

  // Build sequential list of students to print
  const printItems = useMemo(() => {
    const items: ({ student: Student; program: string } | null)[] = [];

    // Fill up starting blank labels (skips partially used sheet labels)
    for (let i = 0; i < startingIndex; i++) {
      items.push(null);
    }

    // Sort students by name for organized printing
    const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));

    // Add selected stickers if they are selected
    sortedStudents.forEach((student) => {
      student.programs.forEach((prog) => {
        const key = `${student.id}|${prog}`;
        if (selectedStickers.includes(key)) {
          items.push({ student, program: prog });
        }
      });
    });

    return items;
  }, [students, selectedStickers, startingIndex]);

  // Handle standard print trigger
  const triggerPrint = () => {
    window.focus();
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Controller (Hidden on Print) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg print:hidden">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row border-b border-zinc-800 pb-4 mb-4 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-red-500" />
            <h3 className="text-base sm:text-lg font-bold text-zinc-100 uppercase tracking-tight">
              Labels Configurator
            </h3>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
            {labelType === "belt" && (
              testingLock ? (
                <button
                  type="button"
                  onClick={() => setShowUnlockConfirm(true)}
                  className="flex items-center gap-1.5 px-4 py-2 sm:py-2.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold text-xs uppercase cursor-pointer active:scale-95 transition hover:bg-zinc-700 hover:text-zinc-200"
                >
                  Finalized for {getMonthName(testDate)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (onUpdateTestingLock) {
                      const eligibleIds: string[] = [];
                      students.forEach((student) => {
                        student.programs.forEach((prog) => {
                          const eligibility = checkEligibility(student, prog, classesBuffer);
                          const override = getProgramOverride(student, prog);
                          const isElig = override === "eligible" ? true : override === "ineligible" ? false : eligibility.eligible;
                          if (isElig || student.passedStickerPending) {
                            if (!eligibleIds.includes(student.id)) {
                              eligibleIds.push(student.id);
                            }
                          }
                        });
                      });
                      onUpdateTestingLock({
                        date: testDate,
                        month: getMonthName(testDate),
                        studentIds: eligibleIds,
                      });
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 sm:py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase cursor-pointer active:scale-95 transition shadow-lg shadow-indigo-950/40 border border-indigo-500/30"
                >
                  Finalize for {getMonthName(testDate)}
                </button>
              )
            )}
            <button
              onClick={triggerPrint}
              disabled={selectedStickers.length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs tracking-widest transition shadow-xl shadow-red-900/40 disabled:opacity-40 disabled:hover:bg-red-600 cursor-pointer font-sans uppercase active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Label Sheet Settings */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pb-5 border-b border-zinc-800 mb-5 items-end">
          <div className="md:col-span-4">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Label Sheet Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 focus:outline-none focus:border-red-600 text-xs font-mono"
            >
              {AVERY_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              <option value="custom">⚙️ Custom Dimension Layout</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Save Sheet: Start printing at label # (0-based)
            </label>
            <input
              type="number"
              min="0"
              max={maxLabels - 1}
              value={startingIndex}
              onChange={(e) =>
                setStartingIndex(
                  Math.max(
                    0,
                    Math.min(maxLabels - 1, parseInt(e.target.value) || 0),
                  ),
                )
              }
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-100 focus:outline-none focus:border-red-600 text-xs font-mono"
            />
          </div>

          <div className="md:col-span-4 flex items-center justify-between pb-1 gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-300 text-xs font-semibold">
              <input
                type="checkbox"
                checked={showOutline}
                onChange={(e) => setShowOutline(e.target.checked)}
                className="rounded text-red-500 bg-zinc-900 border-zinc-800 accent-red-600 w-4 h-4"
              />
              <span>Grid Helper Bounds</span>
            </label>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer font-bold transition ${
                showAdvanced
                  ? "bg-red-950/40 border-red-900 hover:bg-red-900/40 text-red-400"
                  : "bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Advanced Spacing Tools</span>
            </button>
          </div>
        </div>

        {/* Spacing Calibration Settings Selector (Advanced) */}
        {showAdvanced && (
          <div className="my-5 p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3 animate-in slide-in-from-top-2 duration-150">
            <span className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Sheet Spacing calibration &
              offsets (inches)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">
                  Top Margin
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={marginTop}
                  onChange={(e) =>
                    setMarginTop(parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">
                  Left Margin
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={marginLeft}
                  onChange={(e) =>
                    setLeftMargin(parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">
                  Label Width
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={labelWidth}
                  onChange={(e) =>
                    setLabelWidth(parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">
                  Label Height
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={labelHeight}
                  onChange={(e) =>
                    setLabelHeight(parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">
                  Col Spacing
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={columnGap}
                  onChange={(e) =>
                    setColumnGap(parseFloat(e.target.value) || 0)
                  }
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">
                  Row Spacing
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={rowGap}
                  onChange={(e) => setRowGap(parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 font-mono text-[11px]"
                />
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              If your stickers print slightly off-center, adjust the top/left
              margins in tiny decimals (e.g., set Top to 0.48 or 0.52) to shift
              the layout exactly to match your printer's carriage feed
              characteristics.
            </p>
          </div>
        )}

        {/* Top-level Switcher between Belt Progress and Attendance Codes */}
        <div className="w-full flex bg-zinc-950/80 border border-zinc-800 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => setLabelType("belt")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-lg transition text-center cursor-pointer ${
              labelType === "belt"
                ? "bg-red-600 text-white shadow-lg shadow-red-900/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            }`}
          >
            Belt Progress
          </button>
          <button
            type="button"
            onClick={() => setLabelType("qr")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-lg transition text-center cursor-pointer ${
              labelType === "qr"
                ? "bg-red-600 text-white shadow-lg shadow-red-900/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            }`}
          >
            Attendance Codes
          </button>
        </div>

        {/* 2-Column Selectors */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left panel: student check list */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Stickers to Print ({selectedStickers.length})
              </span>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 gap-2 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800">
              {labelType === "belt" && (
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Program Type
                  </label>
                  <select
                    value={filterProgram}
                    onChange={(e) => setFilterProgram(e.target.value)}
                    className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 text-[11px] focus:outline-none focus:border-red-600 cursor-pointer font-sans"
                  >
                    <option value="all">All Programs</option>
                    <option value="karate">Karate</option>
                    <option value="tots">Tots</option>
                    <option value="kobudo">Kobudo</option>
                  </select>
                </div>
              )}
              
              <div className={labelType === "qr" ? "col-span-2" : ""}>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Location
                </label>
                <select
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 text-[11px] focus:outline-none focus:border-red-600 cursor-pointer font-sans"
                >
                  <option value="all">All Locations</option>
                  <option value="West Chester">West Chester</option>
                  <option value="Monroe">Monroe</option>
                  <option value="YMCA">YMCA</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Eligibility
                </label>
                <select
                  value={filterEligibility}
                  onChange={(e) => setFilterEligibility(e.target.value)}
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 text-[11px] focus:outline-none focus:border-red-600 cursor-pointer font-sans"
                >
                  <option value="all">All Statuses</option>
                  <option value="eligible">Eligible Only</option>
                  <option value="ineligible">Ineligible Only</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Schedule
                </label>
                <select
                  value={filterSchedule}
                  onChange={(e) => setFilterSchedule(e.target.value)}
                  className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 text-[11px] focus:outline-none focus:border-red-600 cursor-pointer font-sans"
                >
                  <option value="all">All Schedules</option>
                  {availableClasses.map((c) => {
                    const key = `${c.day} - ${c.time}`;
                    return (
                      <option key={key} value={key}>
                        {c.day} @ {c.time}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Bulk Selection operations */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800">
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                For Shown ({filteredStickerItems.length}):
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={labelType === "qr" ? selectUnprinted : selectEligible}
                  className="text-[10px] font-bold text-red-400 hover:text-red-300 hover:bg-red-950/20 px-2 py-1 rounded border border-red-900/40 cursor-pointer transition active:scale-95"
                >
                  {labelType === "qr" ? "Unprinted Sticker" : "Only Eligible"}
                </button>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2 py-1 rounded cursor-pointer transition active:scale-95"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2 py-1 rounded cursor-pointer transition active:scale-95"
                >
                  None
                </button>
              </div>
            </div>

            {/* Flat Student - Program Checklist */}
            <div className="max-h-96 overflow-y-auto pr-1 space-y-2 border border-zinc-800 bg-zinc-950 rounded-lg p-3">
              {filteredStickerItems.length === 0 ? (
                <div className="text-zinc-500 text-xs text-center py-10 leading-relaxed font-sans select-none">
                  <Info className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
                  No students match current filters.
                </div>
              ) : (
                filteredStickerItems.map((item) => {
                  const { student, program, key } = item;
                  const isSelected = selectedStickers.includes(key);

                  const eligibility = checkEligibility(student, program, classesBuffer);
                  const override = getProgramOverride(student, program);
                  let isElig = override === "eligible"
                    ? true
                    : override === "ineligible"
                      ? false
                      : testingLock
                        ? (testingLock.studentIds.includes(student.id) && eligibility.eligible)
                        : eligibility.eligible;
                  if (student.passedStickerPending) {
                    isElig = true;
                  }

                  const curRank = getStudentRankId(student, program);
                  const next = getNextRank(program, curRank);

                  return (
                    <div
                      key={key}
                      onClick={() => toggleSticker(student.id, program)}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition select-none ${
                        isSelected
                          ? "bg-zinc-900 border-red-500/35 text-zinc-100"
                          : "bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:bg-zinc-900/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-red-500 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-800 shrink-0" />
                        )}
                        <span className="font-bold text-xs">
                          {student.name} - <span className="uppercase text-[10px] text-zinc-500 font-extrabold">{program}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {labelType === "qr" ? (
                          <>
                            {student.barcodePrinted === false || student.barcodePrinted === undefined ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-950/60 text-amber-400 animate-pulse">
                                Unprinted
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-zinc-900 text-zinc-500">
                                Printed ({student.barcodePrintedCount || 0})
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span
                              className={`text-[9.5px] px-1.5 py-0.5 rounded font-mono font-bold ${isElig ? "bg-green-950/60 text-green-400" : "bg-zinc-900 text-zinc-500"}`}
                            >
                              {next ? next.name : "Max"}
                            </span>
                            {student.passedStickerPending && (
                              <span className="text-[8px] uppercase font-bold text-green-400">
                                (Passed)
                              </span>
                            )}
                            {!isElig && (
                              <span className="text-[8px] uppercase font-bold text-zinc-500">
                                (Ineligible)
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel: label settings */}
          <div className="lg:col-span-7">
            {/* Aesthetic details */}
            {labelType === "belt" && (
              <div className="space-y-3">
                <span className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Aesthetic Details
                </span>

                <div className="space-y-2.5 bg-zinc-950 p-3 border border-zinc-800 rounded-lg text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-300">
                    <input
                      type="checkbox"
                      checked={showLogo}
                      onChange={(e) => setShowLogo(e.target.checked)}
                      className="rounded text-red-500 bg-zinc-900 border-zinc-800 accent-red-600"
                    />
                    <span>Show "Buckner Martial Arts" Custom Title</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-300">
                    <input
                      type="checkbox"
                      checked={showBeltBar}
                      onChange={(e) => setShowBeltBar(e.target.checked)}
                      className="rounded text-red-500 bg-zinc-900 border-zinc-800 accent-red-600"
                    />
                    <span>Show Color Belt Stripe Representation</span>
                  </label>

                  <div className="pt-1.5">
                    <label className="block text-[10px] text-zinc-500 font-semibold mb-1 uppercase">
                      Dojo Branding Text
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-zinc-300 text-[11px] focus:outline-none focus:border-red-650 font-sans"
                    />
                  </div>
                </div>
              </div>
            )}

            {labelType === "qr" && onBulkUpdate && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleMarkAsPrinted}
                  disabled={selectedStickers.length === 0}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-900 text-zinc-300 hover:text-white font-bold text-xs tracking-wider transition disabled:opacity-40 cursor-pointer font-sans uppercase active:scale-95"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-green-500" />
                  <span>Mark Printed</span>
                </button>
                <p className="text-[10px] text-zinc-500 mt-1.5 text-center leading-relaxed">
                  Once printed, click Mark Printed to update attendance barcode counters for selected students!
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* RENDER SHEET FIELD SECTION (Live Preview & Print Layout) */}
      <div className="w-full overflow-x-auto py-4 select-none shrink-0 bg-zinc-950 print-clean-wrapper">
        <div className="min-w-[8.5in] flex justify-center py-2 print-clean-align">
          {/* Printable Canvas */}
          <div
            id="printable-sticker-sheet"
            className="flex flex-col gap-8 print:gap-0 print:block"
          >
            {selectedStickers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 text-zinc-400 print:hidden text-center select-none bg-white rounded-lg p-4 w-[8.5in] min-h-[5in]">
                <FileText className="w-12 h-12 text-zinc-300 mb-2" />
                <p className="font-semibold text-zinc-500">
                  Empty Sticker Queue
                </p>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                  Select students in the checklists above to build sticker
                  alignments.
                </p>
              </div>
            ) : (
              (() => {
                const printChunks = [];
                for (let i = 0; i < printItems.length; i += maxLabels) {
                  printChunks.push(printItems.slice(i, i + maxLabels));
                }
                return printChunks.map((chunk, pageIdx) => (
                  <div
                    key={`page-${pageIdx}`}
                    className={`bg-white rounded-lg shadow-2xl p-4 origin-top transition transition-all scrollbar-thin printable-sticker-page relative ${
                      showOutline ? "border border-zinc-300" : ""
                    }`}
                    style={{
                      width: "8.5in", // Always Letter sheet width
                      height: "11.0in", // Always Letter sheet height
                      paddingTop: `${marginTop}in`,
                      paddingLeft: `${marginLeft}in`,
                      boxSizing: "border-box",
                    }}
                  >
                    {/* Visual Page Indicator for screen */}
                    <span className="absolute bottom-2 right-4 text-[9px] font-black text-zinc-300 uppercase tracking-widest print:hidden select-none font-sans">
                      Page {pageIdx + 1} of {printChunks.length}
                    </span>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${currentTemplate.columns}, ${labelWidth}in)`,
                        columnGap: `${columnGap}in`,
                        rowGap: `${rowGap}in`,
                        width: "100%",
                      }}
                    >
                      {chunk.map((item, stickerIdx) => {
                        if (item === null) {
                          // Render empty label space to offset starting index
                          return (
                            <div
                              key={`empty-${pageIdx}-${stickerIdx}`}
                              style={{
                                width: `${labelWidth}in`,
                                height: `${labelHeight}in`,
                                visibility: "hidden",
                              }}
                            />
                          );
                        }

                        const { student, program } = item;
                        const progType = program as
                          | "karate"
                          | "tots"
                          | "kobudo";
                        const curRank = getStudentRankId(student, progType);
                        const targetRank = getNextRank(
                          progType,
                          curRank,
                        );
                        const beltColorSpec = targetRank?.color || "#eee";
                        const isBeltGradient =
                          beltColorSpec.includes("linear-gradient");

                        if (labelType === "qr") {
                          const qrUrl = qrCodeDataUrls[student.id];
                          const schedule = [];
                          if (student.scheduleDay1) {
                            schedule.push(
                              `${student.scheduleDay1} ${student.scheduleTime1 || ""}`.trim(),
                            );
                          }
                          if (student.scheduleDay2) {
                            schedule.push(
                              `${student.scheduleDay2} ${student.scheduleTime2 || ""}`.trim(),
                            );
                          }
                          return (
                            <div
                              key={`sticker-${student.id}-${program}-${pageIdx}-${stickerIdx}`}
                              className="flex items-center justify-between p-1.5 rounded text-black transition select-none relative overflow-hidden"
                              style={{
                                width: `${labelWidth}in`,
                                height: `${labelHeight}in`,
                                border: showOutline
                                  ? "1px dashed #d1d5db"
                                  : "none",
                                backgroundColor: "#ffffff",
                                boxSizing: "border-box",
                                fontFamily: "Inter, system-ui, sans-serif",
                              }}
                            >
                              {/* QR Code on the left */}
                              <div
                                className="h-full aspect-square flex-none flex items-center justify-center p-0.5"
                                style={{ maxHeight: "100%", maxWidth: "45%" }}
                              >
                                {qrUrl ? (
                                  <img
                                    src={qrUrl}
                                    alt="Student QR Code"
                                    className="h-full w-full object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="text-[6px] text-zinc-400 font-mono">
                                    QR...
                                  </div>
                                )}
                              </div>

                              {/* Student info on the right */}
                              <div className="flex-1 min-w-0 h-full flex flex-col justify-center text-left pl-2 pr-1">
                                <span className="text-[10px] font-extrabold uppercase text-zinc-950 tracking-tight leading-tight block truncate w-full">
                                  {student.name}
                                </span>
                                {schedule.length > 0 ? (
                                  <div className="mt-1 flex flex-col gap-0.5">
                                    {schedule.map((sch, sIdx) => (
                                      <span
                                        key={sIdx}
                                        className="text-[7.5px] text-zinc-700 font-medium leading-none truncate block w-full"
                                      >
                                        • {sch}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-[7px] text-zinc-500 font-bold uppercase mt-1 leading-none">
                                    No schedule
                                  </span>
                                )}
                                <span className="text-[6.5px] text-zinc-400 font-mono mt-1 font-semibold select-all block truncate">
                                  {student.barcode}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={`sticker-${student.id}-${program}-${pageIdx}-${stickerIdx}`}
                            className={`flex flex-col items-center justify-between p-2 rounded text-black transition select-none text-center relative overflow-hidden`}
                            style={{
                              width: `${labelWidth}in`,
                              height: `${labelHeight}in`,
                              border: showOutline
                                ? "1px dashed #d1d5db"
                                : "none",
                              backgroundColor: "#ffffff",
                              boxSizing: "border-box",
                              fontFamily: "Inter, system-ui, sans-serif",
                            }}
                          >
                            {/* Belt Size Corner Indicator */}
                            <div className="absolute top-1 right-1 text-[9px] font-black font-mono text-zinc-400 select-none print:text-zinc-950">
                              {student.beltSize || ""}
                            </div>

                            {/* Tiny header */}
                            {showLogo && (
                              <span className="text-[7.5px] uppercase tracking-widest text-[#ef4444] font-extrabold select-none h-3 whitespace-nowrap block truncate max-w-[95%]">
                                {customTitle}
                              </span>
                            )}

                            {/* Student Name & Promotes To */}
                            <div className="flex-1 flex flex-col items-center justify-center min-h-[45%] max-w-[95%] gap-0.5">
                              <span className="text-[12px] font-black uppercase text-zinc-950 tracking-tight leading-tight block w-full truncate">
                                {student.name}
                              </span>
                              {targetRank && (
                                <div className="flex flex-col items-center mt-0.5 w-full">
                                  <span className="text-[7px] text-zinc-500 font-extrabold tracking-wider uppercase leading-none mb-0.5">
                                    Promotes to
                                  </span>
                                  <span className="text-[9.5px] font-black text-zinc-900 tracking-tight leading-tight block w-full whitespace-normal break-words uppercase">
                                    {program} {targetRank.name}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* New Belt Label Details (Stripe visual if enabled) */}
                            {targetRank ? (
                              <div className="w-full flex flex-col items-center gap-1.5 mb-1 select-none">
                                {/* Visual Belt Stripe on the Label (Full Color Rendering) */}
                                {showBeltBar && (
                                  <div
                                    className="w-[85%] h-2.5 rounded border border-black relative flex items-center justify-center overflow-hidden"
                                    style={{
                                      background: isBeltGradient
                                        ? undefined
                                        : beltColorSpec,
                                      backgroundImage: isBeltGradient
                                        ? beltColorSpec
                                        : undefined,
                                    }}
                                  >
                                    {targetRank.stripe &&
                                      targetRank.stripe.style ===
                                        "horizontal" && (
                                        <div
                                          className="absolute inset-x-0 h-0.5 border-y border-black"
                                          style={{
                                            backgroundColor:
                                              targetRank.stripe.color,
                                            top: "calc(50% - 1px)",
                                          }}
                                        />
                                      )}
                                    {/* Short kyu mark */}
                                    <span
                                      className="text-[6.5px] font-black font-mono tracking-tighter relative z-10"
                                      style={{
                                        color:
                                          beltColorSpec === "#f4f4f5" ||
                                          beltColorSpec === "#ffffff"
                                            ? "#000"
                                            : "#fff",
                                        textShadow:
                                          "0 0.5px 1px rgba(0,0,0,0.4)",
                                      }}
                                    >
                                      {targetRank.kyuText || "PRO"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[9px] text-[#22c55e] font-black tracking-tight uppercase mb-2">
                                🌟 Master Belt Level
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()
            )}
          </div>
        </div>
      </div>
      {/* Clear Printed Status Modal */}
      {showUnlockConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 print:hidden animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative m-4">
            <div className="flex flex-col items-center text-center space-y-4 font-sans">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-2">
                <ShieldAlert className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-tight">
                Clear Printed Status?
              </h3>
              <p className="text-sm text-zinc-400">
                This will clear the printed status for this list. The list will
                evaluate based on real-time eligibility again.
                <br />
                <br />
                <span className="font-bold text-amber-500">
                  Note: This action clears the saved lock date.
                </span>
              </p>

              <div className="grid grid-cols-2 gap-3 w-full mt-4">
                <button
                  type="button"
                  onClick={() => setShowUnlockConfirm(false)}
                  className="px-4 py-2.5 rounded-xl font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors uppercase tracking-wider text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateTestingLock?.(null);
                    setShowUnlockConfirm(false);
                  }}
                  className="px-4 py-2.5 rounded-xl font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors uppercase tracking-wider text-xs cursor-pointer"
                >
                  Clear Status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page {
            size: letter portrait;
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
          /* Hide non-print structures */
          .print\\:hidden, #header-and-nav, .dashboard-stats, #main-sidebar, .controls-bar {
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
          /* Maximize the printable card container */
          #printable-sticker-sheet {
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: auto !important;
            background: transparent !important;
          }
          .printable-sticker-page {
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            padding-top: ${marginTop}in !important;
            padding-left: ${marginLeft}in !important;
            width: 8.5in !important;
            height: 11.0in !important;
            background: white !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
          }
          .printable-sticker-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
