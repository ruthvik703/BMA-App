import React, { useState, useMemo, useRef, useEffect } from "react";
import { Student, UserRole, Dojo } from "../types";
import { PRIMARY_DOJOS } from "../dojoConfig";
import {
  KARATE_RANKS,
  TOTS_RANKS,
  KOBUDO_RANKS,
  getNextRank,
  getStudentRankId,
  getProgramOverride,
  normalizeKobudoRankId,
} from "../constants";
import { BeltPreview } from "./BeltPreview";
import { DojoLogo } from "./DojoLogo";
import { getStudentProgramExpiryState, isAfterExamTime, isPrintReminderWednesday } from "../dateHelpers";
import { UpdateDetailsModal } from "./UpdateDetailsModal";
import { QuickAttendanceModal } from "./QuickAttendanceModal";
import { ExamCompletion } from "./ExamCompletion";
import {
  Users,
  Search,
  Plus,
  Filter,
  MapPin,
  Award,
  Trash2,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  Edit3,
  Camera,
  Calendar,
  Info,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Undo2,
  Scan,
  FileText,
  Printer,
  X,
  AlertCircle,
  Minus,
  Sparkles,
  User,
} from "lucide-react";

interface StudentRosterProps {
  students: Student[];
  studentsWithEligibility: (Student & {
    eligibility: {
      eligible: boolean;
      reasons: string[];
      classesActual: number;
      classesRequired: number;
    };
    targetRank: any;
    eligibilityByProgram?: { [key: string]: any };
    targetRankByProgram?: { [key: string]: any };
  })[];
  stats: {
    total: number;
    karateCount: number;
    totsCount: number;
    kobudoCount: number;
    eligibleCount: number;
  };
  onAddClick: (location?: string, program?: string) => void;
  onEditStudent: (student: Student) => void;
  onDeleteStudent: (id: string) => void;
  onUpdateStudent: (student: Student) => void;
  onCycleOverride: (id: string, program: string) => void;
  onAddStudents: (students: Student[]) => void;
  onBulkUpdate: (students: Student[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  classesBuffer: number;
  onBufferChange: (val: number) => void;
  userRole?: UserRole;
  testDate: string;
  onTestDateChange: (date: string) => void;
  autoPrintAllRosters?: boolean;
  onClearAutoPrintAllRosters?: () => void;
  testingLock?: { date: string; month: string; studentIds: string[] } | null;
  isDatabaseActive?: boolean;
  onUpdateTestingLock?: (lock: any) => void;
  onUpdateInvitationsLock?: (lock: any) => void;
  onUpdateLabelsLock?: (lock: any) => void;
  onUpdateBeltListLock?: (lock: any) => void;
  onTabChange?: (tab: string) => void;
  customDojos?: Dojo[];
}

export function StudentRoster({
  students,
  studentsWithEligibility,
  stats,
  onAddClick,
  onEditStudent,
  onDeleteStudent,
  onUpdateStudent,
  onAddStudents,
  onCycleOverride,
  onBulkUpdate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  classesBuffer,
  onBufferChange,
  userRole,
  testDate,
  onTestDateChange,
  autoPrintAllRosters,
  onClearAutoPrintAllRosters,
  testingLock,
  isDatabaseActive,
  onUpdateTestingLock,
  onUpdateInvitationsLock,
  onUpdateLabelsLock,
  onUpdateBeltListLock,
  onTabChange,
  customDojos = [],
}: StudentRosterProps) {
  // Highlight state for row when class attendance point is added
  const [recentlyAddedStudentId, setRecentlyAddedStudentId] = useState<
    string | null
  >(null);
  const [showExamCompletion, setShowExamCompletion] = useState(false);
  const [noteModalStudent, setNoteModalStudent] = useState<Student | null>(
    null,
  );
  const [isUpdateDetailsModalOpen, setIsUpdateDetailsModalOpen] =
    useState(false);
  const [isQuickAttendanceOpen, setIsQuickAttendanceOpen] = useState(false);
  const [updateDetailsInitialMode, setUpdateDetailsInitialMode] = useState<
    "attendance" | "enrollment" | "program" | "schedule" | "birthday"
  >("attendance");
  const [triggerKey, setTriggerKey] = useState(0);

  const isStudentChecked = (studentId: string) => {
    return !!testingLock && testingLock.studentIds.includes(studentId);
  };

  React.useEffect(() => {
    if (recentlyAddedStudentId) {
      const timer = setTimeout(() => {
        setRecentlyAddedStudentId(null);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [recentlyAddedStudentId, triggerKey]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + E: Toggle Exam Completion
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        setShowExamCompletion((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleAddClassAttendance = (student: Student, prog: string) => {
    const nextAttendance = { ...(student.attendance || {}) };
    nextAttendance[prog] = (nextAttendance[prog] || 0) + 1;

    setRecentlyAddedStudentId(student.id);
    setTriggerKey((prev) => prev + 1);

    const todayString = new Date().toLocaleDateString("en-CA");
    onUpdateStudent({
      ...student,
      attendance: nextAttendance,
      lastAttendanceUpdate: todayString,
      lastIncrementDateByProgram: {
        ...(student.lastIncrementDateByProgram || {}),
        [prog]: todayString,
      },
    });
  };

  const handleSubtractClassAttendance = (student: Student, prog: string) => {
    const nextAttendance = { ...(student.attendance || {}) };
    nextAttendance[prog] = Math.max(0, (nextAttendance[prog] || 0) - 1);

    const todayString = new Date().toLocaleDateString("en-CA");
    onUpdateStudent({
      ...student,
      attendance: nextAttendance,
      lastAttendanceUpdate: todayString,
      lastIncrementDateByProgram: {
        ...(student.lastIncrementDateByProgram || {}),
        [prog]: todayString,
      },
    });
  };

  const isExamWeekActive = useMemo(() => {
    if (!testDate) return false;
    try {
      const exam = new Date(testDate + "T00:00:00");
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const diffTime = exam.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays >= 0 && diffDays <= 7;
    } catch (err) {
      console.error(err);
      return false;
    }
  }, [testDate]);

  // Dismissed print reminder state for current exam cycle
  const [dismissedPrintReminderTestDate, setDismissedPrintReminderTestDate] = useState<string | null>(null);

  // Clock ticking for live active class indications
  const [nowLocal, setNowLocal] = useState(() => new Date());

  const showPrintReminder = useMemo(() => {
    if (!testDate) return false;
    if (!isPrintReminderWednesday(testDate, nowLocal)) return false;

    // Check if dismissed in state or localStorage for this specific testDate
    if (dismissedPrintReminderTestDate === testDate) return false;
    try {
      const isCleared = localStorage.getItem(`bma_print_reminder_cleared_${testDate}`) === "true";
      if (isCleared) return false;
    } catch {
      // ignore
    }
    return true;
  }, [testDate, nowLocal, dismissedPrintReminderTestDate]);

  const handleClearPrintReminder = () => {
    setDismissedPrintReminderTestDate(testDate);
    try {
      localStorage.setItem(`bma_print_reminder_cleared_${testDate}`, "true");
    } catch (err) {
      console.error(err);
    }
  };

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNowLocal(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const checkIfClassCurrentlyRunning = (subName: string, subRows: any[]) => {
    if (subName === "Irregular") return false;

    // Day mapping
    const daysOfWeek = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const currentDay = daysOfWeek[nowLocal.getDay()];
    const currentMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();

    const parts = subName.split(" - ");
    if (parts.length < 2) return false;

    const daysPart = parts[0];
    const timePart = parts[1];

    // Check if currentDay is in daysPart (e.g. "Monday/Wednesday" -> ["Monday", "Wednesday"])
    const isActiveDay = daysPart
      .split("/")
      .map((d) => d.trim())
      .includes(currentDay);
    if (!isActiveDay) return false;

    // Parse start time (e.g. "5:00 PM")
    const match = timePart.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return false;

    let hrs = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const pm = match[3].toUpperCase() === "PM";
    if (pm && hrs !== 12) hrs += 12;
    if (!pm && hrs === 12) hrs = 0;
    const startMinutes = hrs * 60 + mins;

    // Check if any row in this subsection is in the "tots" program
    const isTotsClass = subRows.some((r) => r.program === "tots");
    const duration = isTotsClass ? 30 : 60;

    return (
      currentMinutes >= startMinutes && currentMinutes < startMinutes + duration
    );
  };

  // Roster Filters and Queries
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"attendance" | "enrollment">(
    "attendance",
  );
  const [filterProgram, setFilterProgram] = useState<
    "all" | "karate" | "tots" | "kobudo"
  >("all");
  const [filterEligible, setFilterEligible] = useState<
    "all" | "eligible" | "ineligible"
  >("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterClassDay, setFilterClassDay] = useState<string>("all");
  const [filterClassTime, setFilterClassTime] = useState<string>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Check role access for custom dojos
  const canAccessCustomDojos = userRole === "Front Desk" || userRole === "Owner";

  // List of custom completed dojos (excluding primary 3)
  const customDojoList = useMemo(() => {
    if (!canAccessCustomDojos) return [];
    return (customDojos || []).filter((d) => !PRIMARY_DOJOS.includes(d.name as any));
  }, [canAccessCustomDojos, customDojos]);

  // All available locations for the filter bar
  const availableLocations = useMemo(() => {
    if (canAccessCustomDojos) {
      return ["all", ...PRIMARY_DOJOS, ...customDojoList.map((d) => d.name)];
    }
    return ["all", ...PRIMARY_DOJOS];
  }, [canAccessCustomDojos, customDojoList]);

  const [printRosterClasses, setPrintRosterClasses] = useState<
    | {
        location: string;
        name: string;
        students: typeof filteredStudents;
      }[]
    | null
  >(null);

  // Print Enrollments with family
  const [printFamilyModalStudent, setPrintFamilyModalStudent] = useState<Student | null>(null);
  const [selectedFamilyStudents, setSelectedFamilyStudents] = useState<Student[]>([]);
  const [familySearchQuery, setFamilySearchQuery] = useState('');
  const [enrollmentNotes, setEnrollmentNotes] = useState('');
  const [enrollmentPrintStudents, setEnrollmentPrintStudents] = useState<Student[]>([]);
  const [enrollmentPrintNotes, setEnrollmentPrintNotes] = useState<string>('');
  const [printMode, setPrintMode] = useState<'none' | 'enrollment_sheet'>('none');

  React.useEffect(() => {
    if (printMode === 'enrollment_sheet') {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      // Clean up printMode after 2 minutes to prevent premature DOM unmounting during print preview rotation
      const cleanupTimer = setTimeout(() => {
        setPrintMode('none');
      }, 120000);
      return () => {
        clearTimeout(timer);
        clearTimeout(cleanupTimer);
      };
    }
  }, [printMode]);

  const matchingStudents = useMemo(() => {
    if (!familySearchQuery.trim()) return [];
    const q = familySearchQuery.toLowerCase();
    return students.filter(s => {
      if (printFamilyModalStudent && s.id === printFamilyModalStudent.id) return false;
      if (selectedFamilyStudents.some(sel => sel.id === s.id)) return false;
      return s.name.toLowerCase().includes(q) || (s.notes && s.notes.toLowerCase().includes(q));
    }).slice(0, 5);
  }, [students, familySearchQuery, printFamilyModalStudent, selectedFamilyStudents]);

  const handlePrintAllDojosAndRosters = () => {
    const dojos = ["West Chester", "Monroe", "YMCA"] as const;
    const allRosters: {
      location: string;
      name: string;
      students: typeof filteredStudents;
    }[] = [];

    dojos.forEach((loc) => {
      // Get all rows for this location
      const locRows = filteredStudents.filter(
        (s) => (s.student.location || "West Chester") === loc,
      );
      if (locRows.length === 0) return;

      const subsectionMap: { [key: string]: typeof locRows } = {};

      locRows.forEach((row) => {
        const { student, program } = row;
        let subName = "Irregular";

        if (program === "kobudo") {
          subName = "Saturday - 9:00 AM";
        } else {
          const d1 = student.scheduleDay1;
          const t1 = student.scheduleTime1;
          const d2 = student.scheduleDay2;
          const t2 = student.scheduleTime2;

          if (d1 && t1 && d2 && t2) {
            const days = [d1.trim(), d2.trim()];
            const t1Norm = t1.trim().toUpperCase();
            const t2Norm = t2.trim().toUpperCase();

            if (t1Norm === t2Norm) {
              if (days.includes("Monday") && days.includes("Wednesday")) {
                subName = `Monday/Wednesday - ${t1}`;
              } else if (
                days.includes("Tuesday") &&
                days.includes("Thursday")
              ) {
                subName = `Tuesday/Thursday - ${t1}`;
              }
            }
          }
        }

        if (loc === "YMCA") {
          subName = "Irregular";
        }

        if (!subsectionMap[subName]) {
          subsectionMap[subName] = [];
        }
        subsectionMap[subName].push(row);
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

      const sortedSubsections = Object.keys(subsectionMap).sort((a, b) => {
        if (a === "Irregular") return -1;
        if (b === "Irregular") return 1;

        const [dayPartA, timeA] = a.split(" - ");
        const [dayPartB, timeB] = b.split(" - ");

        const firstDayA = dayPartA.split("/")[0].trim();
        const firstDayB = dayPartB.split("/")[0].trim();

        const dayDiff =
          (dayOrder[firstDayA] || 99) - (dayOrder[firstDayB] || 99);
        if (dayDiff !== 0) return dayDiff;

        return getTimeVal(timeA) - getTimeVal(timeB);
      });

      const formatSubsectionTitle = (title: string, location: string) => {
        if (title === "Irregular") {
          return location === "YMCA" ? "General Roster" : "Irregular Schedule";
        }
        return title;
      };

      sortedSubsections.forEach((subName) => {
        allRosters.push({
          location: loc,
          name: formatSubsectionTitle(subName, loc),
          students: subsectionMap[subName],
        });
      });
    });

    if (allRosters.length > 0) {
      setPrintRosterClasses(allRosters);
    }
  };

  React.useEffect(() => {
    if (autoPrintAllRosters) {
      onClearAutoPrintAllRosters?.();
      handlePrintAllDojosAndRosters();
    }
  }, [autoPrintAllRosters]);

  React.useEffect(() => {
    if (printRosterClasses && printRosterClasses.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 200);
      // Clean up after 2 minutes to prevent premature unmount during print preview rotation
      const cleanupTimer = setTimeout(() => {
        setPrintRosterClasses(null);
      }, 120000);
      return () => {
        clearTimeout(timer);
        clearTimeout(cleanupTimer);
      };
    }
  }, [printRosterClasses]);

  React.useEffect(() => {
    return () => {
      setPrintRosterClasses(null);
    };
  }, []);

  const availableFilterDays = useMemo(() => {
    const days = new Set<string>([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
    ]);
    students.forEach((s) => {
      if (s.scheduleDay1) days.add(s.scheduleDay1);
      if (s.scheduleDay2) days.add(s.scheduleDay2);
      if (s.programs?.includes("kobudo")) {
        days.add("Saturday");
      }
    });
    const order: { [key: string]: number } = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };
    return Array.from(days).sort((a, b) => (order[a] || 99) - (order[b] || 99));
  }, [students]);

  const availableFilterTimes = useMemo(() => {
    const times = new Set<string>();
    students.forEach((s) => {
      // If we are looking for all days, show all valid times.
      if (filterClassDay === "all") {
        if (s.scheduleTime1) times.add(s.scheduleTime1);
        if (s.scheduleTime2) times.add(s.scheduleTime2);
        if (s.programs?.includes("kobudo")) times.add("9:00 AM");
      } else {
        // Collect times where this specific day is scheduled
        if (s.scheduleDay1 === filterClassDay && s.scheduleTime1) {
          times.add(s.scheduleTime1);
        }
        if (s.scheduleDay2 === filterClassDay && s.scheduleTime2) {
          times.add(s.scheduleTime2);
        }
        if (filterClassDay === "Saturday" && s.programs?.includes("kobudo")) {
          times.add("9:00 AM");
        }
      }
    });

    // Fallback if the set is completely empty (though typically there's at least one match)
    if (times.size === 0) {
      ["5:00 PM", "6:00 PM", "6:30 PM", "7:30 PM"].forEach((t) => times.add(t));
    }

    return Array.from(times).sort((a, b) => {
      const getVal = (t: string) => {
        const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return 0;
        let hrs = parseInt(match[1]);
        const mins = parseInt(match[2]);
        const pm = match[3].toUpperCase() === "PM";
        if (pm && hrs !== 12) hrs += 12;
        if (!pm && hrs === 12) hrs = 0;
        return hrs * 60 + mins;
      };
      return getVal(a) - getVal(b);
    });
  }, [students, filterClassDay]);

  // Synchronize dynamic time filter when day filter changes
  React.useEffect(() => {
    if (
      filterClassTime !== "all" &&
      !availableFilterTimes.includes(filterClassTime)
    ) {
      setFilterClassTime("all");
    }
  }, [filterClassDay, availableFilterTimes, filterClassTime]);

  // Clear day and time filters when location is not West Chester
  React.useEffect(() => {
    if (filterLocation !== "West Chester") {
      setFilterClassDay("all");
      setFilterClassTime("all");
    }
  }, [filterLocation]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterProgram !== "all") count++;
    if (filterEligible !== "all") count++;
    if (filterLocation !== "all") count++;
    if (filterClassDay !== "all") count++;
    if (filterClassTime !== "all") count++;
    return count;
  }, [
    filterProgram,
    filterEligible,
    filterLocation,
    filterClassDay,
    filterClassTime,
  ]);

  const [expandedStudentKey, setExpandedStudentKey] = useState<string | null>(
    null,
  );
  const userUnminimizedLocations = useRef<Set<string>>(new Set());
  const [minimizedLocations, setMinimizedLocations] = useState<string[]>(() => {
    return (customDojos || [])
      .map((d) => d.name)
      .filter((name) => !PRIMARY_DOJOS.includes(name as any));
  });
  const [minimizedSubsections, setMinimizedSubsections] = useState<string[]>([]);
  const [isSpeedDialOpen, setIsSpeedDialOpen] = useState(false);
  const [isBulkActionMenuOpen, setIsBulkActionMenuOpen] = useState(false);

  // Mobile Student Card Modal state
  const [mobileCardTarget, setMobileCardTarget] = useState<{ studentId: string; program: string } | null>(null);
  const [showFullDetails, setShowFullDetails] = useState<boolean>(false);

  const activeCardStudent = useMemo(() => {
    if (!mobileCardTarget) return null;
    return studentsWithEligibility.find((s) => s.id === mobileCardTarget.studentId) || null;
  }, [mobileCardTarget, studentsWithEligibility]);

  useEffect(() => {
    if (customDojos && customDojos.length > 0) {
      const customNames = customDojos
        .map((d) => d.name)
        .filter((name) => !PRIMARY_DOJOS.includes(name as any));
      setMinimizedLocations((prev) => {
        const toAdd = customNames.filter(
          (name) => !prev.includes(name) && !userUnminimizedLocations.current.has(name),
        );
        if (toAdd.length > 0) {
          return [...prev, ...toAdd];
        }
        return prev;
      });
    }
  }, [customDojos]);

  const toggleMinimize = (loc: string) => {
    setMinimizedLocations((prev) => {
      const isCurrentlyMinimized = prev.includes(loc);
      if (isCurrentlyMinimized) {
        userUnminimizedLocations.current.add(loc);
        return prev.filter((l) => l !== loc);
      } else {
        userUnminimizedLocations.current.delete(loc);
        return [...prev, loc];
      }
    });
  };

  const toggleMinimizeSub = (loc: string, subName: string) => {
    const key = `${loc}_${subName}`;
    setMinimizedSubsections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleExpand = (studentId: string, program?: string) => {
    const key = program ? `${studentId}_${program}` : studentId;
    setExpandedStudentKey(expandedStudentKey === key ? null : key);
  };

  const toggleSelectAll = (
    rowsList: {
      student: { id: string };
      program: "karate" | "tots" | "kobudo";
    }[],
  ) => {
    const next = new Set(selectedIds);
    const keys = rowsList.map((r) => `${r.student.id}_${r.program}`);
    if (keys.every((key) => selectedIds.has(key))) {
      keys.forEach((key) => next.delete(key));
    } else {
      keys.forEach((key) => next.add(key));
    }
    setSelectedIds(next);
  };

  const toggleSelectOne = (
    id: string,
    program: "karate" | "tots" | "kobudo",
  ) => {
    const next = new Set(selectedIds);
    const key = `${id}_${program}`;
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedIds(next);
  };

  const handleBulkAttendance = (amount: number) => {
    const updatedStudentsList: Student[] = [];
    const attendanceUpdates: {
      [studentId: string]: { [prog: string]: number };
    } = {};

    selectedIds.forEach((key) => {
      const parts = key.split("_");
      if (parts.length >= 2) {
        const studentId = parts[0];
        const prog = parts[1];
        const s = students.find((x) => x.id === studentId);
        if (s) {
          if (!attendanceUpdates[studentId]) {
            attendanceUpdates[studentId] = {};
          }
          attendanceUpdates[studentId][prog] = amount;
        }
      }
    });

    Object.keys(attendanceUpdates).forEach((studentId) => {
      const s = students.find((x) => x.id === studentId);
      if (s) {
        const nextAttendance = { ...(s.attendance || {}) };
        const updates = attendanceUpdates[studentId];
        Object.keys(updates).forEach((prog) => {
          nextAttendance[prog] = Math.max(
            0,
            (nextAttendance[prog] || 0) + updates[prog],
          );
        });
        updatedStudentsList.push({ ...s, attendance: nextAttendance });
      }
    });

    if (updatedStudentsList.length > 0) {
      onBulkUpdate(updatedStudentsList);
    }

    setSelectedIds(new Set());
    setIsBulkActionMenuOpen(false);
  };

  const handleBulkOverride = (overrideValue: 'eligible' | 'ineligible' | null) => {
    const updatedStudentsList: Student[] = [];
    const studentIds = new Set<string>();
    const programOverrides: { [studentId: string]: { [prog: string]: 'eligible' | 'ineligible' | null } } = {};

    selectedIds.forEach((key) => {
      const parts = key.split("_");
      if (parts.length >= 2) {
        const studentId = parts[0];
        const prog = parts[1];
        studentIds.add(studentId);
        if (!programOverrides[studentId]) {
          programOverrides[studentId] = {};
        }
        programOverrides[studentId][prog] = overrideValue;
      }
    });

    studentIds.forEach((studentId) => {
      const s = students.find((x) => x.id === studentId);
      if (s) {
        const nextOverrides = { ...(s.manualOverrides || {}) };
        Object.entries(programOverrides[studentId] || {}).forEach(([p, val]) => {
          if (val === null) {
            delete nextOverrides[p];
          } else {
            nextOverrides[p] = val;
          }
        });
        updatedStudentsList.push({
          ...s,
          manualOverrides: nextOverrides,
        });
      }
    });

    if (updatedStudentsList.length > 0) {
      onBulkUpdate(updatedStudentsList);
    }
    setSelectedIds(new Set());
    setIsBulkActionMenuOpen(false);
  };

  const handleBulkToggleActive = () => {
    const studentIds = Array.from(new Set(Array.from(selectedIds).map((k) => k.split("_")[0])));
    const selectedStudents = students.filter((s) => studentIds.includes(s.id));
    const anyActive = selectedStudents.some((s) => !s.inactive);
    const updated = selectedStudents.map((s) => ({ ...s, inactive: anyActive }));
    if (updated.length > 0) {
      onBulkUpdate(updated);
    }
    setSelectedIds(new Set());
    setIsBulkActionMenuOpen(false);
  };

  const handleBulkPrintQueue = () => {
    const updatedStudentsList: Student[] = [];

    selectedIds.forEach((key) => {
      const parts = key.split("_");
      if (parts.length >= 2) {
        const studentId = parts[0];
        const s = students.find((x) => x.id === studentId);
        if (s) {
          const finalStudent = { ...s };
          if (!finalStudent.barcode) {
            finalStudent.barcode = `BMA-${Math.floor(100000 + Math.random() * 900000)}`;
          }
          finalStudent.barcodePrinted = false;

          if (!updatedStudentsList.some((x) => x.id === finalStudent.id)) {
            updatedStudentsList.push(finalStudent);
          }
        }
      }
    });

    if (updatedStudentsList.length > 0) {
      onBulkUpdate(updatedStudentsList);
    }

    setSelectedIds(new Set());
  };

  const handleExpandAll = () => {
    // 1. Expand all locations
    setMinimizedLocations([]);

    // 2. Expand all time section keys
    const allKeys: string[] = [];
    filteredStudents.forEach(({ student, program }) => {
      const loc = student.location || "West Chester";
      let subName = "Irregular";

      if (program === "kobudo") {
        subName = "Saturday - 9:00 AM";
      } else {
        const d1 = student.scheduleDay1;
        const t1 = student.scheduleTime1;
        const d2 = student.scheduleDay2;
        const t2 = student.scheduleTime2;

        if (d1 && t1 && d2 && t2) {
          const days = [d1.trim(), d2.trim()];
          const t1Norm = t1.trim().toUpperCase();
          const t2Norm = t2.trim().toUpperCase();

          if (t1Norm === t2Norm) {
            if (days.includes("Monday") && days.includes("Wednesday")) {
              subName = `Monday/Wednesday - ${t1}`;
            } else if (days.includes("Tuesday") && days.includes("Thursday")) {
              subName = `Tuesday/Thursday - ${t1}`;
            }
          }
        }
      }

      if (loc === "YMCA") {
        subName = "Irregular";
      }

      const key = `${loc}_${subName}`;
      if (!allKeys.includes(key)) {
        allKeys.push(key);
      }
    });

    setMinimizedSubsections([]);
  };

  const handleCollapseAll = () => {
    const allKeys: string[] = [];
    filteredStudents.forEach((row) => {
      const { student, program } = row;
      const loc = student.location || "West Chester";
      let subName = "Irregular";
      if (program === "kobudo") {
        subName = "Saturday - 9:00 AM";
      } else {
        const d1 = student.scheduleDay1;
        const t1 = student.scheduleTime1;
        const d2 = student.scheduleDay2;
        const t2 = student.scheduleTime2;
        if (d1 && t1 && d2 && t2) {
          const days = [d1.trim(), d2.trim()];
          const t1Norm = t1.trim().toUpperCase();
          const t2Norm = t2.trim().toUpperCase();
          if (t1Norm === t2Norm) {
            if (days.includes("Monday") && days.includes("Wednesday")) {
              subName = `Monday/Wednesday - ${t1}`;
            } else if (days.includes("Tuesday") && days.includes("Thursday")) {
              subName = `Tuesday/Thursday - ${t1}`;
            }
          }
        }
      }
      if (loc === "YMCA") {
        subName = "Irregular";
      }
      const key = `${loc}_${subName}`;
      if (!allKeys.includes(key)) {
        allKeys.push(key);
      }
    });
    setMinimizedSubsections(allKeys);
  };

  // Filter students
  const filteredStudents = useMemo(() => {
    const rows: {
      student: (typeof studentsWithEligibility)[number];
      program: "karate" | "tots" | "kobudo";
    }[] = [];

    studentsWithEligibility.forEach((student) => {
      student.programs.forEach((prog) => {
        rows.push({
          student,
          program: prog,
        });
      });
    });

    return rows
      .filter(({ student, program }) => {
        // Keep all active student records on the roster regardless of agreement expiry status

        // 1. Search Query filter search matches student name or notes
        const normalizedQuery = searchQuery.toLowerCase().trim();
        const matchesSearch =
          normalizedQuery === "" ||
          student.name.toLowerCase().includes(normalizedQuery) ||
          (student.notes &&
            student.notes.toLowerCase().includes(normalizedQuery));

        // 2. Program filter
        const matchesProgram =
          filterProgram === "all" || program === filterProgram;

        // 3. Eligibility filter
        const progElig = student.eligibilityByProgram?.[program];
        const matchesEligible =
          filterEligible === "all" ||
          (filterEligible === "eligible" && progElig?.eligible) ||
          (filterEligible === "ineligible" && !progElig?.eligible);

        // 4. Location filter
        const matchesLocation =
          filterLocation === "all" ||
          (student.location || "West Chester") === filterLocation;

        // 5. Class Day and Time filters
        const isKobudo = program === "kobudo";
        const d1 = isKobudo ? "Saturday" : student.scheduleDay1;
        const t1 = isKobudo ? "9:00 AM" : student.scheduleTime1;
        const d2 = isKobudo ? "" : student.scheduleDay2;
        const t2 = isKobudo ? "" : student.scheduleTime2;

        const matchesClassDay =
          filterClassDay === "all" ||
          d1 === filterClassDay ||
          d2 === filterClassDay;
        const matchesClassTime =
          filterClassTime === "all" ||
          t1 === filterClassTime ||
          t2 === filterClassTime;

        return (
          matchesSearch &&
          matchesProgram &&
          matchesEligible &&
          matchesLocation &&
          matchesClassDay &&
          matchesClassTime
        );
      })
      .sort((a, b) => a.student.name.localeCompare(b.student.name));
  }, [
    studentsWithEligibility,
    searchQuery,
    filterProgram,
    filterEligible,
    filterLocation,
    filterClassDay,
    filterClassTime,
    viewMode,
  ]);



  const statisticsSection = (
    <div className="bg-zinc-900 border-0 sm:border border-zinc-800 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 text-xs select-none mb-2 md:h-14">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 w-full md:w-auto">
        {/* Active Students */}
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-400 uppercase font-black text-[9px] tracking-wider">
            Active:
          </span>
          <span className="text-xs font-black text-zinc-100 font-mono leading-none">
            {stats.total}
          </span>
        </div>

        {/* Separator */}
        <div className="hidden md:block w-px h-5 bg-zinc-800" />

        {/* Eligible */}
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-green-500" />
          <span className="text-zinc-400 uppercase font-black text-[9px] tracking-wider">
            Eligible:
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-950/40 border border-green-900/30 text-green-400 font-black font-mono leading-none">
            {stats.eligibleCount}
            <span className="text-[10px] font-normal text-green-500/80">
              (
              {stats.total > 0
                ? Math.round((stats.eligibleCount / stats.total) * 100)
                : 0}
              %)
            </span>
          </span>
        </div>

        {/* Separator */}
        <div className="hidden md:block w-px h-5 bg-zinc-800" />

        {/* Programs Breakdown */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 uppercase font-black text-[9px] tracking-wider">
            Breakdown:
          </span>
          <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400 leading-none">
            <span className="text-red-400 font-bold">
              {stats.karateCount} Karate
            </span>
            <span className="text-zinc-700">•</span>
            <span className="text-indigo-400 font-bold">
              {stats.totsCount} Tots
            </span>
            <span className="text-zinc-700">•</span>
            <span className="text-amber-400 font-bold">
              {stats.kobudoCount} Kobudo
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 w-full md:w-auto justify-center border-t border-zinc-800 pt-2.5 md:pt-0 md:border-t-0 shrink-0">
        {/* Undo / Redo Controls */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 p-1 rounded-xl shadow-inner">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              canUndo
                ? "text-zinc-200 hover:text-white hover:bg-zinc-800 cursor-pointer active:scale-95"
                : "text-zinc-600 cursor-not-allowed opacity-50"
            }`}
            title="Undo last change (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="text-[11px] font-black uppercase tracking-wider">Undo</span>
          </button>
          <div className="w-px h-4 bg-zinc-800" />
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              canRedo
                ? "text-zinc-200 hover:text-white hover:bg-zinc-800 cursor-pointer active:scale-95"
                : "text-zinc-600 cursor-not-allowed opacity-50"
            }`}
            title="Redo last change (Ctrl+Y)"
          >
            <div className="rotate-180 scale-y-[-1]">
              <Undo2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-wider">Redo</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-4 print:hidden animate-in fade-in duration-100 p-2 sm:p-0">
        <style>{`
        @keyframes subtleRowFlash {
          0% { background-color: rgba(34, 197, 94, 0.4); box-shadow: inset 0 0 16px rgba(34, 197, 94, 0.25); }
          100% { background-color: transparent; }
        }
        .animate-row-flash {
          animation: subtleRowFlash 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes subtleBoxPulse {
          0%, 100% { border-color: rgba(63, 63, 70, 1); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
          50% { border-color: rgba(34, 197, 94, 0.5); box-shadow: 0 0 12px 1px rgba(34, 197, 94, 0.2); }
        }
        .animate-pulse-green {
          animation: subtleBoxPulse 3s infinite ease-in-out;
        }
      `}</style>
        {/* EXAM DATE SETTING & BUFFER - Centralized Control */}
        {/* Mobile-Only Version */}
        <div
          className={`sm:hidden bg-zinc-900 rounded-xl p-3.5 flex flex-col gap-3.5 select-none mb-2 overflow-hidden w-full max-w-full box-border ${
            isExamWeekActive
              ? "border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.1)]"
              : "border-0"
          }`}
        >
          {/* Row 1: Exam Icon & Date Info/Badge with merged Input */}
          <div className="flex flex-col gap-2 bg-zinc-950/40 border border-zinc-800 p-2.5 rounded-lg w-full max-w-full min-w-0 box-border">
            {/* Label Row */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-500 leading-none">
                Next Belt Exam
              </span>
            </div>
            {/* Icon + Input Row */}
            <div className="flex items-center gap-2 w-full min-w-0 max-w-full">
              <div className="w-8 h-8 rounded-lg bg-red-950/30 border border-red-900/20 flex items-center justify-center text-red-500 shrink-0">
                <Calendar className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0 max-w-[160px]">
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => onTestDateChange(e.target.value)}
                  disabled={userRole === "Instructor"}
                  className={`w-full max-w-full bg-zinc-950 border border-zinc-800 text-xs py-1 px-1.5 rounded focus:outline-none transition font-black font-mono tracking-tight box-border min-w-0 ${
                    userRole === "Instructor"
                      ? "text-zinc-400 cursor-not-allowed opacity-75"
                      : "text-red-500 focus:border-red-650"
                  }`}
                  style={{ minWidth: "0" }}
                />
              </div>
            </div>
          </div>

          {/* Row 3: Class Buffer Control */}
          <div className="flex items-center justify-between bg-zinc-950/40 border-0 sm:border border-zinc-800 p-2.5 rounded-lg gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-black text-zinc-300 uppercase tracking-wider leading-none mb-1">
                Attendance Buffer
              </span>
              <span className="text-[7.5px] text-zinc-500 font-bold uppercase leading-none truncate">
                Min. classes required
              </span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {userRole !== "Instructor" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBufferChange(Math.max(0, classesBuffer - 1));
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-white font-black transition active:bg-zinc-900 cursor-pointer"
                >
                  -
                </button>
              )}
              <span className="w-5 text-center font-black text-white text-sm font-mono">
                {classesBuffer}
              </span>
              {userRole !== "Instructor" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBufferChange(Math.min(10, classesBuffer + 1));
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-white font-black transition active:bg-zinc-900 cursor-pointer"
                >
                  +
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Desktop-Only Version */}
        <div
          className={`hidden sm:flex bg-zinc-900 border rounded-xl p-3 sm:p-4 flex-row items-center justify-between gap-3 sm:gap-4 select-none mb-2 ${
            isExamWeekActive ? "animate-pulse-green" : "border-zinc-800"
          }`}
        >
          <div className="flex justify-between sm:justify-start items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-3 w-56">
              <div className="w-10 h-10 rounded-lg bg-red-950/30 border border-red-900/20 flex items-center justify-center text-red-500 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block text-[8px] sm:text-[10px] uppercase tracking-wider font-extrabold text-zinc-500 leading-none mb-1">
                  Next Belt Exam
                </span>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => onTestDateChange(e.target.value)}
                  disabled={userRole === "Instructor"}
                  className={`w-full bg-zinc-950 border border-zinc-800 text-xs py-1 px-2 rounded focus:outline-none transition font-black font-mono tracking-tight ${
                    userRole === "Instructor"
                      ? "text-zinc-400 cursor-not-allowed opacity-75"
                      : "text-red-500 focus:border-red-600"
                  }`}
                />
              </div>
            </div>

            {userRole !== "Instructor" && (
              <div className="hidden sm:block w-px h-8 bg-zinc-800" />
            )}

            {/* Setup Class Buffer Tool */}
            <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 shadow-inner">
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-0.5">
                  Setup Buffer
                </span>
                <span className="text-[7px] text-zinc-500 font-bold uppercase leading-none">
                  Proj. Classes
                </span>
              </div>
              <div className="flex items-center gap-2">
                {userRole !== "Instructor" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBufferChange(Math.max(0, classesBuffer - 1));
                    }}
                    className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 font-bold transition hover:text-white cursor-pointer"
                  >
                    -
                  </button>
                )}
                <span className="w-4 text-center font-black text-white text-xs font-mono">
                  {classesBuffer}
                </span>
                {userRole !== "Instructor" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBufferChange(Math.min(10, classesBuffer + 1));
                    }}
                    className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 font-bold transition hover:text-white cursor-pointer"
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <div
                className="p-2 bg-zinc-950 border border-zinc-800 rounded group cursor-help hidden sm:block"
                title="This date syncs to all labels, invitations, and pull lists."
              >
                <Info className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition" />
              </div>
            </div>
          </div>
        </div>

        {/* PRINT TESTING MATERIALS REMINDER BANNER */}
        {showPrintReminder && (
          <div className="mb-3.5 bg-gradient-to-r from-amber-950/50 via-zinc-900 to-zinc-900 border-2 border-amber-500/60 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 shadow-xl shadow-amber-950/30 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Printer className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-black text-amber-200 uppercase tracking-wide">
                    Reminder: Print Testing Materials
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-950/90 text-amber-300 border border-amber-800/60">
                    Wednesday Prior to Test Week
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 mt-0.5 font-medium">
                  Test week begins next week! Please remember to print student attendance cards, testing sheets, candidate invitations, and belt pull lists.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end md:self-auto shrink-0 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => onTabChange?.("testing")}
                className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer transition shadow-md hover:scale-[1.02] active:scale-95"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-950" />
                <span>Go to Testing Page</span>
              </button>
              <button
                type="button"
                onClick={handleClearPrintReminder}
                className="flex items-center justify-center gap-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer transition border border-zinc-700 hover:border-zinc-600 active:scale-95"
                title="Dismiss this reminder until next exam review"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        )}

        {isAfterExamTime(testDate) && userRole !== "Instructor" && (
          <>
            {/* Mobile Format: Just the yellow button saying "Complete Exam Review", and nothing else */}
            <div className="block sm:hidden mb-4">
              <button
                type="button"
                onClick={() => onTabChange?.("testing")}
                className="w-full py-3.5 px-4 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-yellow-500/25 cursor-pointer transition text-center"
              >
                Complete Exam Review
              </button>
            </div>

            {/* Desktop / Tablet Format */}
            <div className="hidden sm:flex mb-4 bg-amber-950/20 border-2 border-amber-900/30 rounded-2xl p-4 items-center justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-950/40 border border-amber-900/20 flex items-center justify-center text-amber-500 shrink-0">
                  <AlertCircle className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-amber-200 uppercase tracking-wide">Exam Completion Review</h4>
                  <p className="text-xs text-zinc-400 mt-1 font-medium">To finalize student testing, proceed to the Testing tab.</p>
                </div>
              </div>
              <button
                onClick={() => onTabChange?.("testing")}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer transition active:scale-95 shadow-lg shadow-amber-900/30 shrink-0"
              >
                Go to Testing Page
              </button>
            </div>
          </>
        )}

        {statisticsSection}

        {/* FILTER & SEARCH COMBINED HEADER */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 bg-zinc-900 border-0 sm:border border-zinc-800 p-1.5 rounded-lg sm:items-center">
            {userRole !== "Instructor" && (
              <div className="flex p-0.5 bg-zinc-950 border-0 sm:border border-zinc-800 rounded-lg shrink-0 h-9 select-none w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setViewMode("attendance")}
                  className={`flex-1 sm:flex-initial px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center ${
                    viewMode === "attendance"
                      ? "bg-red-600 text-white shadow"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Attendance
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("enrollment")}
                  className={`flex-1 sm:flex-initial px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center ${
                    viewMode === "enrollment"
                      ? "bg-red-600 text-white shadow"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Enrollment
                </button>
              </div>
            )}

            {/* Search Input always visible */}
            <div className="flex-1 relative w-full">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search students or internal notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-100 placeholder-zinc-500 text-xs py-1.5 pl-8.5 pr-9 rounded focus:outline-none focus:border-red-600 h-9 transition font-medium"
              />
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

            {/* Expand/Collapse All */}
            <div className="flex gap-1 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleExpandAll}
                className="flex-1 sm:flex-initial px-3 h-9 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition rounded text-[9px] font-black uppercase tracking-wider cursor-pointer flex items-center justify-center select-none"
                title="Expand all location groups and class time sections"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="flex-1 sm:flex-initial px-3 h-9 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition rounded text-[9px] font-black uppercase tracking-wider cursor-pointer flex items-center justify-center select-none"
                title="Collapse all class sections"
              >
                Collapse All
              </button>
            </div>

            {/* Toggle Expand Button */}
            <button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className={`w-full sm:w-auto px-3 py-1.5 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 h-9 cursor-pointer select-none border-0 sm:border ${
                filtersExpanded || activeFiltersCount > 0
                  ? "bg-zinc-100 text-zinc-950 sm:border-white border-zinc-300"
                  : "bg-zinc-950 text-zinc-400 sm:border-zinc-800 border-transparent hover:sm:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <Filter
                className={`w-3.5 h-3.5 transition-transform ${activeFiltersCount > 0 ? "text-red-500 animate-pulse" : ""}`}
              />
              <span className="uppercase text-[10px] tracking-wider font-extrabold font-sans">
                Filters
              </span>
              {activeFiltersCount > 0 && (
                <span className="bg-red-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded-full leading-none font-mono">
                  {activeFiltersCount}
                </span>
              )}
              {filtersExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Collapsible panel with minimal filters layout */}
          {filtersExpanded && (
            <div className="bg-zinc-950 border-0 sm:border border-zinc-800 p-2.5 rounded-lg flex flex-col sm:flex-row flex-wrap gap-2 sm:items-center justify-start text-[10px] select-none animate-in slide-in-from-top-2 duration-200">
              {/* Filter by Program */}
              <div className="flex items-center gap-2 shrink-0 bg-zinc-900 border-0 sm:border border-zinc-800 px-2 py-0.5 rounded">
                <span className="font-extrabold text-zinc-500 uppercase tracking-widest text-[8.5px]">
                  Program:
                </span>
                <div className="flex gap-0.5">
                  {(["all", "karate", "tots", "kobudo"] as const).map(
                    (prog) => (
                      <button
                        key={prog}
                        onClick={() => setFilterProgram(prog)}
                        className={`px-2 py-0.5 text-[9px] font-black rounded uppercase transition cursor-pointer ${
                          filterProgram === prog
                            ? "bg-white text-zinc-950"
                            : "text-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {prog === 'all' ? 'All' : prog === 'karate' ? 'Karate' : prog === 'tots' ? 'Tots' : prog === 'kobudo' ? 'Kobudo' : prog}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Filter by Status */}
              <div className="flex items-center gap-2 shrink-0 bg-zinc-900 border-0 sm:border border-zinc-800 px-2 py-0.5 rounded">
                <span className="font-extrabold text-zinc-500 uppercase tracking-widest text-[8.5px]">
                  Status:
                </span>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => setFilterEligible("all")}
                    className={`px-2 py-0.5 text-[9px] font-black rounded uppercase transition cursor-pointer ${
                      filterEligible === "all"
                        ? "bg-white text-zinc-950"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    All ({students.length})
                  </button>
                  <button
                    onClick={() => setFilterEligible("eligible")}
                    className={`px-2 py-0.5 text-[9px] font-black rounded uppercase transition cursor-pointer ${
                      filterEligible === "eligible"
                        ? "bg-white text-zinc-950"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    Eligible (
                    {
                      studentsWithEligibility.filter(
                        (s) => s.eligibility.eligible,
                      ).length
                    }
                    )
                  </button>
                  <button
                    onClick={() => setFilterEligible("ineligible")}
                    className={`px-2 py-0.5 text-[9px] font-black rounded uppercase transition cursor-pointer ${
                      filterEligible === "ineligible"
                        ? "bg-white text-zinc-950"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    Ineligible
                  </button>
                </div>
              </div>

              {/* Filter by Location */}
              <div className="flex items-center gap-2 shrink-0 bg-zinc-900 border-0 sm:border border-zinc-800 px-2 py-0.5 rounded">
                <span className="font-extrabold text-zinc-500 uppercase tracking-widest text-[8.5px]">
                  Location:
                </span>
                <div className="flex gap-0.5 overflow-x-auto max-w-full">
                  {availableLocations.map((loc) => (
                    <button
                      key={loc}
                      onClick={() => setFilterLocation(loc)}
                      className={`px-2 py-0.5 text-[9px] font-black rounded uppercase transition cursor-pointer whitespace-nowrap ${
                        filterLocation === loc
                          ? "bg-white text-zinc-950"
                          : "text-zinc-500 hover:text-zinc-200"
                      }`}
                    >
                      {loc === "all" ? "All" : loc}
                    </button>
                  ))}
                </div>
              </div>

              {filterLocation === "West Chester" && (
                <>
                  {/* Filter by Class Day */}
                  <div className="flex items-center gap-2 shrink-0 bg-zinc-900 border-0 sm:border border-zinc-800 px-2 py-1 rounded">
                    <span className="font-extrabold text-zinc-500 uppercase tracking-widest text-[8.5px]">
                      Day:
                    </span>
                    <select
                      value={filterClassDay}
                      onChange={(e) => setFilterClassDay(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded px-1 min-h-[22px] text-[9px] font-black text-zinc-300 focus:text-white cursor-pointer focus:outline-none focus:border-red-600 uppercase"
                    >
                      <option value="all">ALL DAYS</option>
                      {availableFilterDays.map((day) => (
                        <option
                          key={day}
                          value={day}
                          className="bg-zinc-900 text-zinc-200"
                        >
                          {day.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter by Class Time */}
                  <div className="flex items-center gap-2 shrink-0 bg-zinc-900 border-0 sm:border border-zinc-800 px-2 py-1 rounded">
                    <span className="font-extrabold text-zinc-500 uppercase tracking-widest text-[8.5px]">
                      Time:
                    </span>
                    <select
                      value={filterClassTime}
                      onChange={(e) => setFilterClassTime(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded px-1 min-h-[22px] text-[9px] font-black text-zinc-300 focus:text-white cursor-pointer focus:outline-none focus:border-red-600 uppercase"
                    >
                      <option value="all">ALL TIMES</option>
                      {availableFilterTimes.map((time) => (
                        <option
                          key={time}
                          value={time}
                          className="bg-zinc-900 text-zinc-200"
                        >
                          {time.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Reset Filters Quick link if any active */}
              {activeFiltersCount > 0 && (
                <button
                  onClick={() => {
                    setFilterProgram("all");
                    setFilterEligible("all");
                    setFilterLocation("all");
                    setFilterClassDay("all");
                    setFilterClassTime("all");
                    setSearchQuery("");
                  }}
                  className="text-[9px] font-black text-red-400 hover:text-red-300 ml-auto cursor-pointer uppercase tracking-widest underline underline-offset-2 select-none"
                >
                  Clear All
                </button>
              )}
            </div>
          )}
        </div>

        {/* ROSTER TABLE BREAKDOWNS BY DOJO REGION */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-zinc-900 border border-red-900/40 rounded-2xl shadow-2xl shadow-red-950/20 px-6 py-3 flex items-center gap-6 backdrop-blur-xl">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest leading-none mb-1">
                  Selected Students
                </span>
                <span className="text-xl font-black text-white font-mono leading-none">
                  {selectedIds.size}
                </span>
              </div>

              <div className="w-px h-8 bg-zinc-800" />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkActionMenuOpen(!isBulkActionMenuOpen)}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2 h-10 rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-lg shadow-red-900/40 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Bulk Actions</span>
                  {isBulkActionMenuOpen ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set());
                    setIsBulkActionMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3.5 py-2 border border-zinc-700/80 h-10 rounded-xl text-xs font-black uppercase tracking-widest transition cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {filteredStudents.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-20 text-center text-zinc-500 select-none">
            <Users className="w-12 h-12 text-zinc-800 mx-auto mb-2" />
            <p className="font-bold text-zinc-500 text-xs uppercase tracking-widest">
              No student records match existing search filters.
            </p>
            <p className="text-zinc-600 mt-1 max-w-sm mx-auto text-[10.5px]">
              Try clearing search queries, expanding age restrictions, or
              verifying location selectors.
            </p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-8 pb-10">
            {(() => {
              // 1. The three primary dojos (West Chester, Monroe, and YMCA which already exist) appear for all users.
              // 2. All completed dojos appear at the bottom of the main page (ONLY FOR Front Desk or Admin Users).
              const locationsToDisplay =
                filterLocation === "all"
                  ? [
                      ...PRIMARY_DOJOS,
                      ...(canAccessCustomDojos
                        ? customDojoList.map((d) => d.name)
                        : []),
                    ]
                  : [filterLocation];

              return locationsToDisplay.map((loc) => {
                const locRows = filteredStudents.filter(
                  (s) => (s.student.location || "West Chester") === loc,
                );
                const isCustom = !PRIMARY_DOJOS.includes(loc as any);
                const customDojoConfig = isCustom
                  ? customDojos.find((d) => d.name === loc)
                  : null;

                // For primary dojos with no matching students, hide when viewing all
                if (locRows.length === 0 && !isCustom && filterLocation === "all") {
                  return null;
                }

                // If custom dojo has 0 students:
                if (locRows.length === 0 && isCustom) {
                  return (
                    <div key={loc} className="space-y-3">
                      <div
                        className="flex items-center justify-between bg-zinc-950 border-l-4 border-amber-500 px-4 py-2 sm:py-2.5 rounded-lg shadow-sm cursor-pointer hover:bg-zinc-900/50 transition select-none"
                        onClick={() => toggleMinimize(loc)}
                      >
                        <div className="flex items-center gap-2 select-none">
                          {minimizedLocations.includes(loc) ? (
                            <ChevronRight className="w-4 h-4 text-zinc-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-500" />
                          )}
                          <MapPin className="w-3.5 h-3.5 text-amber-500" />
                          <div className="flex items-center gap-2">
                            <h3 className="text-[10px] sm:text-xs font-black uppercase text-zinc-200 tracking-wider">
                              {loc}
                            </h3>
                            <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-amber-950/60 text-amber-300 border border-amber-800/60 rounded">
                              Program
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] sm:text-[10px] font-mono bg-zinc-900 px-2 py-0.5 rounded text-zinc-500 font-bold">
                            0 Students
                          </span>
                        </div>
                      </div>

                      {!minimizedLocations.includes(loc) && (
                        <div className="bg-zinc-900 border border-dashed border-zinc-800 rounded-xl p-8 text-center space-y-3">
                          <div className="w-10 h-10 mx-auto rounded-full bg-amber-950/40 border border-amber-900/40 flex items-center justify-center text-amber-400">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-zinc-200 uppercase tracking-wide">
                              {loc} Program Roster Empty
                            </p>
                            <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                              No active students enrolled in this program yet. Profile fields are configured according to your custom template.
                            </p>
                          </div>
                          {customDojoConfig?.address && (
                            <p className="text-[10px] text-zinc-500 flex items-center justify-center gap-1">
                              <MapPin className="w-3 h-3 text-zinc-600" />
                              {customDojoConfig.address}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => onAddClick(loc, filterProgram === "all" ? "karate" : filterProgram)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider rounded-lg transition shadow-md cursor-pointer active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Student to {loc}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                if (locRows.length === 0) return null;

                // Group by Class Time
                const subsectionMap: { [key: string]: typeof locRows } = {};

                locRows.forEach((row) => {
                  const { student, program } = row;
                  let subName = "Irregular";

                  if (program === "kobudo") {
                    subName = "Saturday - 9:00 AM";
                  } else {
                    const d1 = student.scheduleDay1;
                    const t1 = student.scheduleTime1;
                    const d2 = student.scheduleDay2;
                    const t2 = student.scheduleTime2;

                    if (d1 && t1 && d2 && t2) {
                      const days = [d1.trim(), d2.trim()];
                      const t1Norm = t1.trim().toUpperCase();
                      const t2Norm = t2.trim().toUpperCase();

                      if (t1Norm === t2Norm) {
                        if (
                          days.includes("Monday") &&
                          days.includes("Wednesday")
                        ) {
                          subName = `Monday/Wednesday - ${t1}`;
                        } else if (
                          days.includes("Tuesday") &&
                          days.includes("Thursday")
                        ) {
                          subName = `Tuesday/Thursday - ${t1}`;
                        }
                      }
                    }
                  }

                  if (loc === "YMCA") {
                    subName = "Irregular";
                  }

                if (!subsectionMap[subName]) {
                  subsectionMap[subName] = [];
                }
                subsectionMap[subName].push(row);
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

              const sortedSubsections = Object.keys(subsectionMap).sort(
                (a, b) => {
                  if (a === "Irregular") return -1;
                  if (b === "Irregular") return 1;

                  const [dayPartA, timeA] = a.split(" - ");
                  const [dayPartB, timeB] = b.split(" - ");

                  const firstDayA = dayPartA.split("/")[0].trim();
                  const firstDayB = dayPartB.split("/")[0].trim();

                  const dayDiff =
                    (dayOrder[firstDayA] || 99) - (dayOrder[firstDayB] || 99);
                  if (dayDiff !== 0) return dayDiff;

                  return getTimeVal(timeA) - getTimeVal(timeB);
                },
              );

              const formatSubsectionTitle = (
                title: string,
                location: string,
              ) => {
                if (title === "Irregular") {
                  return location === "YMCA"
                    ? "General Roster"
                    : "Irregular Schedule";
                }
                return title;
              };

              const isSubAllChecked = (subRows: typeof locRows) => {
                return (
                  subRows.length > 0 &&
                  subRows.every((r) =>
                    selectedIds.has(`${r.student.id}_${r.program}`),
                  )
                );
              };

              const handleSubSelectToggle = (subRows: typeof locRows) => {
                const next = new Set(selectedIds);
                const allChecked = isSubAllChecked(subRows);
                if (allChecked) {
                  subRows.forEach((r) =>
                    next.delete(`${r.student.id}_${r.program}`),
                  );
                } else {
                  subRows.forEach((r) =>
                    next.add(`${r.student.id}_${r.program}`),
                  );
                }
                setSelectedIds(next);
              };

              return (
                <div key={loc} className="space-y-3">
                  {/* Dojo Header */}
                  <div
                    className={`flex items-center justify-between bg-zinc-950 border-l-4 ${
                      isCustom ? "border-amber-500" : "border-red-650"
                    } px-4 py-2 sm:py-2.5 rounded-lg shadow-sm cursor-pointer hover:bg-zinc-900/50 transition select-none`}
                    onClick={() => toggleMinimize(loc)}
                  >
                    <div className="flex items-center gap-2 select-none">
                      {minimizedLocations.includes(loc) ? (
                        <ChevronRight className="w-4 h-4 text-zinc-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                      )}
                      <MapPin className={`w-3.5 h-3.5 ${isCustom ? "text-amber-500" : "text-red-500"}`} />
                      <div className="flex items-center gap-2">
                        <h3 className="text-[10px] sm:text-xs font-black uppercase text-zinc-200 tracking-wider">
                          {isCustom ? `${loc}` : `${loc} Dojo`}
                        </h3>
                        {isCustom && (
                          <span className="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-amber-950/60 text-amber-300 border border-amber-800/60 rounded">
                            Program
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {userRole !== "Instructor" &&
                        viewMode !== "enrollment" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const classesToPrint = sortedSubsections.map(
                                (subName) => ({
                                  location: loc,
                                  name: formatSubsectionTitle(subName, loc),
                                  students: subsectionMap[subName],
                                }),
                              );
                              setPrintRosterClasses(classesToPrint);
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-wider transition rounded text-[8.5px] cursor-pointer shadow-md duration-150 active:scale-95"
                            title={`Print all class rosters for ${loc} Dojo`}
                          >
                            <Printer className="w-3.5 h-3.5 text-white shrink-0" />
                            <span>Print All Rosters</span>
                          </button>
                        )}
                      <span className="text-[9px] sm:text-[10px] font-mono bg-zinc-900 px-2 py-0.5 rounded text-zinc-500 font-bold">
                        {new Set(locRows.map((r) => r.student.id)).size}{" "}
                        Students
                      </span>
                    </div>
                  </div>

                  {/* Table Housing */}
                  {!minimizedLocations.includes(loc) && (
                    <div className="bg-zinc-900 border-0 sm:border border-zinc-800 rounded-xl overflow-hidden shadow-xl border-t-0 sm:border-t">
                      <div className="hidden sm:block overflow-x-auto scrollbar-thin">
                        <table className="w-full text-left text-xs text-zinc-200">
                          <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider text-[9px] sm:text-[10px] border-b border-zinc-800 font-bold select-none">
                            <tr>
                              <th className="px-2 sm:px-4 py-1.5 sm:py-2 w-8 sm:w-10">
                                <input
                                  type="checkbox"
                                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900"
                                  checked={
                                    locRows.length > 0 &&
                                    locRows.every((r) =>
                                      selectedIds.has(
                                        `${r.student.id}_${r.program}`,
                                      ),
                                    )
                                  }
                                  onChange={() => toggleSelectAll(locRows)}
                                />
                              </th>
                              <th className="px-2 sm:px-6 py-1.5 sm:py-2">
                                Student
                              </th>
                              {viewMode === "enrollment" &&
                              userRole !== "Instructor" ? (
                                <>
                                  <th className="px-3 sm:px-4 py-2 hidden sm:table-cell">
                                    Agreement
                                  </th>
                                  <th className="px-3 sm:px-4 py-2 text-center hidden sm:table-cell">
                                    CC On File
                                  </th>
                                  <th className="px-3 sm:px-4 py-2 text-center hidden sm:table-cell">
                                    Attend. Card
                                  </th>
                                  <th className="px-3 sm:px-4 py-2 text-center hidden sm:table-cell">
                                    Photo Release
                                  </th>
                                </>
                              ) : (
                                <>
                                  <th className="px-3 sm:px-4 py-2 hidden sm:table-cell">
                                    Current Rank
                                  </th>
                                  <th className="px-3 sm:px-4 py-2 hidden sm:table-cell">
                                    Next Rank
                                  </th>
                                  <th className="px-4 sm:px-6 py-2 hidden sm:table-cell">
                                    Progress
                                  </th>
                                  <th className="px-3 sm:px-4 py-2 text-center hidden sm:table-cell">
                                    Status
                                  </th>
                                </>
                              )}
                              <th className="px-4 sm:px-6 py-2 text-right hidden sm:table-cell">
                                Settings
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-zinc-800 bg-zinc-900 bg-gradient-to-b from-zinc-900/60 to-zinc-950/30">
                            {sortedSubsections.map((subName) => {
                              const subStudents = subsectionMap[subName];
                              if (!subStudents || subStudents.length === 0)
                                return null;
                              const isSubMinimized =
                                minimizedSubsections.includes(
                                  `${loc}_${subName}`,
                                );

                              return (
                                <React.Fragment key={subName}>
                                  {/* Subsection sub-header row */}
                                  <tr
                                    className={`transition select-none border-y border-zinc-800 cursor-pointer ${
                                      checkIfClassCurrentlyRunning(
                                        subName,
                                        subStudents,
                                      )
                                        ? "bg-gradient-to-r from-emerald-950/50 via-emerald-950/30 to-zinc-950 border-l-4 border-l-emerald-500 hover:from-emerald-950/60 hover:via-emerald-950/40 hover:to-zinc-950 shadow-[inset_0_3px_12px_rgba(16,185,129,0.06)]"
                                        : "bg-black hover:bg-zinc-950 border-l-2 border-l-zinc-700/60"
                                    }`}
                                    onClick={() =>
                                      toggleMinimizeSub(loc, subName)
                                    }
                                  >
                                    <td
                                      className="px-2 sm:px-4 py-1.5 sm:py-2 w-8 sm:w-10 text-center"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900 cursor-pointer animate-none"
                                        checked={isSubAllChecked(subStudents)}
                                        onChange={() =>
                                          handleSubSelectToggle(subStudents)
                                        }
                                      />
                                    </td>
                                    <td
                                      colSpan={6}
                                      className="px-2 sm:px-4 py-1.5 sm:py-2 text-left"
                                    >
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {isSubMinimized ? (
                                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0 animate-none" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0 " />
                                        )}

                                        <span
                                          className={`text-[10px] sm:text-xs font-black uppercase tracking-wider font-sans transition-colors ${
                                            checkIfClassCurrentlyRunning(
                                              subName,
                                              subStudents,
                                            )
                                              ? "text-emerald-400 font-extrabold"
                                              : "text-zinc-300"
                                          }`}
                                        >
                                          {formatSubsectionTitle(subName, loc)}
                                        </span>

                                        {checkIfClassCurrentlyRunning(
                                          subName,
                                          subStudents,
                                        ) && (
                                          <span className="flex h-2 w-2 relative ml-0.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                          </span>
                                        )}

                                        {checkIfClassCurrentlyRunning(
                                          subName,
                                          subStudents,
                                        ) && (
                                          <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-950/80 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 animate-pulse select-none leading-none">
                                            LIVE NOW
                                          </span>
                                        )}

                                        <span className="text-[9px] font-mono bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-bold">
                                          {subStudents.length} Students
                                        </span>

                                        {Array.from(
                                          new Set(
                                            subStudents.map((s) => s.program),
                                          ),
                                        ).map((prog) => (
                                          <span
                                            key={prog}
                                            className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none ${
                                              prog === "karate"
                                                ? "bg-zinc-950 text-red-500 border border-red-950"
                                                : prog === "tots"
                                                  ? "bg-zinc-950 text-indigo-400 border border-indigo-950"
                                                  : "bg-zinc-950 text-amber-400 border border-amber-950"
                                            }`}
                                          >
                                            {prog === "karate"
                                              ? "Karate"
                                              : prog === "tots"
                                                ? "Tots"
                                                : "Kobudo"}
                                          </span>
                                        ))}

                                        {userRole !== "Instructor" &&
                                          viewMode !== "enrollment" && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setPrintRosterClasses([
                                                  {
                                                    location: loc,
                                                    name: formatSubsectionTitle(
                                                      subName,
                                                      loc,
                                                    ),
                                                    students: subStudents,
                                                  },
                                                ]);
                                              }}
                                              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white transition rounded text-[8.5px] font-black uppercase tracking-wider select-none cursor-pointer shadow-md duration-150 active:scale-95"
                                              title={`Print class roster for ${formatSubsectionTitle(subName, loc)}`}
                                            >
                                              <Printer className="w-3 h-3 text-white shrink-0" />
                                              <span>Print Roster</span>
                                            </button>
                                          )}
                                      </div>
                                    </td>
                                  </tr>

                                  {!isSubMinimized &&
                                    subStudents.map(
                                      ({ student, program: activeProgram }) => {
                                        const eligibility = null;
                                        const isTestingLocked = !!testingLock;
                                        const isStudentInThisTest =
                                          isTestingLocked &&
                                          testingLock?.studentIds?.includes(
                                            student.id,
                                          );
                                        const studentRowKey = `${student.id}_${activeProgram}`;
                                        const isExpanded =
                                          expandedStudentKey === studentRowKey;
                                        const visiblePrograms = [activeProgram];

                                        const expiryStatus =
                                          viewMode === "enrollment" &&
                                          userRole !== "Instructor"
                                            ? getStudentProgramExpiryState(
                                                student,
                                                activeProgram,
                                              )
                                            : "none";

                                        const rowColorClass =
                                          expiryStatus === "expiring"
                                            ? "bg-amber-950/15 border-l-4 border-l-amber-500 hover:bg-amber-950/25 border-b border-amber-900/10"
                                            : expiryStatus === "expired"
                                              ? "bg-red-950/15 border-l-4 border-l-red-500 hover:bg-red-950/25 border-b border-red-900/10"
                                              : "";

                                        return (
                                          <React.Fragment
                                            key={`${subName}_${student.id}_${activeProgram}`}
                                          >
                                            <tr
                                              onClick={() =>
                                                toggleExpand(student.id, activeProgram)
                                              }
                                              className={`hover:bg-zinc-900/90 transition group border-b border-zinc-800/65 text-zinc-300 cursor-pointer ${
                                                recentlyAddedStudentId ===
                                                student.id
                                                  ? "animate-row-flash"
                                                  : ""
                                              } ${rowColorClass} ${
                                                (student as any).isInactive
                                                  ? "opacity-40 saturate-50 hover:bg-zinc-950 bg-zinc-950/20"
                                                  : ""
                                              }`}
                                            >
                                              {/* Selection Checkbox */}
                                              <td
                                                className="px-1.5 sm:px-4 py-1 sm:py-2"
                                                onClick={(e) =>
                                                  e.stopPropagation()
                                                }
                                              >
                                                <input
                                                  type="checkbox"
                                                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900"
                                                  checked={selectedIds.has(
                                                    `${student.id}_${activeProgram}`,
                                                  )}
                                                  onChange={() =>
                                                    toggleSelectOne(
                                                      student.id,
                                                      activeProgram,
                                                    )
                                                  }
                                                />
                                              </td>

                                              {/* Name particulars */}
                                              <td className="px-1.5 sm:px-6 py-1 sm:py-2">
                                                <div className="flex items-center gap-1.5 sm:gap-3">
                                                  <div className="sm:hidden">
                                                    {isExpanded ? (
                                                      <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
                                                    ) : (
                                                      <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                                                    )}
                                                  </div>
                                                  <div className="flex flex-col gap-0 max-w-[150px] sm:max-w-[180px]">
                                                    <span
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setMobileCardTarget({
                                                          studentId: student.id,
                                                          program: activeProgram,
                                                        });
                                                      }}
                                                      className="font-black text-zinc-100 text-xs sm:text-sm group-hover:text-red-500 transition truncate leading-tight flex items-center gap-1.5 cursor-pointer hover:underline"
                                                      title="Click to view student profile"
                                                    >
                                                      <span>
                                                        {student.name}
                                                      </span>
                                                      {(student as any)
                                                        .isInactive && (
                                                        <span className="text-[8px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded shrink-0 leading-none">
                                                          Inactive
                                                        </span>
                                                      )}
                                                    </span>

                                                    {viewMode ===
                                                      "attendance" &&
                                                      subName === "Irregular" &&
                                                      (student.scheduleDay1 ||
                                                        student.scheduleDay2) && (
                                                        <span className="text-[9.5px] text-zinc-500 font-medium mt-0.5 whitespace-nowrap">
                                                          {student.scheduleDay1
                                                            ? `${student.scheduleDay1.substring(0, 3)} ${student.scheduleTime1}`
                                                            : ""}
                                                          {student.scheduleDay1 &&
                                                            student.scheduleDay2 &&
                                                            " • "}
                                                          {student.scheduleDay2
                                                            ? `${student.scheduleDay2.substring(0, 3)} ${student.scheduleTime2}`
                                                            : ""}
                                                        </span>
                                                      )}
                                                    {viewMode ===
                                                      "attendance" && (
                                                      <div className="sm:hidden flex flex-col gap-1 mt-1 select-none">
                                                        {visiblePrograms.map(
                                                          (prog) => {
                                                            const progElig =
                                                              student
                                                                .eligibilityByProgram?.[
                                                                prog
                                                              ] || {
                                                                eligible: false,
                                                                classesActual: 0,
                                                                classesRequired: 16,
                                                              };
                                                            const override =
                                                              getProgramOverride(
                                                                student,
                                                                prog as any,
                                                              );
                                                            const isProgramInThisTest =
                                                              isTestingLocked &&
                                                              testingLock?.studentIds?.includes(student.id) &&
                                                              (prog !== "kobudo" || !!progElig.eligible);
                                                            const isOrangeEligible =
                                                              isTestingLocked &&
                                                              progElig.eligible &&
                                                              !isProgramInThisTest &&
                                                              override !==
                                                                "eligible";
                                                            const isEffectiveEligible =
                                                              override ===
                                                              "eligible"
                                                                ? true
                                                                : override ===
                                                                    "ineligible"
                                                                  ? false
                                                                  : isTestingLocked
                                                                    ? isProgramInThisTest && progElig.eligible
                                                                    : progElig.eligible;
                                                            const colorClass =
                                                              isOrangeEligible
                                                                ? "text-orange-400"
                                                                : progElig.isProvisional
                                                                  ? "text-[#addf68]"
                                                                  : isEffectiveEligible
                                                                    ? "text-green-400"
                                                                    : "text-red-500";
                                                            return (
                                                              <div
                                                                key={prog}
                                                                className="flex items-center gap-1 text-[10px] font-mono leading-none"
                                                              >
                                                                {visiblePrograms.length >
                                                                  1 && (
                                                                  <span className="text-zinc-500 uppercase text-[8px] font-black">
                                                                    {prog}:
                                                                  </span>
                                                                )}
                                                                {isProgramInThisTest && (
                                                                  <Check className="w-2.5 h-2.5 text-white mr-1 shrink-0" />
                                                                )}
                                                                <span
                                                                  className={`${colorClass} font-black`}
                                                                >
                                                                  {
                                                                    progElig.classesActual
                                                                  }
                                                                  /
                                                                  {progElig.classesRequired ===
                                                                  9999
                                                                    ? "∞"
                                                                    : progElig.classesRequired}{" "}
                                                                  Classes
                                                                </span>
                                                              </div>
                                                            );
                                                          },
                                                        )}
                                                      </div>
                                                    )}
                                                    {viewMode ===
                                                      "enrollment" &&
                                                      userRole ===
                                                        "Front Desk" && (
                                                        <div className="flex flex-col gap-1 mt-1 sm:hidden select-none">
                                                          {student
                                                            .enrollmentExpiries?.[
                                                            activeProgram
                                                          ] ? (
                                                            <div className="text-[10px] font-black uppercase text-red-500 bg-red-950/20 px-1.5 py-0.5 rounded border border-red-900/40 self-start">
                                                              Exp:{" "}
                                                              {
                                                                student
                                                                  .enrollmentExpiries[
                                                                  activeProgram
                                                                ]
                                                              }
                                                            </div>
                                                          ) : (
                                                            <div className="text-[10px] font-bold uppercase text-zinc-500 self-start">
                                                              Monthly / No
                                                              Expiry
                                                            </div>
                                                          )}
                                                        </div>
                                                      )}
                                                  </div>
                                                </div>
                                              </td>

                                              {viewMode === "enrollment" &&
                                              userRole !== "Instructor" ? (
                                                <>
                                                  {/* Agreement style badge */}
                                                  <td className="px-4 py-2 whitespace-nowrap hidden sm:table-cell">
                                                    <div className="flex flex-col gap-1">
                                                      <span className="inline-flex items-center px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-black tracking-wide text-zinc-100 uppercase self-start">
                                                        {student
                                                          .enrollmentAgreements?.[
                                                          activeProgram
                                                        ] || (
                                                          <span className="text-zinc-500 italic font-medium lowercase">
                                                            none
                                                          </span>
                                                        )}
                                                      </span>
                                                      {student
                                                        .enrollmentAgreements?.[
                                                        activeProgram
                                                      ] &&
                                                        student
                                                          .enrollmentAgreements[
                                                          activeProgram
                                                        ] !== "Monthly" &&
                                                        student
                                                          .enrollmentExpiries?.[
                                                          activeProgram
                                                        ] && (
                                                          <span
                                                            className={`text-[10px] bma-expiry-tag font-bold px-1.5 py-0.5 rounded border self-start ${
                                                              expiryStatus ===
                                                              "expiring"
                                                                ? "text-amber-400 bg-amber-950/20 border-amber-900/40"
                                                                : expiryStatus ===
                                                                    "expired"
                                                                  ? "text-red-400 bg-red-950/20 border-red-900/40 animate-pulse"
                                                                  : "text-zinc-400 bg-zinc-950/30 border-zinc-800"
                                                            }`}
                                                          >
                                                            Expires:{" "}
                                                            {
                                                              student
                                                                .enrollmentExpiries[
                                                                activeProgram
                                                              ]
                                                            }
                                                          </span>
                                                        )}
                                                    </div>
                                                  </td>

                                                  {/* Credit Card checkbox */}
                                                  <td
                                                    className="px-3 sm:px-4 py-2 text-center whitespace-nowrap hidden sm:table-cell"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={
                                                        !!student.creditCardOnFile
                                                      }
                                                      onChange={(e) => {
                                                        onUpdateStudent({
                                                          ...student,
                                                          creditCardOnFile:
                                                            e.target.checked,
                                                        });
                                                      }}
                                                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900 cursor-pointer"
                                                    />
                                                  </td>

                                                  {/* Attendance Card checkbox */}
                                                  <td
                                                    className="px-3 sm:px-4 py-2 text-center whitespace-nowrap hidden sm:table-cell"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                  >
                                                    {activeProgram ===
                                                    "karate" ? (
                                                      <input
                                                        type="checkbox"
                                                        checked={
                                                          !!student.attendanceCardCreated
                                                        }
                                                        onChange={(e) => {
                                                          onUpdateStudent({
                                                            ...student,
                                                            attendanceCardCreated:
                                                              e.target.checked,
                                                          });
                                                        }}
                                                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900 cursor-pointer"
                                                      />
                                                    ) : (
                                                      <span className="text-zinc-500 italic text-[11px] font-mono select-none">
                                                        —
                                                      </span>
                                                    )}
                                                  </td>

                                                  {/* Photo Release checkbox */}
                                                  <td
                                                    className="px-3 sm:px-4 py-2 text-center whitespace-nowrap hidden sm:table-cell"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={
                                                        !!student.photoReleaseSigned
                                                      }
                                                      onChange={(e) => {
                                                        onUpdateStudent({
                                                          ...student,
                                                          photoReleaseSigned:
                                                            e.target.checked,
                                                        });
                                                      }}
                                                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900 cursor-pointer"
                                                    />
                                                  </td>
                                                </>
                                              ) : (
                                                <>
                                                  {/* Belt displays (Hidden on Mobile) */}
                                                  <td className="px-4 py-2 whitespace-nowrap hidden sm:table-cell">
                                                    <div className="flex flex-col gap-1">
                                                      {visiblePrograms.map((prog) => {
                                                        if (prog === 'kobudo' && student.kobudoWeapons && student.kobudoWeapons.length > 0) {
                                                          return student.kobudoWeapons.map((weapon) => {
                                                            const rawId = weapon === 'Bo' ? student.kobudoRankings?.bo : student.kobudoRankings?.sai;
                                                            const rId = normalizeKobudoRankId(rawId);
                                                            const rank = KOBUDO_RANKS.find((r) => r.id === rId) || KOBUDO_RANKS[0];
                                                            return (
                                                              <div key={weapon} className="flex items-center gap-1">
                                                                <span className="text-[9px] font-black text-zinc-400 uppercase">{weapon}:</span>
                                                                <BeltPreview
                                                                  rank={rank}
                                                                  size="sm"
                                                                  showLabel={true}
                                                                />
                                                              </div>
                                                            );
                                                          });
                                                        }

                                                        const curRankId = getStudentRankId(student, prog);
                                                        const rankList = prog === 'karate' ? KARATE_RANKS : prog === 'tots' ? TOTS_RANKS : KOBUDO_RANKS;
                                                        const currentBelt = rankList.find((r) => r.id === curRankId) || rankList[0];
                                                        return (
                                                          <BeltPreview
                                                            key={prog}
                                                            rank={currentBelt}
                                                            size="sm"
                                                            showLabel={true}
                                                          />
                                                        );
                                                      })}
                                                    </div>
                                                  </td>

                                                  <td className="px-4 py-2 whitespace-nowrap hidden sm:table-cell">
                                                    <div className="flex flex-col gap-1">
                                                      {visiblePrograms.map((prog) => {
                                                        if (prog === 'kobudo' && student.kobudoWeapons && student.kobudoWeapons.length > 0) {
                                                          return student.kobudoWeapons.map((weapon) => {
                                                            const rawId = weapon === 'Bo' ? student.kobudoRankings?.bo : student.kobudoRankings?.sai;
                                                            const rId = normalizeKobudoRankId(rawId);
                                                            const next = getNextRank('kobudo', rId);
                                                            return next ? (
                                                              <div key={weapon} className="flex items-center gap-1">
                                                                <span className="text-[9px] font-black text-zinc-400 uppercase">{weapon}:</span>
                                                                <BeltPreview
                                                                  rank={next}
                                                                  size="sm"
                                                                  showLabel={true}
                                                                />
                                                              </div>
                                                            ) : (
                                                              <span
                                                                key={weapon}
                                                                className="text-zinc-500 italic text-[10px]"
                                                              >
                                                                Max Rank ({weapon})
                                                              </span>
                                                            );
                                                          });
                                                        }

                                                        const next =
                                                          getNextRank(
                                                            prog,
                                                            getStudentRankId(student, prog)
                                                          );
                                                        return next ? (
                                                          <BeltPreview
                                                            key={prog}
                                                            rank={next}
                                                            size="sm"
                                                            showLabel={true}
                                                          />
                                                        ) : (
                                                          <span
                                                            key={prog}
                                                            className="text-zinc-500 italic text-[10px]"
                                                          >
                                                            Max Rank ({prog})
                                                          </span>
                                                        );
                                                      })}
                                                    </div>
                                                  </td>

                                                  {/* Progress bar info (Hidden on Mobile) */}
                                                  <td
                                                    className="px-6 py-1.5 w-[210px] hidden sm:table-cell"
                                                    onClick={(e) =>
                                                      e.stopPropagation()
                                                    }
                                                  >
                                                    <div className="space-y-1.5">
                                                      {visiblePrograms.map(
                                                        (prog) => {
                                                          const progElig =
                                                            student
                                                              .eligibilityByProgram?.[
                                                              prog
                                                            ] || {
                                                              eligible: false,
                                                              classesActual: 0,
                                                              classesRequired: 16,
                                                            };
                                                          const progress =
                                                            Math.min(
                                                              100,
                                                              Math.round(
                                                                (progElig.classesActual /
                                                                  progElig.classesRequired) *
                                                                  100,
                                                              ),
                                                            );
                                                          const override = getProgramOverride(student, prog as any);

                                                          const isTestingLocked =
                                                            !!testingLock;
                                                          const isProgramInThisTest =
                                                            isTestingLocked &&
                                                            testingLock.studentIds.includes(
                                                              student.id,
                                                            ) &&
                                                            (prog !== "kobudo" || !!progElig.eligible);
                                                          const isOrangeEligible =
                                                            isTestingLocked &&
                                                            progElig.eligible &&
                                                            !isProgramInThisTest &&
                                                            override !==
                                                              "eligible";
                                                          const isEffectiveEligible =
                                                            override ===
                                                            "eligible"
                                                              ? true
                                                              : override ===
                                                                  "ineligible"
                                                                ? false
                                                                : isTestingLocked
                                                                  ? isProgramInThisTest && progElig.eligible
                                                                  : progElig.eligible;

                                                          let barColorClass =
                                                            progElig.isProvisional
                                                              ? "bg-[#8cc34a]"
                                                              : isEffectiveEligible
                                                                ? "bg-green-600"
                                                                : "bg-red-700";
                                                          if (isOrangeEligible)
                                                            barColorClass =
                                                              "bg-orange-500";

                                                          return (
                                                            <div key={prog}>
                                                              <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 mb-0.5 select-none">
                                                                <div className="flex items-center">
                                                                  {isProgramInThisTest && (
                                                                    <Check className="w-2.5 h-2.5 text-white mr-1" />
                                                                  )}
                                                                  <span className="uppercase text-[8px] font-black mr-2 text-zinc-600">
                                                                    {prog}:
                                                                  </span>
                                                                  <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="999"
                                                                    aria-label={`${student.name} ${prog} attendance`}
                                                                    value={
                                                                      progElig.classesActual
                                                                    }
                                                                    onChange={(
                                                                      e,
                                                                    ) => {
                                                                      const val =
                                                                        Math.max(
                                                                          0,
                                                                          parseInt(
                                                                            e
                                                                              .target
                                                                              .value,
                                                                          ) ||
                                                                            0,
                                                                        );
                                                                      const nextAttendance =
                                                                        {
                                                                          ...(student.attendance ||
                                                                            {}),
                                                                        };
                                                                      nextAttendance[
                                                                        prog
                                                                      ] = val;
                                                                      const todayStr = new Date().toLocaleDateString("en-CA");
                                                                      onUpdateStudent(
                                                                        {
                                                                          ...student,
                                                                          attendance:
                                                                            nextAttendance,
                                                                          lastAttendanceUpdate: todayStr,
                                                                          lastIncrementDateByProgram: {
                                                                            ...(student.lastIncrementDateByProgram || {}),
                                                                            [prog]: todayStr,
                                                                          },
                                                                        },
                                                                      );
                                                                    }}
                                                                    onKeyDown={(
                                                                      e,
                                                                    ) => {
                                                                      if (
                                                                        e.key ===
                                                                        "Enter"
                                                                      ) {
                                                                        e.currentTarget.blur();
                                                                      }
                                                                    }}
                                                                    onFocus={(
                                                                      e,
                                                                    ) =>
                                                                      e.target.select()
                                                                    }
                                                                    className={`w-10 h-5 text-center bg-zinc-950 border border-zinc-800 focus:border-red-500 hover:border-zinc-700 rounded text-[11px] font-mono font-black focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-text inline-block mr-1 leading-none ${
                                                                      isOrangeEligible
                                                                        ? "text-orange-400"
                                                                        : progElig.isProvisional
                                                                          ? "text-[#addf68]"
                                                                          : isEffectiveEligible
                                                                            ? "text-emerald-400 font-bold"
                                                                            : override === "ineligible"
                                                                              ? "text-red-400"
                                                                              : "text-zinc-200"
                                                                    }`}
                                                                  />
                                                                  <span className="text-zinc-600 font-black text-[9px] mr-1">
                                                                    /
                                                                  </span>
                                                                  <span className={`text-[10px] ${
                                                                    isOrangeEligible
                                                                      ? "text-orange-400/80 font-bold"
                                                                      : progElig.isProvisional
                                                                        ? "text-[#addf68]/80 font-bold"
                                                                        : isEffectiveEligible
                                                                          ? "text-emerald-400/80 font-bold"
                                                                          : "text-zinc-500 font-medium"
                                                                  }`}>
                                                                    {progElig.classesRequired ===
                                                                    9999
                                                                      ? "∞"
                                                                      : progElig.classesRequired}
                                                                  </span>
                                                                  {isOrangeEligible && (
                                                                    <span className="text-orange-500 text-[9px] ml-2 font-black uppercase tracking-wider">
                                                                      Eligible
                                                                      Later
                                                                    </span>
                                                                  )}
                                                                  {student
                                                                    .lastIncrementDateByProgram?.[
                                                                    prog
                                                                  ] !==
                                                                    new Date().toLocaleDateString(
                                                                      "en-CA",
                                                                    ) && (
                                                                    <button
                                                                      onClick={(
                                                                        e,
                                                                      ) => {
                                                                        e.stopPropagation();
                                                                        handleAddClassAttendance(
                                                                          student,
                                                                          prog,
                                                                        );
                                                                      }}
                                                                      title={`Mark ${prog} Attendance`}
                                                                      className="ml-1.5 w-4 h-4 bg-zinc-800 hover:bg-zinc-700 rounded flex items-center justify-center pb-0.5 text-xs text-zinc-300 pointer-events-auto cursor-pointer"
                                                                    >
                                                                      +
                                                                    </button>
                                                                  )}
                                                                </div>
                                                                <span
                                                                  className={
                                                                    isOrangeEligible
                                                                      ? "text-orange-400 font-extrabold"
                                                                      : progElig.isProvisional
                                                                        ? "text-[#addf68] font-extrabold"
                                                                        : isEffectiveEligible
                                                                          ? "text-green-500 font-extrabold"
                                                                          : "text-zinc-500"
                                                                  }
                                                                >
                                                                  {progElig.classesRequired ===
                                                                  9999
                                                                    ? "REQ approval"
                                                                    : progElig.isProvisional
                                                                      ? "Buffer"
                                                                      : `${progress}%`}
                                                                </span>
                                                              </div>
                                                              <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden">
                                                                <div
                                                                  className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
                                                                  style={{
                                                                    width: `${progress}%`,
                                                                  }}
                                                                />
                                                              </div>
                                                            </div>
                                                          );
                                                        },
                                                      )}
                                                    </div>
                                                  </td>

                                                  {/* Eligibility badges & controls (Visible on Mobile) */}
                                                  <td className="px-1.5 sm:px-4 py-1 sm:py-2 text-center whitespace-nowrap">
                                                    <div className="flex flex-col items-center gap-1 select-none">
                                                      {visiblePrograms.map(
                                                        (prog) => {
                                                          const progElig =
                                                            student
                                                              .eligibilityByProgram?.[
                                                              prog
                                                            ] || {
                                                              eligible: false,
                                                              reasons: [],
                                                            };
                                                          const override = getProgramOverride(student, prog as any);

                                                          const isTestingLocked =
                                                            !!testingLock;
                                                          const isProgramInThisTest =
                                                            isTestingLocked &&
                                                            testingLock.studentIds.includes(
                                                              student.id,
                                                            ) &&
                                                            (prog !== "kobudo" || !!progElig.eligible);
                                                          const isOrangeEligible =
                                                            isTestingLocked &&
                                                            progElig.eligible &&
                                                            !isProgramInThisTest &&
                                                            override !==
                                                              "eligible";
                                                          const isEffectiveEligible =
                                                            override ===
                                                            "eligible"
                                                              ? true
                                                              : override ===
                                                                  "ineligible"
                                                                ? false
                                                                : isTestingLocked
                                                                  ? isProgramInThisTest && progElig.eligible
                                                                  : progElig.eligible;

                                                          return (
                                                            <div
                                                              key={prog}
                                                              className="flex flex-col items-center gap-1"
                                                            >
                                                              <div className="flex items-center gap-1.5">
                                                                {isOrangeEligible ? (
                                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-950 border border-orange-900 text-orange-400 font-black text-[9px] uppercase">
                                                                    <Clock className="w-2.5 h-2.5 text-orange-400" />{" "}
                                                                    {prog.substring(
                                                                      0,
                                                                      3,
                                                                    )}
                                                                  </span>
                                                                ) : progElig.isProvisional ? (
                                                                  <span
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1b2b09] border border-[#445b25] text-[#addf68] font-black text-[9px] uppercase cursor-help"
                                                                    title={progElig.reasons.join(
                                                                      "\n • ",
                                                                    )}
                                                                  >
                                                                    <Clock className="w-2.5 h-2.5 text-[#addf68]" />{" "}
                                                                    {prog.substring(
                                                                      0,
                                                                      3,
                                                                    )}
                                                                    {isProgramInThisTest && (
                                                                      <Check className="w-2.5 h-2.5 text-white ml-0.5" />
                                                                    )}
                                                                  </span>
                                                                ) : isEffectiveEligible ? (
                                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-950 border border-green-900 text-green-400 font-black text-[9px] uppercase">
                                                                    <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />{" "}
                                                                    {prog.substring(
                                                                      0,
                                                                      3,
                                                                    )}
                                                                    {isProgramInThisTest && (
                                                                      <Check className="w-2.5 h-2.5 text-white ml-0.5" />
                                                                    )}
                                                                  </span>
                                                                ) : (
                                                                  <span
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 font-extrabold text-[9px] uppercase cursor-help"
                                                                    title={progElig.reasons.join(
                                                                      "\n • ",
                                                                    )}
                                                                    onClick={(
                                                                      e,
                                                                    ) =>
                                                                      e.stopPropagation()
                                                                    }
                                                                  >
                                                                    <XCircle className="w-2.5 h-2.5 text-red-500" />{" "}
                                                                    {prog.substring(
                                                                      0,
                                                                      3,
                                                                    )}
                                                                  </span>
                                                                )}
                                                              </div>

                                                              <button
                                                                onClick={(
                                                                  e,
                                                                ) => {
                                                                  e.stopPropagation();
                                                                  onCycleOverride(
                                                                    student.id,
                                                                    prog,
                                                                  );
                                                                }}
                                                                className="text-[8px] text-zinc-500 hover:text-red-400 font-bold transition font-mono border-b border-transparent hover:border-red-400/20 cursor-pointer uppercase hidden sm:block"
                                                                title={`Cycle ${prog} status: Auto → Force Eligible → Force Ineligible`}
                                                              >
                                                                {override ===
                                                                  "eligible" &&
                                                                  "🟢 Forced"}
                                                                {override ===
                                                                  "ineligible" &&
                                                                  "🔴 Forced"}
                                                                {(override ===
                                                                  undefined ||
                                                                  override ===
                                                                    null) &&
                                                                  "⚙️ Set Opt"}
                                                              </button>
                                                            </div>
                                                          );
                                                        },
                                                      )}
                                                    </div>
                                                  </td>
                                                </>
                                              )}

                                              {/* Configurations (Hidden on Mobile) */}
                                              <td className="px-6 py-2 text-right whitespace-nowrap hidden sm:table-cell text-zinc-500">
                                                <div
                                                  className="flex items-center justify-end gap-2"
                                                  onClick={(e) =>
                                                    e.stopPropagation()
                                                  }
                                                >

                                                   {viewMode === "enrollment" && (
                                                     <button
                                                       type="button"
                                                       onClick={(e) => {
                                                         e.stopPropagation();
                                                         const fIds = student.familyIds || [];
                                                         const familyStudents = students.filter(s => fIds.includes(s.id));
                                                         setEnrollmentPrintStudents([student, ...familyStudents]);
                                                         setEnrollmentPrintNotes(student.notes || '');
                                                         setPrintMode('enrollment_sheet');
                                                       }}
                                                       className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white transition rounded text-[8.5px] font-black uppercase tracking-wider select-none cursor-pointer shadow-md duration-150 active:scale-95 whitespace-nowrap"
                                                       title="Print student's enrollment agreements"
                                                     >
                                                       <Printer className="w-3 h-3 text-white shrink-0" />
                                                       <span>Print Enrollments</span>
                                                     </button>
                                                   )}
                                                  {userRole !== "Instructor" && (
                                                    <>
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          onEditStudent(student);
                                                        }}
                                                        className="p-1.5 hover:bg-zinc-800 rounded hover:text-zinc-200 transition cursor-pointer"
                                                        title="Edit particulars"
                                                      >
                                                        <Edit3 className="w-4 h-4" />
                                                      </button>
                                                      <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          onDeleteStudent(
                                                            student.id,
                                                          );
                                                        }}
                                                        className="p-1.5 hover:bg-red-950 hover:text-red-400 rounded transition cursor-pointer"
                                                        title="Remove student record"
                                                      >
                                                        <Trash2 className="w-4 h-4" />
                                                      </button>
                                                    </>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>

                                            {isExpanded && (
                                              <tr className="bg-zinc-950/50 border-b border-zinc-800">
                                                <td
                                                  colSpan={12}
                                                  className="px-1.5 sm:px-4 py-1.5 sm:py-2"
                                                >
                                                  {(student as any)
                                                    .isInactive && (
                                                    <div
                                                      className="mb-3 px-3 py-2 bg-red-950/20 border border-red-900/30 rounded-lg flex items-center justify-between text-[11px] text-red-400 select-none"
                                                      onClick={(e) =>
                                                        e.stopPropagation()
                                                      }
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                                        <span>
                                                          <b>
                                                            Student is Inactive:
                                                          </b>{" "}
                                                          No attendance updates
                                                          recorded since{" "}
                                                          <span className="font-mono font-black">
                                                            {student.lastAttendanceUpdate ||
                                                              "inception"}
                                                          </span>
                                                          . Any attendance
                                                          change will
                                                          automatically
                                                          reactivate them.
                                                        </span>
                                                      </div>
                                                      <span className="text-[9px] font-medium bg-red-950 px-2 py-0.5 rounded border border-red-900/20 uppercase tracking-wider text-red-350 select-none shrink-0">
                                                        Inactive Map
                                                      </span>
                                                    </div>
                                                  )}
                                                  {viewMode === "enrollment" &&
                                                  userRole !== "Instructor" ? (
                                                    <div
                                                      className="space-y-4"
                                                      onClick={(e) =>
                                                        e.stopPropagation()
                                                      }
                                                    >
                                                      {/* Enrollment details expanded view - Only seen under Enrollment mode */}
                                                      <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-1.5">
                                                          <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                                                            Agreement Mode
                                                          </span>
                                                          <span className="inline-flex items-center px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-black tracking-wide text-zinc-200 uppercase">
                                                            {student
                                                              .enrollmentAgreements?.[
                                                              activeProgram
                                                            ] || "None"}
                                                          </span>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                          <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                                                            Contract Expiry
                                                          </span>
                                                          <span className="inline-flex items-center px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-black tracking-wide text-zinc-200 uppercase">
                                                            {student
                                                              .enrollmentExpiries?.[
                                                              activeProgram
                                                            ] || "No Expiry"}
                                                          </span>
                                                        </div>
                                                      </div>

                                                      <div className="p-3 bg-zinc-900/65 rounded-lg space-y-3 border border-zinc-800">
                                                        <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                                                          Enrollment Status
                                                          Checks
                                                        </span>
                                                        <div className="grid grid-cols-1 gap-2">
                                                          <label className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800 cursor-pointer select-none">
                                                            <input
                                                              type="checkbox"
                                                              checked={
                                                                !!student.creditCardOnFile
                                                              }
                                                              onChange={(e) => {
                                                                onUpdateStudent(
                                                                  {
                                                                    ...student,
                                                                    creditCardOnFile:
                                                                      e.target
                                                                        .checked,
                                                                  },
                                                                );
                                                              }}
                                                              className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-650"
                                                            />
                                                            <span className="text-[10px] font-bold text-zinc-300">
                                                              Credit Card On
                                                              File
                                                            </span>
                                                          </label>

                                                          {activeProgram ===
                                                            "karate" && (
                                                            <label className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800 cursor-pointer select-none">
                                                              <input
                                                                type="checkbox"
                                                                checked={
                                                                  !!student.attendanceCardCreated
                                                                }
                                                                onChange={(
                                                                  e,
                                                                ) => {
                                                                  onUpdateStudent(
                                                                    {
                                                                      ...student,
                                                                      attendanceCardCreated:
                                                                        e.target
                                                                          .checked,
                                                                    },
                                                                  );
                                                                }}
                                                                className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-650"
                                                              />
                                                              <span className="text-[10px] font-bold text-zinc-300">
                                                                Physical
                                                                Attendance Card
                                                                Created
                                                              </span>
                                                            </label>
                                                          )}

                                                          <label className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800 cursor-pointer select-none">
                                                            <input
                                                              type="checkbox"
                                                              checked={
                                                                !!student.photoReleaseSigned
                                                              }
                                                              onChange={(e) => {
                                                                onUpdateStudent(
                                                                  {
                                                                    ...student,
                                                                    photoReleaseSigned:
                                                                      e.target
                                                                        .checked,
                                                                  },
                                                                );
                                                              }}
                                                              className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-650"
                                                            />
                                                            <span className="text-[10px] font-bold text-zinc-300">
                                                              Photo Release
                                                              Signed
                                                            </span>
                                                          </label>
                                                        </div>
                                                      </div>



                                                      <div className="pt-2 flex items-center justify-between border-t border-zinc-800">
                                                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                                                          <MapPin className="w-3 h-3 text-red-500" />{" "}
                                                          {student.location ||
                                                            "West Chester"}
                                                        </span>
                                                        <div className="flex gap-2">
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              setNoteModalStudent(
                                                                student,
                                                              );
                                                            }}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] font-black text-zinc-200 uppercase transition"
                                                          >
                                                            <FileText className="w-3.5 h-3.5" />{" "}
                                                            Notes
                                                          </button>
      <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                onEditStudent(
                                                                  student,
                                                                );
                                                              }}
                                                              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-[10px] font-black text-zinc-200 uppercase transition"
                                                            >
                                                              <Edit3 className="w-3.5 h-3.5" />{" "}
                                                              Edit
                                                            </button>
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDeleteStudent(
                                                                  student.id,
                                                                );
                                                              }}
                                                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-900 border border-red-900/50 rounded text-[10px] font-black text-red-400 uppercase transition"
                                                            >
                                                              <Trash2 className="w-3.5 h-3.5" />{" "}
                                                              Delete
                                                            </button>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <div className="space-y-4">
                                                      {/* Attendance details expanded view */}
                                                      <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                          <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                                                            Current Ranks
                                                          </span>
                                                          <div className="flex flex-col gap-1.5">
                                                            {visiblePrograms.map(
                                                              (prog) => {
                                                                if (prog === 'kobudo' && student.kobudoWeapons && student.kobudoWeapons.length > 0) {
                                                                  return student.kobudoWeapons.map((weapon) => {
                                                                    const rawId = weapon === 'Bo' ? student.kobudoRankings?.bo : student.kobudoRankings?.sai;
                                                                    const rId = normalizeKobudoRankId(rawId);
                                                                    const rank = KOBUDO_RANKS.find((r) => r.id === rId) || KOBUDO_RANKS[0];
                                                                    return (
                                                                      <div key={weapon} className="flex items-center gap-1">
                                                                        <span className="text-[8px] font-black text-zinc-400 uppercase">{weapon}:</span>
                                                                        <BeltPreview
                                                                          rank={rank}
                                                                          size="sm"
                                                                          showLabel={true}
                                                                          stackedOnMobile={true}
                                                                        />
                                                                      </div>
                                                                    );
                                                                  });
                                                                }

                                                                const curRankId = getStudentRankId(student, prog);
                                                                const rankList = prog === 'karate' ? KARATE_RANKS : prog === 'tots' ? TOTS_RANKS : KOBUDO_RANKS;
                                                                const currentBelt = rankList.find((r) => r.id === curRankId) || rankList[0];
                                                                return (
                                                                  <BeltPreview
                                                                    key={prog}
                                                                    rank={currentBelt}
                                                                    size="sm"
                                                                    showLabel={true}
                                                                    stackedOnMobile={true}
                                                                  />
                                                                );
                                                              },
                                                            )}
                                                          </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                          <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                                                            Promoting To
                                                          </span>
                                                          <div className="flex flex-col gap-1.5">
                                                            {visiblePrograms.map(
                                                              (prog) => {
                                                                if (prog === 'kobudo' && student.kobudoWeapons && student.kobudoWeapons.length > 0) {
                                                                  return student.kobudoWeapons.map((weapon) => {
                                                                    const rawId = weapon === 'Bo' ? student.kobudoRankings?.bo : student.kobudoRankings?.sai;
                                                                    const rId = normalizeKobudoRankId(rawId);
                                                                    const next = getNextRank('kobudo', rId);
                                                                    return next ? (
                                                                      <div key={weapon} className="flex items-center gap-1">
                                                                        <span className="text-[8px] font-black text-zinc-400 uppercase">{weapon}:</span>
                                                                        <BeltPreview
                                                                          rank={next}
                                                                          size="sm"
                                                                          showLabel={true}
                                                                          stackedOnMobile={true}
                                                                        />
                                                                      </div>
                                                                    ) : (
                                                                      <span
                                                                        key={weapon}
                                                                        className="text-zinc-500 italic text-[10px]"
                                                                      >
                                                                        Max Rank ({weapon})
                                                                      </span>
                                                                    );
                                                                  });
                                                                }

                                                                const next = getNextRank(
                                                                  prog,
                                                                  getStudentRankId(student, prog),
                                                                );
                                                                return next ? (
                                                                  <BeltPreview
                                                                    key={prog}
                                                                    rank={next}
                                                                    size="sm"
                                                                    showLabel={true}
                                                                    stackedOnMobile={true}
                                                                  />
                                                                ) : (
                                                                  <span
                                                                    key={prog}
                                                                    className="text-zinc-500 italic text-[10px]"
                                                                  >
                                                                    Max Rank ({prog})
                                                                  </span>
                                                                );
                                                              },
                                                            )}
                                                          </div>
                                                        </div>
                                                      </div>

                                                      <div className="space-y-2 border-t border-zinc-800 pt-2">
                                                        <div className="flex items-center justify-between">
                                                          <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                                                            Attendance Progress
                                                          </span>
                                                          {student.lastAttendanceUpdate && (
                                                            <span className="text-[9px] text-zinc-400 font-mono">
                                                              Last attendance: <strong className="text-emerald-400">{student.lastAttendanceUpdate}</strong>
                                                            </span>
                                                          )}
                                                        </div>
                                                        <div className="space-y-3">
                                                          {visiblePrograms.map(
                                                            (prog) => {
                                                              const progElig =
                                                                student
                                                                  .eligibilityByProgram?.[
                                                                  prog
                                                                ] || {
                                                                  eligible: false,
                                                                  classesActual: 0,
                                                                  classesRequired: 16,
                                                                };
                                                              const progress =
                                                                Math.min(
                                                                  100,
                                                                  Math.round(
                                                                    (progElig.classesActual /
                                                                      progElig.classesRequired) *
                                                                      100,
                                                                  ),
                                                                );
                                                              const override = getProgramOverride(student, prog as any);

                                                              const isTestingLocked =
                                                                !!testingLock;
                                                              const isProgramInThisTest =
                                                                isTestingLocked &&
                                                                testingLock.studentIds.includes(
                                                                  student.id,
                                                                ) &&
                                                                (prog !== "kobudo" || !!progElig.eligible);
                                                              const isOrangeEligible =
                                                                isTestingLocked &&
                                                                progElig.eligible &&
                                                                !isProgramInThisTest &&
                                                                override !==
                                                                  "eligible";
                                                              const isEffectiveEligible =
                                                                override ===
                                                                "eligible"
                                                                  ? true
                                                                  : override ===
                                                                      "ineligible"
                                                                    ? false
                                                                    : isTestingLocked
                                                                      ? isProgramInThisTest && progElig.eligible
                                                                      : progElig.eligible;

                                                              let barColorClass =
                                                                progElig.isProvisional
                                                                  ? "bg-[#8cc34a]"
                                                                  : isEffectiveEligible
                                                                    ? "bg-green-600"
                                                                    : "bg-red-700";
                                                              if (
                                                                isOrangeEligible
                                                              )
                                                                barColorClass =
                                                                  "bg-orange-500";

                                                              return (
                                                                <div
                                                                  key={prog}
                                                                  className="space-y-1.5"
                                                                  onClick={(
                                                                    e,
                                                                  ) =>
                                                                    e.stopPropagation()
                                                                  }
                                                                >
                                                                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
                                                                    <div className="flex items-center gap-2">
                                                                      {isProgramInThisTest && (
                                                                        <Check className="w-3 h-3 text-white" />
                                                                      )}
                                                                      <span className="font-black text-zinc-300 uppercase">
                                                                        {prog}
                                                                      </span>
                                                                      <input
                                                                        type="number"
                                                                        min="0"
                                                                        max="999"
                                                                        aria-label={`${student.name} ${prog} expanded attendance`}
                                                                        value={
                                                                          progElig.classesActual
                                                                        }
                                                                        onChange={(
                                                                          e,
                                                                        ) => {
                                                                          const val =
                                                                            Math.max(
                                                                              0,
                                                                              parseInt(
                                                                                e
                                                                                  .target
                                                                                  .value,
                                                                              ) ||
                                                                                0,
                                                                            );
                                                                          const nextAttendance =
                                                                            {
                                                                              ...(student.attendance ||
                                                                                {}),
                                                                            };
                                                                          nextAttendance[
                                                                            prog
                                                                          ] =
                                                                            val;
                                                                          const todayStr = new Date().toLocaleDateString("en-CA");
                                                                          onUpdateStudent(
                                                                            {
                                                                              ...student,
                                                                              attendance:
                                                                                nextAttendance,
                                                                              lastAttendanceUpdate: todayStr,
                                                                              lastIncrementDateByProgram: {
                                                                                ...(student.lastIncrementDateByProgram || {}),
                                                                                [prog]: todayStr,
                                                                              },
                                                                            },
                                                                          );
                                                                        }}
                                                                        onKeyDown={(
                                                                          e,
                                                                        ) => {
                                                                          if (
                                                                            e.key ===
                                                                            "Enter"
                                                                          ) {
                                                                            e.currentTarget.blur();
                                                                          }
                                                                        }}
                                                                        onFocus={(
                                                                          e,
                                                                        ) =>
                                                                          e.target.select()
                                                                        }
                                                                        className={`w-10 h-5 text-center bg-zinc-950 border border-zinc-800 focus:border-red-500 hover:border-zinc-700 rounded text-[11px] font-mono font-black focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-text inline-block ${
                                                                          isOrangeEligible
                                                                            ? "text-orange-400"
                                                                            : progElig.isProvisional
                                                                              ? "text-[#addf68]"
                                                                              : isEffectiveEligible
                                                                                ? "text-emerald-400 font-bold"
                                                                                : override === "ineligible"
                                                                                  ? "text-red-400"
                                                                                  : "text-zinc-200"
                                                                        }`}
                                                                      />
                                                                      <span className="text-zinc-600 font-black text-[9px]">
                                                                        /
                                                                      </span>
                                                                      <span className={`text-[10px] ${
                                                                        isOrangeEligible
                                                                          ? "text-orange-400/80 font-bold"
                                                                          : progElig.isProvisional
                                                                            ? "text-[#addf68]/80 font-bold"
                                                                            : isEffectiveEligible
                                                                              ? "text-emerald-400/80 font-bold"
                                                                              : "text-zinc-500 font-medium"
                                                                      }`}>
                                                                        {progElig.classesRequired ===
                                                                        9999
                                                                          ? "∞"
                                                                          : progElig.classesRequired}
                                                                      </span>
                                                                      {isOrangeEligible && (
                                                                        <span className="text-orange-500 text-[9px] font-black uppercase tracking-wider ml-2">
                                                                          Eligible
                                                                          Later
                                                                        </span>
                                                                      )}
                                                                    </div>
                                                                    <div className="flex items-center gap-3">
                                                                      {student
                                                                        .lastIncrementDateByProgram?.[
                                                                        prog
                                                                      ] !==
                                                                        new Date().toLocaleDateString(
                                                                          "en-CA",
                                                                        ) && (
                                                                        <button
                                                                          onClick={(
                                                                            e,
                                                                          ) => {
                                                                            e.stopPropagation();
                                                                            handleAddClassAttendance(
                                                                              student,
                                                                              prog,
                                                                            );
                                                                          }}
                                                                          className="h-6 px-2 bg-zinc-800 hover:bg-zinc-700 rounded text-[10px] font-black text-zinc-100 flex items-center justify-center uppercase"
                                                                        >
                                                                          + Add
                                                                          Class
                                                                        </button>
                                                                      )}
                                                                      <button
                                                                        type="button"
                                                                        onClick={(
                                                                          e,
                                                                        ) => {
                                                                          e.stopPropagation();
                                                                          const newlyInactive =
                                                                            !(
                                                                              student as any
                                                                            )
                                                                              .isInactive;
                                                                          const todayStr = new Date().toLocaleDateString("en-CA");
                                                                          const updatedData: any = {
                                                                            ...student,
                                                                            inactive: newlyInactive,
                                                                          };
                                                                          if (!newlyInactive) {
                                                                            updatedData.lastAttendanceUpdate = todayStr;
                                                                            updatedData.lastIncrementDateByProgram = {
                                                                              ...(student.lastIncrementDateByProgram || {}),
                                                                              [prog]: todayStr,
                                                                            };
                                                                          }
                                                                          onUpdateStudent(updatedData);
                                                                        }}
                                                                        className={`h-6 px-1.5 sm:px-2 rounded border text-[9px] sm:text-[10px] font-black uppercase transition select-none cursor-pointer flex items-center justify-center leading-none mr-2 ${
                                                                          (
                                                                            student as any
                                                                          )
                                                                            .isInactive
                                                                            ? "bg-emerald-950/40 hover:bg-emerald-900 border-emerald-900/30 text-emerald-400 font-bold"
                                                                            : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-100"
                                                                        }`}
                                                                        title={
                                                                          (
                                                                            student as any
                                                                          )
                                                                            .isInactive
                                                                            ? "Mark student as Active"
                                                                            : "Mark student as Inactive"
                                                                        }
                                                                      >
                                                                        {(
                                                                          student as any
                                                                        )
                                                                          .isInactive
                                                                          ? "Mark Active"
                                                                          : "Mark Inactive"}
                                                                      </button>
                                                                      <button
                                                                        onClick={(
                                                                          e,
                                                                        ) => {
                                                                          e.stopPropagation();
                                                                          onCycleOverride(
                                                                            student.id,
                                                                            prog,
                                                                          );
                                                                        }}
                                                                        className="text-[9px] text-red-500 font-bold uppercase transition border border-red-900/40 px-1.5 py-0.5 rounded bg-red-950/10 cursor-pointer"
                                                                      >
                                                                        {override ===
                                                                          "eligible" &&
                                                                          "🟢 Forced OK"}
                                                                        {override ===
                                                                          "ineligible" &&
                                                                          "🔴 Forced NO"}
                                                                        {(override ===
                                                                          undefined ||
                                                                          override ===
                                                                            null) &&
                                                                          "⚙️ Override"}
                                                                      </button>
                                                                    </div>
                                                                  </div>
                                                                  <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden">
                                                                    <div
                                                                      className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
                                                                      style={{
                                                                        width: `${progress}%`,
                                                                      }}
                                                                    />
                                                                  </div>
                                                                </div>
                                                              );
                                                            },
                                                          )}
                                                        </div>
                                                      </div>

                                                      <div
                                                        className="pt-2 flex flex-col gap-3 border-t border-zinc-800"
                                                        onClick={(e) =>
                                                          e.stopPropagation()
                                                        }
                                                      >
                                                        <div className="flex items-center justify-between">
                                                          <div className="flex flex-col gap-1">
                                                            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                                                              <MapPin className="w-3 h-3 text-red-500" />{" "}
                                                              {student.location ||
                                                                "West Chester"}
                                                            </span>
                                                            {student.notes && (
                                                              <span className="text-[10px] italic text-zinc-400">
                                                                "{student.notes}
                                                                "
                                                              </span>
                                                            )}
                                                          </div>
                                                          <div className="flex gap-2">
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                setNoteModalStudent(
                                                                  student,
                                                                );
                                                              }}
                                                              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-800 rounded text-[10px] font-black text-zinc-200 uppercase transition"
                                                            >
                                                              <FileText className="w-3.5 h-3.5" />{" "}
                                                              Notes
                                                            </button>
                                                            {userRole !== "Instructor" && (
    <>
      <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                onEditStudent(
                                                                  student,
                                                                );
                                                              }}
                                                              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-800 rounded text-[10px] font-black text-zinc-200 uppercase transition"
                                                            >
                                                              <Edit3 className="w-3.5 h-3.5" />{" "}
                                                              Edit
                                                            </button>
                                                            <button
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                onDeleteStudent(
                                                                  student.id,
                                                                );
                                                              }}
                                                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-955/30 hover:bg-red-900 border border-red-900/50 rounded text-[10px] font-black text-red-400 uppercase transition"
                                                            >
                                                              <Trash2 className="w-3.5 h-3.5" />{" "}
                                                              Delete
                                                            </button>
    </>
  )}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  )}
                                                </td>
                                              </tr>
                                            )}
                                          </React.Fragment>
                                        );
                                      },
                                    )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Touch Cards View (Rendered on phones < 640px) */}
                      <div className="block sm:hidden divide-y divide-zinc-800/80 bg-zinc-950/60">
                        {sortedSubsections.map((subName) => {
                          const subStudents = subsectionMap[subName];
                          if (!subStudents || subStudents.length === 0) return null;
                          const isSubMinimized = minimizedSubsections.includes(`${loc}_${subName}`);
                          const isLive = checkIfClassCurrentlyRunning(subName, subStudents);

                          return (
                            <div key={`m_sub_${loc}_${subName}`} className="border-b border-zinc-800 last:border-b-0">
                              {/* Subsection Header */}
                              <div
                                onClick={() => toggleMinimizeSub(loc, subName)}
                                className={`p-3 flex items-center justify-between cursor-pointer select-none transition ${
                                  isLive
                                    ? 'bg-gradient-to-r from-emerald-950/60 via-emerald-950/30 to-zinc-950 border-l-4 border-l-emerald-500'
                                    : 'bg-zinc-950 hover:bg-zinc-900 border-l-2 border-l-zinc-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900 cursor-pointer"
                                    checked={isSubAllChecked(subStudents)}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => handleSubSelectToggle(subStudents)}
                                  />
                                  {isSubMinimized ? (
                                    <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                                  )}
                                  <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-black uppercase tracking-wide ${isLive ? 'text-emerald-400' : 'text-zinc-200'}`}>
                                        {formatSubsectionTitle(subName, loc)}
                                      </span>
                                      {isLive && (
                                        <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 animate-pulse">
                                          LIVE
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-zinc-400 font-medium">
                                      {Array.from(new Set(subStudents.map(({ program }) => program === 'karate' ? 'Karate' : program === 'tots' ? 'Tots' : 'Kobudo'))).join(', ')}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                                  {subStudents.length}
                                </span>
                              </div>

                              {/* Concise Student List Format */}
                              {!isSubMinimized && (
                                <div className="p-2 space-y-1.5">
                                  {subStudents.map(({ student, program: activeProgram }) => {
                                    const studentRowKey = `${student.id}_${activeProgram}`;
                                    const curRankId = getStudentRankId(student, activeProgram);
                                    const rankList = activeProgram === 'karate' ? KARATE_RANKS : activeProgram === 'tots' ? TOTS_RANKS : KOBUDO_RANKS;
                                    const currentBelt = rankList.find((r) => r.id === curRankId) || rankList[0];
                                    const progElig = student.eligibilityByProgram?.[activeProgram] || {
                                      eligible: false,
                                      classesActual: 0,
                                      classesRequired: 16
                                    };
                                    const override = getProgramOverride(student, activeProgram as any);
                                    const isEffectiveEligible = override === "eligible" ? true : override === "ineligible" ? false : progElig.eligible;
                                    const isOrangeEligible = !isEffectiveEligible && progElig.isOrangeStripEligible;

                                    return (
                                      <div
                                        key={`m_item_${student.id}_${activeProgram}`}
                                        onClick={() => {
                                          setMobileCardTarget({ studentId: student.id, program: activeProgram });
                                          setShowFullDetails(false);
                                        }}
                                        className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer select-none active:scale-[0.99] ${
                                          student.inactive
                                            ? 'bg-zinc-950/50 border-zinc-900 opacity-60'
                                            : 'bg-zinc-900/70 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
                                        }`}
                                      >
                                        <div className="flex items-center gap-3 min-w-0">
                                          <div onClick={(e) => e.stopPropagation()}>
                                            <input
                                              type="checkbox"
                                              className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600 cursor-pointer"
                                              checked={selectedIds.has(studentRowKey)}
                                              onChange={() => toggleSelectOne(student.id, activeProgram)}
                                            />
                                          </div>
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                              <span className="font-black text-sm text-zinc-100 truncate">
                                                {student.name}
                                              </span>
                                              {student.inactive && (
                                                <span className="text-[8px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded leading-none">
                                                  Inactive
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex flex-col mt-0.5">
                                              <span className="text-[11px] font-bold text-zinc-300">
                                                {currentBelt?.name || 'White Belt'}
                                              </span>
                                              <span className={`text-[10px] ${
                                                isOrangeEligible
                                                  ? "text-orange-400 font-bold"
                                                  : progElig.isProvisional
                                                    ? "text-[#addf68] font-bold"
                                                    : isEffectiveEligible
                                                      ? "text-emerald-400 font-bold"
                                                      : override === "ineligible"
                                                        ? "text-red-400 font-bold"
                                                        : "text-zinc-400 font-medium"
                                              }`}>
                                                {progElig.classesActual} / {progElig.classesRequired === 9999 ? '∞' : progElig.classesRequired} classes
                                              </span>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                          <BeltPreview rank={currentBelt} size="sm" showLabel={false} />
                                          <ChevronRight className="w-4 h-4 text-zinc-500" />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            });
            })()}
          </div>
        )}
      </div>

      {/* Floating Action Button & Speed Dial System (All viewports, hidden on print) */}
      <div className="print:hidden">
        {/* State 1: When NO students are selected -> Standard Add/Update/Quick Attendance Speed Dial */}
        {selectedIds.size === 0 && (
          <>
            {/* Backdrop overlay when speed dial is open */}
            {isSpeedDialOpen && (
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 animate-in fade-in duration-200"
                onClick={() => setIsSpeedDialOpen(false)}
              />
            )}

            {/* Speed Dial Action Items */}
            <div
              className={`fixed bottom-20 right-5 z-40 flex flex-col items-end gap-2.5 transition-all duration-300 ${
                isSpeedDialOpen
                  ? "opacity-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 translate-y-4 pointer-events-none"
              }`}
            >
              {/* Action 1: Add Student */}
              {userRole !== "Instructor" && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSpeedDialOpen(false);
                    onAddClick(
                      filterLocation === "all" ? "West Chester" : filterLocation,
                      filterProgram === "all" ? "karate" : filterProgram,
                    );
                  }}
                  className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-red-500/50 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer"
                >
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-100 whitespace-nowrap">
                    Add Student
                  </span>
                  <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-md">
                    <Plus className="w-4 h-4" />
                  </div>
                </button>
              )}

              {/* Action 2: Update Details */}
              {userRole !== "Instructor" && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSpeedDialOpen(false);
                    setUpdateDetailsInitialMode(
                      viewMode === "enrollment" ? "enrollment" : "attendance",
                    );
                    setIsUpdateDetailsModalOpen(true);
                  }}
                  className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-amber-500/50 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer"
                >
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-100 whitespace-nowrap">
                    Update Details
                  </span>
                  <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-md">
                    <Edit3 className="w-4 h-4" />
                  </div>
                </button>
              )}

              {/* Action 3: Quick Attendance */}
              <button
                type="button"
                onClick={() => {
                  setIsSpeedDialOpen(false);
                  setIsQuickAttendanceOpen(true);
                }}
                className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-emerald-500/50 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer"
              >
                <span className="text-xs font-black uppercase tracking-wider text-zinc-100 whitespace-nowrap">
                  Quick Attendance
                </span>
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </button>
            </div>

            {/* Main Speed Dial Add FAB Button */}
            <button
              type="button"
              onClick={() => setIsSpeedDialOpen(!isSpeedDialOpen)}
              aria-label="Quick Actions Speed Dial"
              className="fixed bottom-5 right-5 z-40 w-13 h-13 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-2xl shadow-red-950/80 border-2 border-red-500/40 flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
              title="Add & Quick Actions"
            >
              <Plus
                className={`w-6 h-6 transition-transform duration-300 ${isSpeedDialOpen ? "rotate-45" : "rotate-0"}`}
              />
            </button>
          </>
        )}

        {/* State 2: When students ARE selected -> Regular Add FAB disappears, Bulk Actions Speed Dial appears! */}
        {selectedIds.size > 0 && (
          <>
            {/* Backdrop overlay when bulk action menu is open */}
            {isBulkActionMenuOpen && (
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 animate-in fade-in duration-200"
                onClick={() => setIsBulkActionMenuOpen(false)}
              />
            )}

            {/* Bulk Speed Dial Menu Items */}
            <div
              className={`fixed bottom-20 right-5 z-40 flex flex-col items-end gap-2.5 transition-all duration-300 ${
                isBulkActionMenuOpen
                  ? "opacity-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 translate-y-4 pointer-events-none"
              }`}
            >
              {/* Option 1: Attendance +1 */}
              <button
                type="button"
                onClick={() => handleBulkAttendance(1)}
                className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-emerald-500/50 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer group"
              >
                <span className="text-xs font-black uppercase tracking-wider text-zinc-100 group-hover:text-emerald-400 whitespace-nowrap">
                  +1 Class Attendance
                </span>
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Plus className="w-4 h-4" />
                </div>
              </button>

              {/* Option 2: Attendance -1 */}
              {userRole !== "Instructor" && (
                <button
                  type="button"
                  onClick={() => handleBulkAttendance(-1)}
                  className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-zinc-500 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer group"
                >
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-100 whitespace-nowrap">
                    -1 Class Attendance
                  </span>
                  <div className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-200 flex items-center justify-center shrink-0 shadow-md">
                    <Minus className="w-4 h-4" />
                  </div>
                </button>
              )}

              {/* Option 3: Force Eligible */}
              <button
                type="button"
                onClick={() => handleBulkOverride("eligible")}
                className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-emerald-500/50 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer group"
              >
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 whitespace-nowrap">
                  Force Eligible for Exam
                </span>
                <div className="w-8 h-8 rounded-full bg-emerald-950 border border-emerald-600 text-emerald-400 flex items-center justify-center shrink-0 shadow-md">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </button>

              {/* Option 4: Force Ineligible */}
              <button
                type="button"
                onClick={() => handleBulkOverride("ineligible")}
                className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-red-500/50 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer group"
              >
                <span className="text-xs font-black uppercase tracking-wider text-red-400 whitespace-nowrap">
                  Force Ineligible for Exam
                </span>
                <div className="w-8 h-8 rounded-full bg-red-950 border border-red-600 text-red-400 flex items-center justify-center shrink-0 shadow-md">
                  <XCircle className="w-4 h-4" />
                </div>
              </button>

              {/* Option 5: Clear Testing Override */}
              <button
                type="button"
                onClick={() => handleBulkOverride(null)}
                className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-zinc-500 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer group"
              >
                <span className="text-xs font-black uppercase tracking-wider text-zinc-300 whitespace-nowrap">
                  Clear Testing Overrides
                </span>
                <div className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center shrink-0 shadow-md">
                  <Undo2 className="w-4 h-4" />
                </div>
              </button>

              {/* Option 6: Toggle Active / Inactive */}
              {userRole !== "Instructor" && (
                <button
                  type="button"
                  onClick={() => handleBulkToggleActive()}
                  className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-amber-500/50 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer group"
                >
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 whitespace-nowrap">
                    Toggle Active / Inactive
                  </span>
                  <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-md">
                    <User className="w-4 h-4" />
                  </div>
                </button>
              )}

              {/* Option 7: Print Selected */}
              <button
                type="button"
                onClick={() => {
                  setIsBulkActionMenuOpen(false);
                  if (viewMode === "enrollment") {
                    const selectedStudentIds = Array.from(selectedIds).map(
                      (key) => key.split("_")[0],
                    );
                    const uniqueSelectedStudentIds = Array.from(
                      new Set(selectedStudentIds),
                    );
                    const selectedStudentsToPrint = students.filter((s) =>
                      uniqueSelectedStudentIds.includes(s.id),
                    );
                    const combinedNotes = selectedStudentsToPrint
                      .map((s) => s.notes)
                      .filter(Boolean)
                      .join("; ");
                    setEnrollmentPrintStudents(selectedStudentsToPrint);
                    setEnrollmentPrintNotes(combinedNotes);
                    setPrintMode("enrollment_sheet");
                  } else {
                    handleBulkPrintQueue();
                  }
                }}
                className="flex items-center gap-2.5 bg-zinc-900/95 border border-zinc-700/80 hover:border-blue-500/50 px-3.5 py-2 rounded-full shadow-2xl active:scale-95 transition cursor-pointer group"
              >
                <span className="text-xs font-black uppercase tracking-wider text-blue-400 whitespace-nowrap">
                  {viewMode === "enrollment"
                    ? "Print Enrollment Sheets"
                    : "Print Barcodes / Cards"}
                </span>
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Printer className="w-4 h-4" />
                </div>
              </button>
            </div>

            {/* Bulk Actions FAB Button in bottom right corner */}
            <button
              type="button"
              onClick={() => setIsBulkActionMenuOpen(!isBulkActionMenuOpen)}
              aria-label="Bulk Actions Speed Dial"
              className="fixed bottom-5 right-5 z-40 w-13 h-13 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-2xl shadow-red-950/80 border-2 border-red-500/40 flex items-center justify-center active:scale-95 transition-transform cursor-pointer relative"
              title="Bulk Actions"
            >
              <span className="absolute -top-1 -left-1 bg-amber-400 text-zinc-950 font-black text-[10px] px-1.5 py-0.2 rounded-full shadow-lg ring-2 ring-zinc-950 font-mono leading-none">
                {selectedIds.size}
              </span>
              <Sparkles
                className={`w-6 h-6 transition-transform duration-300 ${isBulkActionMenuOpen ? "rotate-45" : "rotate-0"}`}
              />
            </button>
          </>
        )}
      </div>

      {/* Printable Class Roster Sheet (Only visible on print) */}
      {printRosterClasses && printRosterClasses.length > 0 && (
        <div className="hidden print:block bg-white text-black font-sans w-full p-0 m-0">
          <style
            dangerouslySetInnerHTML={{
              __html: `
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
            html, body, #root, main {
              background: white !important;
              color: black !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              height: auto !important;
            }
            thead {
              display: table-header-group !important;
            }
            tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .print-roster-sheet {
              width: 11.0in !important;
              height: 8.5in !important;
              max-width: 11.0in !important;
              max-height: 8.5in !important;
              box-sizing: border-box !important;
              padding: 0.4in 0.5in !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-after: always !important;
              break-after: page !important;
              overflow: hidden !important;
            }
            .print-roster-sheet:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
            .print-roster-sheet tr td {
              padding-top: 0px !important;
              padding-bottom: 0px !important;
              padding-left: 8px !important;
              padding-right: 8px !important;
              font-size: 11px !important;
              height: 27px !important;
              vertical-align: middle !important;
              border: 1px solid rgb(209, 213, 219) !important;
            }
            .print-roster-sheet tr th {
              padding-top: 4px !important;
              padding-bottom: 4px !important;
              padding-left: 8px !important;
              padding-right: 8px !important;
              font-size: 11px !important;
              border: 1px solid rgb(156, 163, 175) !important;
            }
          }
        `,
            }}
          />
          {(() => {
            const chunkArray = <T,>(arr: T[], size: number): T[][] => {
              const chunks: T[][] = [];
              for (let i = 0; i < arr.length; i += size) {
                chunks.push(arr.slice(i, i + size));
              }
              return chunks;
            };

            const pages: {
              location: string;
              name: string;
              totalStudents: number;
              currentPage: number;
              totalPages: number;
              students: { student: Student; program: string }[];
            }[] = [];

            printRosterClasses.forEach((rosterClass) => {
              const sortedStudents = [...rosterClass.students].sort((a, b) => {
                const getRankIndex = (row: { student: Student; program: string }) => {
                  const { student, program } = row;
                  const rankList =
                    program === "karate"
                      ? KARATE_RANKS
                      : program === "tots"
                        ? TOTS_RANKS
                        : KOBUDO_RANKS;
                  const currentRankId = student.rankings?.[program] || "white";
                  const rankObj = rankList.find(
                    (r) =>
                      r.id === currentRankId ||
                      r.name === currentRankId,
                  ) || rankList[0];
                  return rankList.indexOf(rankObj);
                };

                const rankA = getRankIndex(a);
                const rankB = getRankIndex(b);

                if (rankA !== rankB) {
                  return rankA - rankB;
                }
                return a.student.name.localeCompare(b.student.name);
              });

              const chunks = chunkArray(sortedStudents, 15);
              if (chunks.length === 0) {
                pages.push({
                  location: rosterClass.location,
                  name: rosterClass.name,
                  totalStudents: 0,
                  currentPage: 1,
                  totalPages: 1,
                  students: [],
                });
              } else {
                chunks.forEach((chunk, chunkIdx) => {
                  pages.push({
                    location: rosterClass.location,
                    name: rosterClass.name,
                    totalStudents: rosterClass.students.length,
                    currentPage: chunkIdx + 1,
                    totalPages: chunks.length,
                    students: chunk,
                  });
                });
              }
            });

            return pages.map((page, pageIdx) => {
              const isTotsClass = page.name.toLowerCase().includes("tots") || page.students.some(s => s.program === "tots");
              const hasAttendanceBoxes = isTotsClass;

              return (
                <div
                  key={`${page.location}_${page.name}_page_${page.currentPage}_${pageIdx}`}
                  className="print-roster-sheet"
                >
                  <table className="w-full text-left border-collapse border-none text-xs text-black">
                    <thead className="table-header-group break-inside-avoid">
                      <tr>
                        <th
                          colSpan={hasAttendanceBoxes ? 6 : 5}
                          className="p-0 border-none bg-white font-normal text-left"
                        >
                          <div className="border-b-[3px] border-zinc-950 pb-2 mb-2 flex justify-between items-end">
                            <div className="flex items-center gap-4">
                              <DojoLogo
                                size={60}
                                className="border-zinc-950 shadow-none ring-0 p-0"
                              />
                              <div>
                                <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-950">
                                  Buckner Martial Arts
                                </h1>
                                <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest leading-none mt-1">
                                  {page.location} Dojo
                                </h2>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-extrabold text-zinc-950 uppercase tracking-tight leading-none">
                                {page.name.includes(" - ") ? (
                                  <>
                                    {page.name.split(" - ")[0]}
                                    {page.totalPages > 1 && (
                                      <span className="text-xs font-black text-zinc-400 ml-2">
                                        (Page {page.currentPage} of {page.totalPages})
                                      </span>
                                    )}
                                    <br />
                                    <span className="text-xs font-bold text-zinc-500 mt-1 block">
                                      {page.name
                                        .split(" - ")
                                        .slice(1)
                                        .join(" - ")}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    {page.name}
                                    {page.totalPages > 1 && (
                                      <span className="text-xs font-black text-zinc-400 ml-2">
                                        (Page {page.currentPage} of {page.totalPages})
                                      </span>
                                    )}
                                  </>
                                )}
                              </p>
                              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1.5">
                                Printed:{" "}
                                {new Date().toLocaleDateString("en-US", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-2 mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600 bg-zinc-50 py-1.5 px-3 rounded border border-zinc-200">
                            <div>
                              <span className="text-zinc-400 block text-[8px] font-black">
                                Total Active Students:
                              </span>
                              <span className="text-zinc-950 text-xs font-black">
                                {page.totalStudents} Enrolled {page.totalPages > 1 && `(Page ${page.currentPage} / ${page.totalPages})`}
                              </span>
                            </div>
                          </div>
                        </th>
                      </tr>
                      <tr className="bg-zinc-100 border-b-2 border-zinc-400 text-zinc-800">
                        <th className="px-3 py-2.5 border border-zinc-400 font-black uppercase tracking-wider w-8 min-w-[32px] text-center text-zinc-700">
                          #
                        </th>
                        <th className={`px-3 py-2.5 border border-zinc-400 font-black uppercase tracking-wider text-zinc-700 ${hasAttendanceBoxes ? 'w-[160px]' : 'w-[240px] min-w-[200px]'}`}>
                          Student Name
                        </th>
                        <th className={`px-3 py-2.5 border border-zinc-400 font-black uppercase tracking-wider text-center text-zinc-700 ${hasAttendanceBoxes ? 'w-32' : 'w-44 min-w-[150px]'}`}>
                          Current / Next Rank
                        </th>
                        <th className={`px-3 py-2.5 border border-zinc-400 font-black uppercase tracking-wider text-center text-zinc-700 ${hasAttendanceBoxes ? 'w-36' : 'w-44 min-w-[140px]'}`}>
                          Agreement Expiration
                        </th>
                        {hasAttendanceBoxes && (
                          <th className="px-3 py-2.5 border border-zinc-400 font-black uppercase tracking-wider text-center w-[280px] text-zinc-700">
                            Attendance (16 Classes)
                          </th>
                        )}
                        <th className={`px-3 py-2.5 border border-zinc-400 font-black uppercase tracking-wider text-center text-zinc-700 ${hasAttendanceBoxes ? 'w-[160px]' : 'min-w-[260px]'}`}>
                          Observations / Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-300">
                      {page.students.map((row, idx) => {
                        const { student, program } = row;
                        const rankList =
                          program === "karate"
                            ? KARATE_RANKS
                            : program === "tots"
                              ? TOTS_RANKS
                              : KOBUDO_RANKS;
                        const currentRankId = getStudentRankId(student, program as any);
                        const rankObj = rankList.find(
                          (r) =>
                            r.id === currentRankId ||
                            r.name === currentRankId,
                        ) || rankList[0];
                        const currentRankText = rankObj.kyuText || rankObj.name;

                        const nextRankObj = getNextRank(program as any, rankObj.id);
                        const nextRankText = nextRankObj
                          ? (nextRankObj.kyuText || nextRankObj.name)
                          : null;

                        const rawExpiration = student.enrollmentExpiries?.[program] || "";
                        const expiration = (rawExpiration && rawExpiration.toLowerCase().trim() !== "no expiry" && rawExpiration.toLowerCase().trim() !== "no expiration") ? rawExpiration : "";

                        const globalIdx = (page.currentPage - 1) * 15 + idx;
                        return (
                          <tr
                            key={`${student.id}_${program}`}
                            className="border-b border-zinc-300 hover:bg-zinc-50/50"
                          >
                            <td className="px-3 py-3 border border-zinc-300 font-bold text-center font-mono text-zinc-500">
                              {globalIdx + 1}
                            </td>
                            <td className={`px-3 py-3 border border-zinc-300 font-black text-zinc-950 uppercase tracking-tight ${hasAttendanceBoxes ? 'w-[160px] truncate' : 'w-[240px]'}`}>
                              {student.name}
                            </td>
                            <td className={`px-3 py-3 border border-zinc-300 font-black text-center text-[10px] text-zinc-800 ${hasAttendanceBoxes ? 'w-32' : 'w-44'}`}>
                              <div className="flex flex-col items-center justify-center leading-tight">
                                {program === "kobudo" && student.kobudoWeapons && student.kobudoWeapons.length > 0 ? (
                                  <div className="text-left font-black flex flex-col gap-1 w-full pl-1">
                                    {student.kobudoWeapons.includes("Bo") && (
                                      <div>
                                        <div className="text-amber-800">Bo: {(() => {
                                          const normId = normalizeKobudoRankId(student.kobudoRankings?.bo);
                                          const r = KOBUDO_RANKS.find(x => x.id === normId) || KOBUDO_RANKS[0];
                                          return r.kyuText || r.name;
                                        })()}</div>
                                        {(() => {
                                          const normId = normalizeKobudoRankId(student.kobudoRankings?.bo);
                                          const r = KOBUDO_RANKS.find(x => x.id === normId) || KOBUDO_RANKS[0];
                                          const next = getNextRank("kobudo", r.id);
                                          return next && next.id !== r.id ? (
                                            <div className="text-[8px] font-bold text-zinc-400">Next: {next.kyuText || next.name}</div>
                                          ) : null;
                                        })()}
                                      </div>
                                    )}
                                    {student.kobudoWeapons.includes("Sai") && (
                                      <div>
                                        <div className="text-blue-800">Sai: {(() => {
                                          const normId = normalizeKobudoRankId(student.kobudoRankings?.sai);
                                          const r = KOBUDO_RANKS.find(x => x.id === normId) || KOBUDO_RANKS[0];
                                          return r.kyuText || r.name;
                                        })()}</div>
                                        {(() => {
                                          const normId = normalizeKobudoRankId(student.kobudoRankings?.sai);
                                          const r = KOBUDO_RANKS.find(x => x.id === normId) || KOBUDO_RANKS[0];
                                          const next = getNextRank("kobudo", r.id);
                                          return next && next.id !== r.id ? (
                                            <div className="text-[8px] font-bold text-zinc-400">Next: {next.kyuText || next.name}</div>
                                          ) : null;
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <span className="font-extrabold text-zinc-950">{currentRankText}</span>
                                    {nextRankText && nextRankText !== currentRankText && (
                                      <span className="text-[9px] font-bold text-zinc-400 mt-0.5">
                                        Next: {nextRankText}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                            <td className={`px-3 py-3 border border-zinc-300 font-black text-center uppercase text-[10px] text-zinc-800 ${hasAttendanceBoxes ? 'w-36' : 'w-44'}`}>
                              {expiration}
                            </td>
                            {hasAttendanceBoxes && (
                              <td className="px-2 py-1.5 border border-zinc-300 w-[280px]">
                                <div className="w-full h-[22px] border border-zinc-400 flex bg-white rounded-[1px]">
                                  {Array.from({ length: 16 }).map((_, bIdx) => (
                                    <div
                                      key={bIdx}
                                      className={`flex-1 h-full ${bIdx < 15 ? 'border-r border-zinc-400' : ''}`}
                                    />
                                  ))}
                                </div>
                              </td>
                            )}
                            <td className={`px-3 py-3 border border-zinc-300 text-[10px] text-zinc-500 italic font-medium ${hasAttendanceBoxes ? 'w-[160px]' : 'min-w-[260px]'}`}>
                              &nbsp;
                            </td>
                          </tr>
                        );
                      })}
                      {/* Fill with empty rows to ensure exactly 15 rows on every page */}
                      {Array.from({ length: 15 - page.students.length }).map((_, idx) => {
                        const globalIdx = (page.currentPage - 1) * 15 + page.students.length + idx;
                        return (
                          <tr
                            key={`empty_${idx}`}
                            className="border-b border-zinc-300"
                          >
                            <td className="px-3 py-3 border border-zinc-300 font-bold text-center font-mono text-zinc-300">
                              {globalIdx + 1}
                            </td>
                            <td className={`px-3 py-3 border border-zinc-300 ${hasAttendanceBoxes ? 'w-[160px]' : 'w-[240px]'}`}>
                              &nbsp;
                            </td>
                            <td className={`px-3 py-3 border border-zinc-300 ${hasAttendanceBoxes ? 'w-32' : 'w-44'}`}>
                              &nbsp;
                            </td>
                            <td className={`px-3 py-3 border border-zinc-300 ${hasAttendanceBoxes ? 'w-36' : 'w-44'}`}>
                              &nbsp;
                            </td>
                            {hasAttendanceBoxes && (
                              <td className="px-2 py-1.5 border border-zinc-300 w-[280px]">
                                <div className="w-full h-[22px] border border-zinc-400 flex bg-white rounded-[1px] opacity-40">
                                  {Array.from({ length: 16 }).map((_, bIdx) => (
                                    <div
                                      key={bIdx}
                                      className={`flex-1 h-full ${bIdx < 15 ? 'border-r border-zinc-400' : ''}`}
                                    />
                                  ))}
                                </div>
                              </td>
                            )}
                            <td className={`px-3 py-3 border border-zinc-300 ${hasAttendanceBoxes ? 'w-[160px]' : 'min-w-[260px]'}`}>
                              &nbsp;
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            });
          })()}
        </div>
      )}

      {noteModalStudent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm sm:p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  {noteModalStudent.name}
                </h3>
                <p className="text-[10px] sm:text-xs text-zinc-400 font-medium mt-0.5">
                  Quick Notes & Observations
                </p>
              </div>
              <button
                onClick={() => setNoteModalStudent(null)}
                className="text-zinc-500 hover:text-white p-2 transition rounded hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <textarea
                autoFocus
                rows={5}
                placeholder="Add important student notes, attendance remarks, or behavior logs here..."
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-500 text-sm font-medium py-3 px-4 rounded-lg focus:outline-none focus:border-red-650 focus:ring-1 focus:ring-red-650 transition-all resize-none leading-relaxed"
                defaultValue={noteModalStudent.notes || ""}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if ((noteModalStudent.notes || "") !== val) {
                    onUpdateStudent({
                      ...noteModalStudent,
                      notes: val || undefined,
                    });
                    setNoteModalStudent({
                      ...noteModalStudent,
                      notes: val || undefined,
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const val = e.currentTarget.value.trim();
                    if ((noteModalStudent.notes || "") !== val) {
                      onUpdateStudent({
                        ...noteModalStudent,
                        notes: val || undefined,
                      });
                    }
                    setNoteModalStudent(null);
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                  Auto-saves on blur
                </span>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider hidden sm:inline-block">
                  Ctrl + Enter to fast-save & close
                </span>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-800 bg-black/20 flex justify-end gap-3">
              <button
                onClick={() => setNoteModalStudent(null)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-xs uppercase tracking-wider transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <UpdateDetailsModal
        isOpen={isUpdateDetailsModalOpen}
        onClose={() => setIsUpdateDetailsModalOpen(false)}
        students={students}
        onUpdateStudent={onUpdateStudent}
        defaultMode={updateDetailsInitialMode}
        activeProgram={filterProgram === "all" ? "karate" : filterProgram}
        testingLock={testingLock}
        customDojos={customDojos}
      />

      <QuickAttendanceModal
        isOpen={isQuickAttendanceOpen}
        onClose={() => setIsQuickAttendanceOpen(false)}
        students={students}
        onAddAttendance={handleAddClassAttendance}
        onSubtractAttendance={handleSubtractClassAttendance}
      />

      {/* Mobile Student Card Modal */}
      {activeCardStudent && mobileCardTarget && (() => {
        const cardProg = (mobileCardTarget.program || "karate") as "karate" | "tots" | "kobudo";
        const curRankId = getStudentRankId(activeCardStudent, cardProg);
        const rankList = cardProg === 'karate' ? KARATE_RANKS : cardProg === 'tots' ? TOTS_RANKS : KOBUDO_RANKS;
        const currentBelt = rankList.find((r) => r.id === curRankId) || rankList[0];
        const nextBelt = getNextRank(cardProg, curRankId);
        const progElig = activeCardStudent.eligibilityByProgram?.[cardProg] || {
          eligible: false,
          classesActual: 0,
          classesRequired: 16
        };
        const override = getProgramOverride(activeCardStudent, cardProg as any);
        const isEligible = override === "eligible" ? true : override === "ineligible" ? false : progElig.eligible;
        const progressPct = Math.min(100, Math.round((progElig.classesActual / (progElig.classesRequired || 1)) * 100));

        return (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
            onClick={() => {
              setMobileCardTarget(null);
              setShowFullDetails(false);
            }}
          >
            <div
              className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Card Header: Student Name & Program */}
              <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0">
                    <BeltPreview rank={currentBelt} size="md" showLabel={false} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-white truncate">
                        {activeCardStudent.name}
                      </h3>
                      {activeCardStudent.inactive && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded leading-none">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mt-0.5">
                      <span className="capitalize text-zinc-300 font-bold">{cardProg}</span>
                      <span>•</span>
                      <span>{activeCardStudent.location || 'West Chester'}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileCardTarget(null);
                    setShowFullDetails(false);
                  }}
                  className="p-1.5 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg border border-zinc-800 transition cursor-pointer shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Card Body */}
              <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 font-sans">
                {/* 1. Current Rank at the top */}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">
                    Current Rank
                  </span>
                  <div className="flex items-center justify-between bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-sm font-black text-white">
                      {currentBelt?.name || 'White Belt'}
                    </span>
                    <BeltPreview rank={currentBelt} size="sm" showLabel={false} />
                  </div>
                </div>

                {/* 2. Next Rank below */}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">
                    Next Rank
                  </span>
                  <div className="flex items-center justify-between bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl">
                    <span className="text-sm font-black text-white">
                      {nextBelt?.name || 'Max Rank'}
                    </span>
                    {nextBelt ? (
                      <BeltPreview rank={nextBelt} size="sm" showLabel={false} />
                    ) : (
                      <span className="text-xs font-bold text-zinc-500">None</span>
                    )}
                  </div>
                </div>

                {/* 3. Class Times below that */}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-1">
                    Class Times
                  </span>
                  <div className="bg-zinc-900/70 border border-zinc-800 p-3 rounded-xl text-xs font-bold text-zinc-200 space-y-1">
                    {(activeCardStudent.scheduleDay1 || activeCardStudent.scheduleTime1) && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-medium">Day 1:</span>
                        <span>{activeCardStudent.scheduleDay1} {activeCardStudent.scheduleTime1}</span>
                      </div>
                    )}
                    {(activeCardStudent.scheduleDay2 || activeCardStudent.scheduleTime2) && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-medium">Day 2:</span>
                        <span>{activeCardStudent.scheduleDay2} {activeCardStudent.scheduleTime2}</span>
                      </div>
                    )}
                    {(!activeCardStudent.scheduleDay1 && !activeCardStudent.scheduleTime1 && !activeCardStudent.scheduleDay2 && !activeCardStudent.scheduleTime2) && (
                      <span className="text-zinc-500 text-xs font-medium">None assigned</span>
                    )}
                  </div>
                </div>

                {/* 4. Attendance counter as it is in the cell now. In that cell, at the bottom should be the testing override button. */}
                <div className="bg-zinc-900/70 border border-zinc-800 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      Attendance
                    </span>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                      isEligible
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}>
                      {isEligible ? 'Eligible for Exam' : 'In Progress'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={progElig.classesActual}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value) || 0);
                          const nextAtt = { ...(activeCardStudent.attendance || {}), [cardProg]: val };
                          const todayStr = new Date().toLocaleDateString('en-CA');
                          onUpdateStudent({
                            ...activeCardStudent,
                            attendance: nextAtt,
                            lastAttendanceUpdate: todayStr,
                            lastIncrementDateByProgram: {
                              ...(activeCardStudent.lastIncrementDateByProgram || {}),
                              [cardProg]: todayStr
                            },
                            inactive: false
                          });
                        }}
                        className={`w-16 bg-zinc-950 border border-zinc-700 font-black text-center text-sm rounded-lg py-1 px-1 focus:outline-none focus:border-red-600 font-mono ${
                          isEligible ? 'text-emerald-400 font-bold' : override === 'ineligible' ? 'text-red-400 font-bold' : 'text-zinc-100'
                        }`}
                      />
                      <span className={`text-xs font-bold ${
                        isEligible ? 'text-emerald-400/90' : 'text-zinc-300'
                      }`}>
                        / {progElig.classesRequired === 9999 ? '∞' : progElig.classesRequired} Classes
                      </span>
                    </div>

                    {/* Touch +/- Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {userRole !== 'Instructor' && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentAtt = activeCardStudent.attendance?.[cardProg] || 0;
                            const nextAtt = { ...(activeCardStudent.attendance || {}), [cardProg]: Math.max(0, currentAtt - 1) };
                            const todayStr = new Date().toLocaleDateString('en-CA');
                            onUpdateStudent({
                              ...activeCardStudent,
                              attendance: nextAtt,
                              lastAttendanceUpdate: todayStr
                            });
                          }}
                          className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 active:scale-95 border border-zinc-700 text-zinc-200 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                          title="-1 Class"
                        >
                          -1
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const currentAtt = activeCardStudent.attendance?.[cardProg] || 0;
                          const nextAtt = { ...(activeCardStudent.attendance || {}), [cardProg]: currentAtt + 1 };
                          const todayStr = new Date().toLocaleDateString('en-CA');
                          onUpdateStudent({
                            ...activeCardStudent,
                            attendance: nextAtt,
                            lastAttendanceUpdate: todayStr,
                            lastIncrementDateByProgram: {
                              ...(activeCardStudent.lastIncrementDateByProgram || {}),
                              [cardProg]: todayStr
                            },
                            inactive: false
                          });
                        }}
                        className="h-8 px-3 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-black text-[11px] uppercase tracking-wider rounded-lg flex items-center gap-1 shadow-md shadow-red-950/60 cursor-pointer"
                        title="+1 Class Attendance"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+1</span>
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden border border-zinc-800/80">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isEligible ? 'bg-emerald-500' : 'bg-red-600'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  {/* Testing override button at the bottom of this cell */}
                  <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      Testing Override
                    </span>
                    <button
                      type="button"
                      onClick={() => onCycleOverride(activeCardStudent.id, cardProg)}
                      className="px-2.5 py-1 text-xs font-bold text-red-400 bg-red-950/40 hover:bg-red-900/40 border border-red-900/50 rounded-lg cursor-pointer transition active:scale-95"
                    >
                      {override === 'eligible' && '🟢 Forced OK'}
                      {override === 'ineligible' && '🔴 Forced NO'}
                      {(!override || override === null) && '⚙️ Set Override'}
                    </button>
                  </div>
                </div>

                {/* 5. At the bottom of this modal: Edit Profile, Memo & Mark Inactive, Delete */}
                <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                  {/* Edit profile button (wide across the modal) */}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileCardTarget(null);
                      onEditStudent(activeCardStudent);
                    }}
                    className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 border border-zinc-700/80 cursor-pointer shadow-sm active:scale-[0.99]"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Edit Profile</span>
                  </button>

                  {/* Memo button and Mark Inactive button below */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNoteModalStudent(activeCardStudent);
                      }}
                      className="py-2 px-3 bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-800 transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
                    >
                      <FileText className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Memo</span>
                    </button>

                    {userRole !== 'Instructor' && (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateStudent({
                            ...activeCardStudent,
                            inactive: !activeCardStudent.inactive
                          });
                        }}
                        className={`py-2 px-3 text-xs font-bold rounded-xl border transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] ${
                          activeCardStudent.inactive
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50 hover:bg-emerald-900/40'
                            : 'bg-amber-950/40 text-amber-400 border-amber-900/50 hover:bg-amber-900/40'
                        }`}
                      >
                        <span>{activeCardStudent.inactive ? 'Mark Active' : 'Mark Inactive'}</span>
                      </button>
                    )}
                  </div>

                  {/* Delete button at the very bottom, keeping the existing confirmation system */}
                  {userRole !== 'Instructor' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm?.(`Are you sure you want to delete ${activeCardStudent.name}?`)) {
                          setMobileCardTarget(null);
                          onDeleteStudent(activeCardStudent.id);
                        }
                      }}
                      className="w-full py-2 px-3 bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-900/40 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.99]"
                      title="Delete Student"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Student</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom Close Button */}
              <div className="p-3 border-t border-zinc-800 bg-zinc-900/90">
                <button
                  type="button"
                  onClick={() => {
                    setMobileCardTarget(null);
                  }}
                  className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 border border-zinc-700/80"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Style overrides for letter portrait printing */}
      {printMode !== 'none' && (
        <style dangerouslySetInnerHTML={{ __html: `
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
            html, body, #root, main {
              background-color: white !important;
              color: black !important;
            }
            .print-sheet-portrait {
              width: 8.5in !important;
              height: 11.0in !important;
              box-sizing: border-box !important;
              padding: 0.4in !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              break-after: page !important;
              break-inside: avoid !important;
            }
            .print-sheet-portrait:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
          }
        ` }} />
      )}

      {printMode === 'enrollment_sheet' && (
        <div className="hidden print:block font-sans text-black bg-white">
          {(() => {
            // Helper to get family key and members
            const getFamilyKeyAndMembers = (student: Student, allStudents: Student[]) => {
              const fIds = student.familyIds || [];
              const familyMembers = [student, ...allStudents.filter(other => fIds.includes(other.id))];
              const sortedIds = familyMembers.map(m => m.id).sort();
              const key = sortedIds.join(',');
              return { key, members: familyMembers };
            };

            // Group all students in enrollmentPrintStudents into unique family clusters
            const uniqueFamiliesMap = new Map<string, Student[]>();
            enrollmentPrintStudents.forEach(stud => {
              const { key, members } = getFamilyKeyAndMembers(stud, students);
              if (!uniqueFamiliesMap.has(key)) {
                uniqueFamiliesMap.set(key, members);
              }
            });

            const uniqueFamiliesList = Array.from(uniqueFamiliesMap.values());

            const formatProgramName = (p: string): string => {
              const map: { [key: string]: string } = {
                competition_team: "Competition Team",
                tiny_tigers: "Tiny Tigers",
                fitness: "Fitness",
                kojin: "Kojin",
                tots: "Tots",
                karate: "Karate",
                kobudo: "Kobudo",
              };
              if (map[p]) return map[p];
              return p.replace(/[_-]/g, ' ')
                .split(' ')
                .map(word => {
                  if (word.toLowerCase() === 'ymca') return 'YMCA';
                  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                })
                .join(' ');
            };

            return uniqueFamiliesList.map((familyMembers, familyIndex) => {
              const printRows: { name: string; membership: string; expiration: string }[] = [];
              familyMembers.forEach(stud => {
                const activeProgs = stud.programs || [];
                const agreementProgs = Object.keys(stud.enrollmentAgreements || {}).filter(
                  k => stud.enrollmentAgreements?.[k] && stud.enrollmentAgreements?.[k] !== "None"
                );
                const allProgs = Array.from(new Set([...activeProgs, ...agreementProgs]));

                if (allProgs.length === 0) {
                  printRows.push({
                    name: stud.name,
                    membership: "None",
                    expiration: ""
                  });
                } else {
                  allProgs.forEach(prog => {
                    const agreement = stud.enrollmentAgreements?.[prog] || "None";
                    const expiry = stud.enrollmentExpiries?.[prog] || "";
                    
                    let membershipVal = "";
                    let expirationVal = "";
                    
                    if (agreement === "Monthly") {
                      membershipVal = formatProgramName(prog);
                      expirationVal = "Monthly";
                    } else {
                      membershipVal = `${formatProgramName(prog)} - ${agreement}`;
                      expirationVal = expiry;
                    }

                    printRows.push({
                      name: stud.name,
                      membership: membershipVal,
                      expiration: expirationVal
                    });
                  });
                }
              });

              // Pad each family to exactly 12 rows
              while (printRows.length < 12) {
                printRows.push({
                  name: "",
                  membership: "",
                  expiration: ""
                });
              }

              // Gather notes for this family
              const familyNotes = familyMembers
                .map(m => m.notes)
                .filter(Boolean)
                .join("; ");

              return (
                <div 
                  key={familyIndex}
                  className="print-sheet-portrait mx-auto flex flex-col justify-between" 
                  style={{ width: '8.5in', height: '11.0in', boxSizing: 'border-box', padding: '0.5in' }}
                >
                  <div>
                    {/* Header section matching PDF */}
                    <div className="flex items-center gap-5 border-b-[3px] border-black pb-5 mb-6">
                      <DojoLogo size={64} className="print:block" />
                      <div>
                        <h1 className="text-3xl font-black text-red-650 uppercase tracking-tight leading-none mb-1">
                          Buckner Martial Arts
                        </h1>
                        <h2 className="text-xl font-bold text-zinc-950 uppercase tracking-wider">
                          Student Enrollments Preview
                        </h2>
                      </div>
                    </div>

                    {/* Grid Table */}
                    <div className="border-[3px] border-black">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b-[2px] border-black bg-zinc-50">
                            <th className="px-4 py-3 font-black text-black uppercase tracking-wider text-xs border-r border-black w-[30%]">
                              Student Name
                            </th>
                            <th className="px-4 py-3 font-black text-black uppercase tracking-wider text-xs border-r border-black w-[30%]">
                              Membership
                            </th>
                            <th className="px-4 py-3 font-black text-black uppercase tracking-wider text-xs border-r border-black w-[18%]">
                              Amount
                            </th>
                            <th className="px-4 py-3 font-black text-black uppercase tracking-wider text-xs w-[22%]">
                              Expiration
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {printRows.map((row, i) => (
                            <tr key={i} className="border-b border-black last:border-b-0 h-[0.45in]">
                              <td className="px-4 py-2 text-sm font-bold border-r border-black text-black truncate max-w-[2.2in]">
                                {row.name}
                              </td>
                              <td className="px-4 py-2 text-sm font-medium border-r border-black text-black truncate max-w-[2.2in]">
                                {row.membership}
                              </td>
                              <td className="px-4 py-2 text-sm font-mono border-r border-black text-black">
                                {/* Amount is left empty */}
                              </td>
                              <td className="px-4 py-2 text-sm font-mono text-black font-semibold">
                                {row.expiration}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Notes Section matching PDF */}
                    <div className="mt-8">
                      <span className="text-sm font-black text-black uppercase tracking-wider block">Notes:</span>
                      <div className="mt-3 space-y-6">
                        <div className="border-b border-black w-full min-h-[1.5rem] pb-1 flex items-end">
                          {familyNotes && (
                            <span className="text-sm text-black tracking-wide font-medium font-sans pl-1">
                              {familyNotes}
                            </span>
                          )}
                        </div>
                        <div className="border-b border-black w-full h-8"></div>
                        <div className="border-b border-black w-full h-8"></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </>
  );
}
