import React, { useState, useMemo, useEffect, useRef } from "react";
import { Student } from "../types";
import { Search, X, Check, Users, ShieldAlert, Clock, Keyboard, Undo2, Plus, Calendar, Camera } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

interface AttendanceLog {
  id: string;
  studentId: string;
  studentName: string;
  program: string;
  oldCount: number;
  newCount: number;
  text: string;
}

interface QuickAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onAddAttendance: (student: Student, program: string) => void;
  onSubtractAttendance: (student: Student, program: string) => void;
}

export const QuickAttendanceModal: React.FC<QuickAttendanceModalProps> = ({
  isOpen,
  onClose,
  students,
  onAddAttendance,
  onSubtractAttendance,
}) => {
  const [attendanceMode, setAttendanceMode] = useState<"scanner" | "search" | "class">("scanner");
  const [searchQuery, setSearchQuery] = useState("");
  const [guestQuery, setGuestQuery] = useState("");
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [flashGreen, setFlashGreen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // QR Code camera scanner references and feedback states
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string>("");
  const [scanCooldown, setScanCooldown] = useState(false);

  // Focus input on open in search mode
  useEffect(() => {
    if (isOpen) {
      if (attendanceMode === "search") {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 150);
      }
    } else {
      setSearchQuery("");
      setGuestQuery("");
    }
  }, [isOpen, attendanceMode]);

  // Audio premium chime feedback
  const playChime = (freq: number, dur: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Ignored
    }
  };

  const scanHandlerRef = useRef<(text: string) => void>(() => {});

  // Keep success scan handler completely updated with latest state values without rebuilding camera stream
  useEffect(() => {
    scanHandlerRef.current = (barcodeText: string) => {
      if (scanCooldown && lastScannedBarcode === barcodeText) {
        return;
      }

      const student = students.find((s) => s.barcode === barcodeText);
      if (!student) {
        playChime(250, 0.25);
        return;
      }

      const prog = student.programs[0] || "karate";
      const todayString = new Date().toLocaleDateString("en-CA");
      const hasLoggedToday = student.lastIncrementDateByProgram?.[prog] === todayString;

      if (hasLoggedToday) {
        playChime(370, 0.15);
      } else {
        handleMarkAttendance(student, prog);
        setFlashGreen(true);
        setTimeout(() => {
          setFlashGreen(false);
        }, 1000);
      }

      setLastScannedBarcode(barcodeText);
      setScanCooldown(true);

      setTimeout(() => {
        setScanCooldown(false);
      }, 2000);
    };
  }, [students, scanCooldown, lastScannedBarcode]);

  // Manage html5-qrcode camera initialization and disposal
  useEffect(() => {
    let isMounted = true;
    if (isOpen && attendanceMode === "scanner") {
      setCameraError(null);
      setScannerActive(false);

      const html5QrCode = new Html5Qrcode("qr-reader");
      qrScannerRef.current = html5QrCode;

      const config = { fps: 10 };

      html5QrCode
        .start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (isMounted) {
              scanHandlerRef.current(decodedText);
            }
          },
          () => {
            // Keep scanning
          },
        )
        .then(() => {
          if (isMounted) setScannerActive(true);
        })
        .catch((err) => {
          console.error("Camera access failed:", err);
          if (isMounted) {
            setCameraError(
              "Failed to access the device's camera. Please verify camera permissions in your browser bar.",
            );
            setScannerActive(false);
          }
        });
    }

    return () => {
      isMounted = false;
      if (qrScannerRef.current) {
        const scanner = qrScannerRef.current;
        qrScannerRef.current = null;
        if (scanner.isScanning) {
          scanner
            .stop()
            .then(() => {
              scanner.clear();
            })
            .catch((err) => {
              console.error("Failed to stop scanner stream cleanly:", err);
            });
        }
      }
      setScannerActive(false);
    };
  }, [isOpen, attendanceMode]);

  // Compile list of unique active schedules dynamically across all active students
  const availableClasses = useMemo(() => {
    const classesMap = new Map<string, { day: string; time: string; studentIds: Set<string> }>();
    
    students.forEach((s) => {
      if (s.inactive) return;
      
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
  }, [students]);

  // Pre-select closest or today's classes
  useEffect(() => {
    if (availableClasses.length > 0 && !selectedClassKey) {
      const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const todayDay = daysOfWeek[new Date().getDay()];
      
      const todayClasses = availableClasses.filter(c => c.day === todayDay);
      if (todayClasses.length > 0) {
        setSelectedClassKey(`${todayClasses[0].day} - ${todayClasses[0].time}`);
      } else {
        setSelectedClassKey(`${availableClasses[0].day} - ${availableClasses[0].time}`);
      }
    }
  }, [availableClasses, selectedClassKey]);

  // Get active student schedules matching selected class day/time
  const classStudents = useMemo(() => {
    if (!selectedClassKey) return [];
    const [classDay, classTime] = selectedClassKey.split(" - ");
    if (!classDay || !classTime) return [];
    
    return students
      .filter((s) => {
        if (s.inactive) return false;
        
        // Kobudo Saturday 9:00 AM automatically
        if (classDay === "Saturday" && classTime === "9:00 AM" && s.programs?.includes("kobudo")) {
          return true;
        }
        
        const matchesDay1 = s.scheduleDay1 === classDay && s.scheduleTime1 === classTime;
        const matchesDay2 = s.scheduleDay2 === classDay && s.scheduleTime2 === classTime;
        
        return matchesDay1 || matchesDay2;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, selectedClassKey]);

  // Handle guest or unscheduled visiting students search
  const visitingStudents = useMemo(() => {
    const q = guestQuery.trim().toLowerCase();
    if (!q) return [];
    
    const scheduledIds = new Set(classStudents.map((cs) => cs.id));
    
    return students
      .filter((s) => !s.inactive && !scheduledIds.has(s.id) && s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [students, classStudents, guestQuery]);

  const handleMarkAttendance = (student: Student, prog: string, isGuest: boolean = false) => {
    const todayString = new Date().toLocaleDateString("en-CA");
    if (student.lastIncrementDateByProgram?.[prog] === todayString) {
      return;
    }

    const oldCount = student.attendance?.[prog] || 0;
    const newCount = oldCount + 1;

    onAddAttendance(student, prog);

    const timeString = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const newLog: AttendanceLog = {
      id: crypto.randomUUID(),
      studentId: student.id,
      studentName: student.name,
      program: prog,
      oldCount,
      newCount,
      text: `[${timeString}] ${student.name} — Present for ${prog.toUpperCase()}! (${oldCount} → ${newCount})`,
    };
    
    setLogs((prev) => [newLog, ...prev]);
    playChime(523.25, 0.1); // Premium chime feedback

    if (attendanceMode === "search") {
      setSearchQuery(""); // Clear search to enable sequential lookups
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else if (isGuest) {
      setGuestQuery(""); // Reset query for neat roster visualization
    }
  };

  const handleUndoLog = (log: AttendanceLog) => {
    const targetStudent = students.find((s) => s.id === log.studentId);
    if (targetStudent) {
      onSubtractAttendance(targetStudent, log.program);
      playChime(329.63, 0.15); // Clear descending chime
    }
    setLogs((prev) => prev.filter((item) => item.id !== log.id));
  };

  // Filter students based on search string
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return students
      .filter((s) => !s.inactive && s.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [students, searchQuery]);

  // Search mode instant select logic
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    const query = val.trim().toLowerCase();
    if (query.length >= 2) {
      const matches = students
        .filter((s) => !s.inactive && s.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (matches.length === 1) {
        const targetStudent = matches[0];
        const defaultProg = targetStudent.programs[0] || "karate";
        handleMarkAttendance(targetStudent, defaultProg);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (filteredStudents.length > 0) {
        e.preventDefault();
        const firstStudent = filteredStudents[0];
        const firstProgram = firstStudent.programs[0];
        if (firstProgram) {
          handleMarkAttendance(firstStudent, firstProgram);
        }
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/95 select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Flash Green Overlay */}
      {flashGreen && (
        <div className="fixed inset-0 pointer-events-none z-[9999] bg-green-500/10 shadow-[inset_0_0_60px_rgba(34,197,94,0.7)] animate-in fade-in duration-100" />
      )}
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-black p-3 sm:p-4 border-b border-zinc-800 space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-red-500" />
              <div>
                <h3 className="text-xs sm:text-sm font-black text-zinc-100 uppercase tracking-widest leading-none">
                  Quick Attendance Hub
                </h3>
                <p className="text-[9px] text-zinc-500 uppercase tracking-wide font-black mt-1">
                  Log student attendance instantly in real-time
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer select-none"
            >
              Close
            </button>
          </div>
        </div>

        {/* Modal body contents */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Mode Switcher Segments Toggle */}
          <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 w-full">
            <button
              type="button"
              onClick={() => setAttendanceMode("scanner")}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all duration-155 flex items-center justify-center gap-1.5 cursor-pointer ${
                attendanceMode === "scanner"
                  ? "bg-red-600 text-white shadow-md shadow-red-900/10"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>QR Scanner</span>
            </button>
            <button
              type="button"
              onClick={() => setAttendanceMode("search")}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all duration-155 flex items-center justify-center gap-1.5 cursor-pointer ${
                attendanceMode === "search"
                  ? "bg-red-600 text-white shadow-md shadow-red-900/10"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search name</span>
            </button>
            <button
              type="button"
              onClick={() => setAttendanceMode("class")}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all duration-155 flex items-center justify-center gap-1.5 cursor-pointer ${
                attendanceMode === "class"
                  ? "bg-red-600 text-white shadow-md shadow-red-900/10"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Take by Class</span>
            </button>
          </div>

          {/* Render SCANNER MODE */}
          {attendanceMode === "scanner" && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-155">
              <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 flex flex-col items-center select-none">
                <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5 w-full">
                  <span className="text-red-500 animate-pulse text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-600 inline-block animate-ping"></span>
                    Live Camera QR Scanning Active
                  </span>
                </div>

                <div className="w-full relative bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col items-center justify-center" style={{ minHeight: "260px" }}>
                  <style>{`
                    @keyframes scanLaser {
                      0%, 100% { top: 5%; opacity: 0.2; }
                      50% { top: 95%; opacity: 0.9; }
                    }
                    .qr-laser-line {
                      position: absolute;
                      left: 0;
                      right: 0;
                      height: 2px;
                      background-color: rgb(239, 68, 68);
                      box-shadow: 0 0 8px rgb(239, 68, 68);
                      animation: scanLaser 2.5s ease-in-out infinite;
                    }
                  `}</style>
                  {cameraError ? (
                    <div className="p-6 text-center text-zinc-500 max-w-xs space-y-2">
                      <ShieldAlert className="w-8 h-8 text-red-500 mx-auto animate-pulse" />
                      <p className="text-xs font-black uppercase tracking-widest text-zinc-355">Camera Access Error</p>
                      <p className="text-[10px] text-zinc-500 leading-normal">{cameraError}</p>
                    </div>
                  ) : (
                    <>
                      <div className="relative w-full max-w-[320px] flex items-center justify-center">
                        <div id="qr-reader" className="w-full rounded overflow-hidden [&_video]:max-h-[260px] [&_video]:w-full" />
                        {scannerActive && (
                          <div className="absolute pointer-events-none inset-0 flex items-center justify-center">
                            {/* QR code silhouette overlay */}
                            <div className="relative w-40 h-40 border-2 border-dashed border-red-500/50 rounded-xl flex items-center justify-center bg-red-500/5">
                              {/* Corner brackets to look like a QR code scanner target */}
                              <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-red-500"></div>
                              <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-red-500"></div>
                              <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-red-500"></div>
                              <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-red-500"></div>
                              
                              {/* QR code silhouette stencil */}
                              <svg className="w-20 h-20 text-red-500/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 3h6v6H3V3zM15 3h6v6h-6V3zM3 15h6v6H3v-6z" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M14 14h2v2h-2zm4 0h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zm-4 2h2v2h-2zm4 0h2v2h-2zm-2-2h2v2h-2z" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>

                              {/* Scanning line laser animation */}
                              <div className="qr-laser-line"></div>
                            </div>
                          </div>
                        )}
                      </div>
                      {!scannerActive && (
                        <div className="absolute inset-0 bg-zinc-950/90 flex flex-col items-center justify-center space-y-2">
                          <Clock className="w-6 h-6 text-zinc-700 animate-spin" />
                          <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Initializing Camera...</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <p className="text-[9px] text-zinc-500 text-center leading-relaxed max-w-xs uppercase font-mono">
                  Hold student's QR sticker up to the camera to instantly log attendance
                </p>
              </div>
            </div>
          )}

          {/* Render SEARCH MODE */}
          {attendanceMode === "search" && (
            <>
              <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 flex flex-col select-none animate-in fade-in zoom-in-95 duration-155">
                <div className="flex items-center gap-1.5 border-b border-zinc-85 pb-1.5">
                  <Keyboard className="w-4 h-4 text-red-500" />
                  <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">
                    Search Student Name (Instant Check-In)
                  </span>
                </div>

                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Enter student's exact or partial name..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-zinc-900 text-zinc-100 text-xs px-3 py-2 pl-9 pr-9 rounded-lg border border-zinc-800 focus:outline-none focus:border-red-700/80 transition font-black tracking-wide uppercase placeholder:text-zinc-500 placeholder:normal-case placeholder:font-normal"
                  />
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300 transition cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 flex items-center justify-center h-4 w-4"
                      title="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[9px] text-zinc-500 px-1 select-none font-mono uppercase">
                  <span>
                    {searchQuery && (
                      <span>
                        Found <b>{filteredStudents.length}</b> matches
                      </span>
                    )}
                  </span>
                  <span>
                    Type name to auto check-in when 1 match remains
                  </span>
                </div>
              </div>

              {/* Suggestions Results */}
              <div className="min-h-[160px] max-h-[190px] overflow-y-auto space-y-2 border border-zinc-800 bg-zinc-950 p-2.5 rounded-xl scrollbar-thin">
                {!searchQuery ? (
                  <div className="h-32 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                    <Clock className="w-6 h-6 text-zinc-600 animate-pulse" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400">
                        Awaiting Entry
                      </p>
                      <p className="text-[9px] text-zinc-600 max-w-xs uppercase font-semibold">
                        Begin typing name to search active rosters
                      </p>
                    </div>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                    <ShieldAlert className="w-6 h-6 text-red-900/40" />
                    <div className="space-y-0.5">
                      <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400">
                        No matching student
                      </p>
                      <p className="text-[9px] text-zinc-600 max-w-xs uppercase font-semibold">
                        Confirm spelling and retry
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredStudents.map((s, index) => (
                      <div
                        key={s.id}
                        className={`p-2 sm:p-2.5 bg-zinc-900/40 hover:bg-zinc-800 rounded-lg border transition flex items-center justify-between gap-2.5 cursor-pointer ${
                          index === 0
                            ? "border-red-950 bg-red-950/5/20"
                            : "border-zinc-800/40"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-black text-zinc-200 uppercase tracking-tight">
                            {s.name}
                          </p>
                          <p className="text-[8.5px] font-mono text-zinc-500 mt-0.5 uppercase">
                            Location: {s.location || "West Chester"}
                          </p>
                        </div>

                        <div className="flex gap-1.5 shrink-0">
                          {s.programs.map((prog) => {
                            const todayString = new Date().toLocaleDateString("en-CA");
                            const hasLoggedToday = s.lastIncrementDateByProgram?.[prog] === todayString;
                            return (
                              <button
                                key={prog}
                                onClick={() => !hasLoggedToday && handleMarkAttendance(s, prog)}
                                disabled={hasLoggedToday}
                                className={`px-2 py-1 font-black text-[9px] rounded uppercase tracking-wider transition flex items-center gap-1 shadow-md ${
                                  hasLoggedToday
                                    ? "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed"
                                    : "bg-red-600 hover:bg-red-555 active:scale-95 text-white hover:shadow-red-500/20 cursor-pointer"
                                }`}
                              >
                                <Check className={`w-2.5 h-2.5 stroke-[3.5] ${hasLoggedToday ? "text-zinc-500" : ""}`} />
                                <span>{prog}{hasLoggedToday ? " (Done)" : ""}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Render TAKE BY CLASS MODE */}
          {attendanceMode === "class" && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-155">
              
              {/* Class Dropdown Selector */}
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 flex flex-col select-none">
                <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                  <Calendar className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest">
                    Select Active Class Session
                  </span>
                </div>
                <select
                  value={selectedClassKey}
                  onChange={(e) => setSelectedClassKey(e.target.value)}
                  className="w-full bg-zinc-900 text-zinc-100 text-xs px-3 py-2.5 rounded-lg border border-zinc-800 focus:outline-none focus:border-red-700/80 transition font-black tracking-wide uppercase cursor-pointer"
                >
                  {availableClasses.map((c) => {
                    const key = `${c.day} - ${c.time}`;
                    return (
                      <option key={key} value={key} className="bg-zinc-900 text-zinc-100 font-bold uppercase">
                        {c.day.toUpperCase()} — {c.time} ({c.studentIds.size} scheduled)
                      </option>
                    );
                  })}
                  {availableClasses.length === 0 && (
                    <option value="">No Scheduled Classes Available</option>
                  )}
                </select>
              </div>

              {/* Class Students Roster List */}
              <div className="min-h-[180px] max-h-[220px] overflow-y-auto space-y-2 border border-zinc-800 bg-zinc-950 p-2.5 rounded-xl scrollbar-thin">
                {classStudents.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-center text-zinc-500 space-y-2">
                    <Users className="w-6 h-6 text-zinc-800" />
                    <div className="space-y-0.5 animate-pulse">
                      <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400">
                        Roster is Empty
                      </p>
                      <p className="text-[9px] text-zinc-605 max-w-xs uppercase font-semibold">
                        No students scheduled for this class day & time
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {classStudents.map((s) => (
                      <div
                        key={s.id}
                        className="p-2 bg-zinc-900/40 hover:bg-zinc-800/60 rounded-lg border border-zinc-800/30 transition flex items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-black text-zinc-200 uppercase tracking-tight truncate">
                            {s.name}
                          </p>
                          <p className="text-[8.5px] font-mono text-zinc-500 uppercase mt-0.5">
                            {s.location || "West Chester"} • {s.scheduleDay1 ? `${s.scheduleDay1.substring(0,3)} ${s.scheduleTime1}` : ""} {s.scheduleDay2 ? `& ${s.scheduleDay2.substring(0,3)} ${s.scheduleTime2}` : ""}
                          </p>
                        </div>

                        <div className="flex gap-1.5 shrink-0">
                          {s.programs.map((prog) => {
                            const count = s.attendance?.[prog] || 0;
                            const todayString = new Date().toLocaleDateString("en-CA");
                            const hasLoggedToday = s.lastIncrementDateByProgram?.[prog] === todayString;
                            return (
                              <button
                                key={prog}
                                onClick={() => !hasLoggedToday && handleMarkAttendance(s, prog)}
                                disabled={hasLoggedToday}
                                title={hasLoggedToday ? "Already checked in today" : `Add attendance to ${s.name} for ${prog.toUpperCase()}`}
                                className={`px-2 py-1 border font-black text-[9px] rounded uppercase tracking-wider transition flex items-center gap-1 shadow-md ${
                                  hasLoggedToday
                                    ? "bg-zinc-800/50 border-zinc-800 text-zinc-500 cursor-not-allowed"
                                    : "bg-emerald-950/70 hover:bg-emerald-900 border-emerald-900/80 text-emerald-400 active:scale-95 shadow-emerald-950/10 cursor-pointer"
                                }`}
                              >
                                {hasLoggedToday ? (
                                  <Check className="w-2.5 h-2.5 text-zinc-500 stroke-[3.5]" />
                                ) : (
                                  <Plus className="w-2.5 h-2.5 text-emerald-400 stroke-[3.5]" />
                                )}
                                <span>{prog.substring(0, 3)} ({count})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Guest/Unscheduled fast selection */}
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 flex flex-col select-none">
                <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                  <Plus className="w-3.5 h-3.5 text-red-500" />
                  <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest">
                    Add Guest or Visiting Student
                  </span>
                </div>
                
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter guest or unscheduled student name..."
                    value={guestQuery}
                    onChange={(e) => setGuestQuery(e.target.value)}
                    className="w-full bg-zinc-900 text-zinc-100 text-xs px-3 py-2 pl-9 pr-9 rounded-lg border border-zinc-800 focus:outline-none focus:border-red-700/80 transition font-black tracking-wide uppercase placeholder:text-zinc-500 placeholder:normal-case placeholder:font-normal"
                  />
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  {guestQuery && (
                    <button
                      type="button"
                      onClick={() => setGuestQuery("")}
                      className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300 transition cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 flex items-center justify-center h-4 w-4"
                      title="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {guestQuery && visitingStudents.length === 0 && (
                  <p className="text-[9px] text-zinc-600 italic uppercase">
                    No matching visiting students found.
                  </p>
                )}

                {visitingStudents.length > 0 && (
                  <div className="space-y-1 bg-zinc-900/50 p-1.5 rounded-lg border border-zinc-800/60 divide-y divide-zinc-900">
                    {visitingStudents.map((s) => (
                      <div key={s.id} className="pt-1.5 pb-1.5 flex items-center justify-between gap-2.5">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-zinc-200 uppercase truncate">{s.name}</p>
                          <p className="text-[8px] font-mono text-zinc-500 uppercase">
                            {s.location || "West Chester"} — Irregular/Unscheduled
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {s.programs.map((prog) => {
                            const count = s.attendance?.[prog] || 0;
                            const todayString = new Date().toLocaleDateString("en-CA");
                            const hasLoggedToday = s.lastIncrementDateByProgram?.[prog] === todayString;
                            return (
                              <button
                                key={prog}
                                onClick={() => !hasLoggedToday && handleMarkAttendance(s, prog, true)}
                                disabled={hasLoggedToday}
                                className={`px-2 py-1 border font-extrabold text-[8px] rounded uppercase tracking-wider transition flex items-center gap-1 ${
                                  hasLoggedToday
                                    ? "bg-zinc-800/50 border-zinc-800 text-zinc-500 cursor-not-allowed"
                                    : "bg-red-950/70 hover:bg-red-900 border-red-900 text-red-400 active:scale-95 cursor-pointer"
                                }`}
                              >
                                {hasLoggedToday ? (
                                  <Check className="w-2 h-2 text-zinc-500 stroke-[3]" />
                                ) : (
                                  <Plus className="w-2 h-2 text-red-405" />
                                )}
                                <span>{prog} ({count})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Live Recent Logs Ledger */}
          <div className="border border-zinc-800 bg-zinc-950 p-3 rounded-xl flex flex-col gap-1.5 h-36 overflow-hidden">
            <div className="flex justify-between items-center text-[8px] uppercase font-black text-zinc-500 tracking-wider border-b border-zinc-900 pb-1">
              <span>Session Attendance log — Click message or button to UNDO</span>
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  className="hover:text-red-400 transition uppercase font-black tracking-widest text-[8px]"
                >
                  Clear Log
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[9.5px] text-zinc-400 scrollbar-thin">
              {logs.length === 0 ? (
                <p className="text-zinc-500 italic text-[8.5px] uppercase font-bold pt-1">
                  No check-ins logged this session
                </p>
              ) : (
                logs.map((log) => (
                  <button
                    key={log.id}
                    onClick={() => handleUndoLog(log)}
                    className="w-full text-left flex items-center justify-between gap-2 text-zinc-300 py-1 px-1.5 rounded bg-zinc-900/10 hover:bg-red-950/20 border border-transparent hover:border-red-900/30 transition group cursor-pointer"
                    title="Click to UNDO attendance addition"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-emerald-500 group-hover:text-red-500 font-extrabold transition shrink-0">✓</span>
                      <span className="truncate group-hover:line-through group-hover:text-red-400">{log.text}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {log.oldCount !== undefined && log.newCount !== undefined && (
                        <span className="text-[9px] font-mono font-black text-amber-400 bg-amber-950/40 border border-amber-900/40 px-1.5 py-0.5 rounded">
                          {log.oldCount} → {log.newCount}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-0.5 text-[7.5px] font-black text-zinc-500 group-hover:text-red-400 uppercase tracking-widest bg-zinc-900 px-1 py-0.5 rounded transition shrink-0">
                        <Undo2 className="w-2 h-2 text-zinc-500 group-hover:text-red-400 transition" /> Undo
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-3.5 bg-black/40 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-widest transition cursor-pointer text-center"
          >
            Finished Loading
          </button>
        </div>
      </div>
    </div>
  );
};
