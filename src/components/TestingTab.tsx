import React, { useState, useEffect, useMemo } from "react";
import { Student, UserRole } from "../types";
import { ExamCompletion } from "./ExamCompletion";
import { isExamDay } from "../dateHelpers";
import {
  checkEligibility,
  getNextRank,
  getStudentRankId,
  getGroupLabel,
  getTestTime,
  getProgramOverride,
  normalizeKobudoRankId,
  KARATE_RANKS,
  TOTS_RANKS,
  KOBUDO_RANKS,
} from "../constants";
import { BeltPreview } from "./BeltPreview";
import {
  Printer,
  CheckSquare,
  TrendingUp,
  Calendar,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Award,
  Info,
  QrCode,
  ArrowRight,
  CheckCircle2,
  Lock,
  Archive,
  BarChart2,
  Users,
  Search,
  DollarSign,
  Clock,
  Check
} from "lucide-react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from "../firebase";

interface TestingTabProps {
  students: Student[];
  onUpdateStudent: (s: Student) => void;
  testDate: string;
  onTestDateChange: (date: string) => void;
  classesBuffer: number;
  isDatabaseActive: boolean;
  onTabChange: (tab: string) => void;
  testingLock: any;
  onUpdateTestingLock: (lock: any) => void;
  onUpdateInvitationsLock: (lock: any) => void;
  onUpdateLabelsLock: (lock: any) => void;
  onUpdateBeltListLock: (lock: any) => void;
  userRole?: UserRole;
}

function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 9999;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

interface ReadyCandidate {
  student: Student;
  program: "karate" | "tots" | "kobudo";
  curRankId: string;
  curRankObj: any;
  targetRank: any;
  testTime: string;
  groupLabel: string;
  isPaid: boolean;
  classesActual: number;
  classesRequired: number;
  isOverride: boolean;
  isProvisional: boolean;
}

export function TestingTab({
  students,
  onUpdateStudent,
  testDate,
  onTestDateChange,
  classesBuffer,
  isDatabaseActive,
  onTabChange,
  testingLock,
  onUpdateTestingLock,
  onUpdateInvitationsLock,
  onUpdateLabelsLock,
  onUpdateBeltListLock,
  userRole = "Front Desk"
}: TestingTabProps) {
  const [showReview, setShowReview] = useState(false);

  // Checklist state persisted to localStorage and Firestore DB
  const [checklist, setChecklist] = useState<{ [key: string]: boolean }>(() => {
    const saved = localStorage.getItem("bma_testing_checklist");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return {
      printList: false,
      printLabels: false,
      printInvites: false,
      printBelts: false
    };
  });

  // Subscribe to readiness checklist from Firestore settings
  useEffect(() => {
    if (isFirebaseConfigured && db && isDatabaseActive) {
      import("firebase/firestore").then(({ doc, onSnapshot }) => {
        const unsub = onSnapshot(doc(db, "settings", "general"), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.readinessChecklist) {
              setChecklist(data.readinessChecklist);
              localStorage.setItem("bma_testing_checklist", JSON.stringify(data.readinessChecklist));
            }
          }
        });
        return () => unsub();
      });
    }
  }, [isDatabaseActive]);

  useEffect(() => {
    localStorage.setItem("bma_testing_checklist", JSON.stringify(checklist));
  }, [checklist]);

  const toggleChecklistItem = async (key: string) => {
    const updated = {
      ...checklist,
      [key]: !checklist[key]
    };
    setChecklist(updated);
    localStorage.setItem("bma_testing_checklist", JSON.stringify(updated));

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        const { doc, setDoc } = await import("firebase/firestore");
        await setDoc(doc(db, "settings", "general"), { readinessChecklist: updated }, { merge: true });
      } catch (err) {
        console.error("Error saving readiness checklist to DB:", err);
      }
    }
  };

  const isReviewOpen = isExamDay(testDate) && userRole !== "Instructor";

  // Calculate stats
  const activeStudents = useMemo(() => students.filter(s => !s.inactive), [students]);
  
  // Barcode pending count
  const pendingBarcodeCount = useMemo(() => {
    return activeStudents.filter(s => s.barcodePrinted === false || s.barcodePrinted === undefined).length;
  }, [activeStudents]);

  // Eligibility summary
  const eligibilityStats = useMemo(() => {
    let eligibleCount = 0;
    let pendingCount = 0;
    let ineligibleCount = 0;
    const unpaidEligibles: { student: Student; program: string }[] = [];

    activeStudents.forEach(s => {
      s.programs.forEach(prog => {
        const eligibility = checkEligibility(s, prog as any, classesBuffer);
        const isEligible = eligibility.eligible;
        if (isEligible) {
          eligibleCount++;
          // check if paid
          const isPaid = s.testingFeePaidByProgram?.[prog] || s.testingFeePaid;
          if (!isPaid) {
            unpaidEligibles.push({ student: s, program: prog });
          }
        } else {
          ineligibleCount++;
        }
      });
    });

    return {
      eligibleCount,
      pendingCount,
      ineligibleCount,
      unpaidEligibles
    };
  }, [activeStudents, classesBuffer]);

  // Growth Stats & Real Database Chart Data
  const [pastTests, setPastTests] = useState<any[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);

  // Candidate Section State & Logic
  const [candidateSearch, setCandidateSearch] = useState("");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");

  const readyCandidates = useMemo(() => {
    const list: ReadyCandidate[] = [];
    activeStudents.forEach((student) => {
      student.programs.forEach((prog) => {
        const eligibility = checkEligibility(student, prog as any, classesBuffer);
        const override = getProgramOverride(student, prog as any);
        const isOverride = override === "eligible";
        const isEligible =
          isOverride
            ? true
            : override === "ineligible"
            ? false
            : testingLock
            ? testingLock.studentIds.includes(student.id) && eligibility.eligible
            : eligibility.eligible;

        if (isEligible) {
          const curRankId = getStudentRankId(student, prog as any);
          const rankList =
            prog === "karate"
              ? KARATE_RANKS
              : prog === "tots"
              ? TOTS_RANKS
              : KOBUDO_RANKS;
          const curRankObj =
            rankList.find((r) => r.id === curRankId) || rankList[0];
          const targetRank = getNextRank(prog as any, curRankId);

          if (targetRank) {
            const testTime = getTestTime(prog as any, curRankId);
            const groupLabel = getGroupLabel(prog as any, curRankId);
            const isPaid =
              student.testingFeePaidByProgram?.[prog] ??
              student.testingFeePaid ??
              false;

            list.push({
              student,
              program: prog as any,
              curRankId,
              curRankObj,
              targetRank,
              testTime,
              groupLabel,
              isPaid,
              classesActual: eligibility.classesActual || 0,
              classesRequired: eligibility.classesRequired || 0,
              isOverride,
              isProvisional: !!eligibility.isProvisional && !isOverride,
            });
          }
        }
      });
    });
    return list;
  }, [activeStudents, classesBuffer, testingLock]);

  const totalReadyCandidates = readyCandidates.length;
  const totalPaidCandidates = readyCandidates.filter((c) => c.isPaid).length;
  const totalUnpaidCandidates = totalReadyCandidates - totalPaidCandidates;

  // Group by testing time and order alphabetically within each group
  const candidatesGroupedByTime = useMemo(() => {
    const filtered = readyCandidates.filter((item) => {
      if (candidateSearch.trim()) {
        const q = candidateSearch.toLowerCase().trim();
        const matchName = item.student.name.toLowerCase().includes(q);
        const matchProg = item.program.toLowerCase().includes(q);
        const matchCurRank = item.curRankObj.name.toLowerCase().includes(q);
        const matchTargetRank = item.targetRank.name.toLowerCase().includes(q);
        const matchGroup = item.groupLabel.toLowerCase().includes(q);
        if (!matchName && !matchProg && !matchCurRank && !matchTargetRank && !matchGroup) {
          return false;
        }
      }
      if (paidFilter === "paid" && !item.isPaid) return false;
      if (paidFilter === "unpaid" && item.isPaid) return false;
      return true;
    });

    const timeMap = new Map<string, ReadyCandidate[]>();
    filtered.forEach((c) => {
      if (!timeMap.has(c.testTime)) {
        timeMap.set(c.testTime, []);
      }
      timeMap.get(c.testTime)!.push(c);
    });

    // Alphabetical sort within each time slot
    timeMap.forEach((candidates) => {
      candidates.sort((a, b) => a.student.name.localeCompare(b.student.name));
    });

    // Chronological sort of time slots
    const sortedTimes = Array.from(timeMap.keys()).sort((a, b) => {
      return parseTimeToMinutes(a) - parseTimeToMinutes(b);
    });

    return sortedTimes.map((time) => ({
      time,
      candidates: timeMap.get(time) || [],
    }));
  }, [readyCandidates, candidateSearch, paidFilter]);

  const handleToggleCandidatePaid = (
    student: Student,
    program: "karate" | "tots" | "kobudo"
  ) => {
    const currentPaidMap = student.testingFeePaidByProgram || {};
    const currentPaid = currentPaidMap[program] ?? student.testingFeePaid ?? false;
    const nextPaid = !currentPaid;

    const updated: Student = {
      ...student,
      testingFeePaid: nextPaid, // sync legacy fallback
      testingFeePaidByProgram: {
        ...currentPaidMap,
        [program]: nextPaid,
      },
    };
    onUpdateStudent(updated);
  };

  const handleSetKobudoTestingWeapon = (
    student: Student,
    weapon: "Bo" | "Sai" | "Both"
  ) => {
    const updated: Student = {
      ...student,
      kobudoTestingWeapon: weapon,
    };
    onUpdateStudent(updated);
  };

  useEffect(() => {
    if (isFirebaseConfigured && db && isDatabaseActive) {
      const q = query(collection(db, "beltTests"), orderBy("date", "desc"));
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const records: any[] = [];
          snapshot.forEach((doc) => {
            records.push({ id: doc.id, ...doc.data() });
          });
          // Sort chronologically (oldest to newest) for chart display
          setPastTests(records.reverse());
          setLoadingTests(false);
        },
        (error) => {
          console.error("Error fetching beltTests:", error);
          setLoadingTests(false);
          handleFirestoreError(error, OperationType.LIST, "beltTests");
        }
      );
      return () => unsubscribe();
    } else {
      setLoadingTests(false);
    }
  }, [isDatabaseActive]);

  const getExamMetrics = (t: any) => {
    const participants = Array.isArray(t.participants) ? t.participants : [];
    const passed = participants.filter((p: any) => p.passed).length;
    let paid = 0;
    if (typeof t.paidCount === "number") {
      paid = t.paidCount;
    } else if (participants.some((p: any) => p.paid !== undefined)) {
      paid = participants.filter((p: any) => p.paid).length;
    } else {
      // Legacy records fallback: only students who actually tested and passed
      paid = passed;
    }
    paid = Math.max(paid, passed);
    const failed = Math.max(0, paid - passed);
    return { paid, passed, failed };
  };

  const testStatsList = useMemo(() => {
    return pastTests.map((t) => ({
      id: t.id,
      month: t.month,
      date: t.date,
      ...getExamMetrics(t),
    }));
  }, [pastTests]);

  const maxTested = useMemo(() => {
    if (testStatsList.length === 0) return 10;
    const totals = testStatsList.map((t) => t.paid);
    return Math.max(...totals, 10);
  }, [testStatsList]);

  const totalPaidSum = useMemo(() => {
    return testStatsList.reduce((sum, t) => sum + t.paid, 0);
  }, [testStatsList]);

  const totalPassedSum = useMemo(() => {
    return testStatsList.reduce((sum, t) => sum + t.passed, 0);
  }, [testStatsList]);

  const avgPassingRate = useMemo(() => {
    return totalPaidSum > 0 ? Math.round((totalPassedSum / totalPaidSum) * 1000) / 10 : 0;
  }, [totalPaidSum, totalPassedSum]);

  const totalExams = pastTests.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Test Day Pulsing Banner / Action Expander at Top */}
      {isReviewOpen && (
        <>
          {/* Mobile Format: Just the yellow button saying "Complete Exam Review", and nothing else */}
          <div className="block sm:hidden">
            <button
              type="button"
              onClick={() => setShowReview(!showReview)}
              className="w-full py-3.5 px-4 bg-yellow-400 hover:bg-yellow-300 active:bg-yellow-500 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-yellow-500/25 cursor-pointer transition text-center"
            >
              Complete Exam Review
            </button>
          </div>

          {/* Desktop / Tablet Banner */}
          <div className="hidden sm:block bg-gradient-to-r from-amber-950/40 via-red-950/30 to-amber-950/40 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-2xl shadow-amber-950/20 animate-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/30 shrink-0">
                    <Award className="w-7 h-7 animate-bounce" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wider">
                      Belt Exam Completion Review
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-400 text-zinc-950 animate-pulse">
                      Test Day Active
                    </span>
                  </div>
                  <p className="text-zinc-300 text-xs mt-0.5 leading-relaxed font-medium">
                    {showReview 
                      ? "Grade candidates and record pass/fail results below. Final submission unlocks at 3:30 PM."
                      : "The belt exam completion review is open today. Click below to expand and manage candidate scores and rank promotions."}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowReview(!showReview)}
                className={`flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest cursor-pointer transition-all duration-300 border shadow-xl shrink-0 ${
                  showReview
                    ? "bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-red-950/50"
                    : "bg-amber-400 hover:bg-amber-300 text-zinc-950 border-amber-300 font-extrabold animate-pulse shadow-amber-500/40 hover:scale-[1.02] active:scale-95"
                }`}
              >
                <Sparkles className={`w-4 h-4 ${showReview ? "text-white" : "text-zinc-950"}`} />
                {showReview ? "Collapse Exam Review ▲" : "⚡ Open Exam Review Console ▼"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Award className="w-7 h-7 text-red-500 shrink-0" />
            Testing & Promotions Dashboard
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            Manage readiness checklists, view historical promotion stats, and complete belt exam finalizations all in one centralized command center.
          </p>
        </div>
      </div>

      {/* 2. Exam Completion Section (Toggled) */}
      {isReviewOpen && showReview && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl animate-in slide-in-from-top-3 duration-300">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
            <h3 className="text-md font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4.5 h-4.5 text-red-500" />
              Active Exam Completion Console
            </h3>
            <button
              onClick={() => setShowReview(false)}
              className="text-zinc-400 hover:text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Close
            </button>
          </div>
          <ExamCompletion
            students={students}
            onUpdateStudent={onUpdateStudent}
            testDate={testDate}
            onTestDateChange={onTestDateChange}
            classesBuffer={classesBuffer}
            isDatabaseActive={isDatabaseActive}
            onTabChange={() => setShowReview(false)}
            testingLock={testingLock}
            onUpdateTestingLock={onUpdateTestingLock}
            onUpdateInvitationsLock={onUpdateInvitationsLock}
            onUpdateLabelsLock={onUpdateLabelsLock}
            onUpdateBeltListLock={onUpdateBeltListLock}
            onClearReadinessChecklist={() => {
              setChecklist({
                printList: false,
                printLabels: false,
                printInvites: false,
                printBelts: false
              });
            }}
          />
        </div>
      )}

      {/* 3. Top Row Info & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Next Test Date (View Only) or Small Banner */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between h-full min-h-[220px]">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  Exam Schedule
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-red-950/40 text-red-400 border border-red-900/30 uppercase tracking-wider">
                  Sync Active
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-950/30 border border-red-900/20 flex items-center justify-center text-red-500 shrink-0">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest">
                    Next Belt Exam
                  </h3>
                  <p className="text-2xl font-black text-white tracking-tight mt-1">
                    {testDate ? new Date(testDate + "T00:00:00").toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    }) : "Not Scheduled"}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="border-t border-zinc-800 pt-4 mt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-bold uppercase text-[10px]">Configured Buffer:</span>
                <span className="text-zinc-300 font-black font-mono">{classesBuffer} Classes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-bold uppercase text-[10px]">Current Testing Eligibility:</span>
                <span className="text-emerald-400 font-black">{eligibilityStats.eligibleCount} Students</span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-tight italic mt-2">
                *Next belt exam date syncs with invitations, stickers, and rosters across all locations.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Pre-Testing Readiness Checklist */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-red-500" />
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Pre-Testing Readiness Checklist
                </h2>
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                {Object.values(checklist).filter(Boolean).length} / 4 Done
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 flex-1">
              {/* Item 1: Print Testing List */}
              <div 
                className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                  checklist.printList 
                    ? "bg-zinc-950 border-emerald-950/60 text-zinc-400" 
                    : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 text-zinc-200"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checklist.printList}
                    onChange={() => toggleChecklistItem("printList")}
                    className="w-4 h-4 mt-0.5 rounded border-zinc-800 bg-zinc-900 text-red-600 focus:ring-red-500 cursor-pointer"
                    id="check-printList"
                  />
                  <label htmlFor="check-printList" className="cursor-pointer select-none">
                    <span className={`text-xs font-black uppercase tracking-wide block ${checklist.printList ? "line-through text-zinc-500" : "text-white"}`}>
                      1. Print Testing List
                    </span>
                    <span className="text-[10px] text-zinc-400 mt-0.5 block leading-tight">
                      Generate exam attendance forms from the Setup page for graders to score.
                    </span>
                  </label>
                </div>
                <button
                  onClick={() => onTabChange("testForm")}
                  className="mt-3.5 self-start text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                >
                  Go to Setup Tab <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Item 2: Print Labels */}
              <div 
                className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                  checklist.printLabels 
                    ? "bg-zinc-950 border-emerald-950/60 text-zinc-400" 
                    : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 text-zinc-200"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checklist.printLabels}
                    onChange={() => toggleChecklistItem("printLabels")}
                    className="w-4 h-4 mt-0.5 rounded border-zinc-800 bg-zinc-900 text-red-600 focus:ring-red-500 cursor-pointer"
                    id="check-printLabels"
                  />
                  <label htmlFor="check-printLabels" className="cursor-pointer select-none">
                    <span className={`text-xs font-black uppercase tracking-wide block ${checklist.printLabels ? "line-through text-zinc-500" : "text-white"}`}>
                      2. Print Advancement Labels
                    </span>
                    <span className="text-[10px] text-zinc-400 mt-0.5 block leading-tight">
                      Generate and print custom Avery sticker sheets for advancement belts.
                    </span>
                  </label>
                </div>
                <button
                  onClick={() => onTabChange("stickers")}
                  className="mt-3.5 self-start text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                >
                  Go to Labels Tab <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Item 3: Print Invites */}
              <div 
                className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                  checklist.printInvites 
                    ? "bg-zinc-950 border-emerald-950/60 text-zinc-400" 
                    : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 text-zinc-200"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checklist.printInvites}
                    onChange={() => toggleChecklistItem("printInvites")}
                    className="w-4 h-4 mt-0.5 rounded border-zinc-800 bg-zinc-900 text-red-600 focus:ring-red-500 cursor-pointer"
                    id="check-printInvites"
                  />
                  <label htmlFor="check-printInvites" className="cursor-pointer select-none">
                    <span className={`text-xs font-black uppercase tracking-wide block ${checklist.printInvites ? "line-through text-zinc-500" : "text-white"}`}>
                      3. Print Test Invitations
                    </span>
                    <span className="text-[10px] text-zinc-400 mt-0.5 block leading-tight">
                      Hand out custom half-sheet exam invites and fee slips to eligible students.
                    </span>
                  </label>
                </div>
                <button
                  onClick={() => onTabChange("invitations")}
                  className="mt-3.5 self-start text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                >
                  Go to Invites Tab <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Item 4: Print Belts to Order */}
              <div 
                className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                  checklist.printBelts 
                    ? "bg-zinc-950 border-emerald-950/60 text-zinc-400" 
                    : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 text-zinc-200"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={checklist.printBelts}
                    onChange={() => toggleChecklistItem("printBelts")}
                    className="w-4 h-4 mt-0.5 rounded border-zinc-800 bg-zinc-900 text-red-600 focus:ring-red-500 cursor-pointer"
                    id="check-printBelts"
                  />
                  <label htmlFor="check-printBelts" className="cursor-pointer select-none">
                    <span className={`text-xs font-black uppercase tracking-wide block ${checklist.printBelts ? "line-through text-zinc-500" : "text-white"}`}>
                      4. Print Belts to Order
                    </span>
                    <span className="text-[10px] text-zinc-400 mt-0.5 block leading-tight">
                      Review the Belt Pull List in the Belt tab to submit inventory orders.
                    </span>
                  </label>
                </div>
                <button
                  onClick={() => onTabChange("beltPull")}
                  className="mt-3.5 self-start text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                >
                  Go to Belts Tab <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Candidates Ready to Test & Paid Status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between border-b border-zinc-800 pb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-950/40 border border-red-900/30 flex items-center justify-center text-red-500 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-black text-white uppercase tracking-wide">
                  Students Ready to Test & Paid Status
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {totalReadyCandidates} Candidates
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Eligible students scheduled for the upcoming belt test divided by testing time slot and ordered alphabetically.
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/40 border border-amber-800/50 text-[11px] text-amber-300 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Notice: Only students marked as Paid will appear in the exam review.</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics & Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Bar */}
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search candidate or rank..."
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                className="w-full pl-8.5 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition"
              />
              {candidateSearch && (
                <button
                  type="button"
                  onClick={() => setCandidateSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs font-bold"
                >
                  ×
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setPaidFilter("all")}
                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  paidFilter === "all"
                    ? "bg-zinc-800 text-white shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All ({totalReadyCandidates})
              </button>
              <button
                type="button"
                onClick={() => setPaidFilter("paid")}
                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                  paidFilter === "paid"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-emerald-400 hover:text-emerald-300"
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                Paid ({totalPaidCandidates})
              </button>
              <button
                type="button"
                onClick={() => setPaidFilter("unpaid")}
                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                  paidFilter === "unpaid"
                    ? "bg-amber-600 text-white shadow"
                    : "text-amber-400 hover:text-amber-300"
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                Unpaid ({totalUnpaidCandidates})
              </button>
            </div>
          </div>
        </div>

        {/* Content: Grouped by Testing Time */}
        {candidatesGroupedByTime.length === 0 ? (
          <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[160px]">
            <Users className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-xs font-black text-zinc-300 uppercase tracking-wider">
              {readyCandidates.length === 0
                ? "No Students Currently Ready to Test"
                : "No Candidates Match Current Search/Filter"}
            </p>
            <p className="text-[10px] text-zinc-500 max-w-md mt-1">
              {readyCandidates.length === 0
                ? "Students will appear here once they complete their required class counts and fulfill curriculum milestones for the next belt exam."
                : "Try clearing your search query or switching the Paid/Unpaid filter above to view all candidates."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {candidatesGroupedByTime.map((group) => {
              const groupPaidCount = group.candidates.filter((c) => c.isPaid).length;
              const groupUnpaidCount = group.candidates.length - groupPaidCount;

              return (
                <div
                  key={group.time}
                  className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl overflow-hidden shadow-md"
                >
                  {/* Time Group Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-3 bg-zinc-900/90 border-b border-zinc-800">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-red-950/60 border border-red-900/40 text-red-400 px-2.5 py-1 rounded-lg">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-mono font-black tracking-wide">{group.time}</span>
                      </div>
                      <span className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
                        {group.candidates.map((c) => c.groupLabel).filter((v, i, a) => a.indexOf(v) === i).join(" & ")}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="flex items-center gap-2 text-[10px] font-bold">
                        <span className="text-zinc-400">
                          {group.candidates.length} {group.candidates.length === 1 ? "Student" : "Students"}
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-emerald-400 font-extrabold">{groupPaidCount} Paid</span>
                        {groupUnpaidCount > 0 && (
                          <>
                            <span className="text-zinc-600">•</span>
                            <span className="text-amber-400 font-extrabold">{groupUnpaidCount} Unpaid</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Candidates Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-950/90 text-[9px] font-black uppercase text-zinc-500 border-b border-zinc-800 tracking-wider">
                          <th className="hidden sm:table-cell py-2 px-3 w-10 text-center">#</th>
                          <th className="py-2 px-3">Student Name</th>
                          <th className="hidden sm:table-cell py-2 px-3 w-28">Program</th>
                          <th className="hidden sm:table-cell py-2 px-3 min-w-[200px]">Belt Advancement</th>
                          <th className="hidden sm:table-cell py-2 px-3 w-28 text-center">Classes</th>
                          <th className="py-2 px-3 w-32 text-right">Paid Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {group.candidates.map((cand, idx) => {
                          const student = cand.student;
                          const prog = cand.program;
                          const isKobudo = prog === "kobudo";
                          const activeWeapons = student.kobudoWeapons || [];
                          const hasBo = activeWeapons.includes("Bo");
                          const hasSai = activeWeapons.includes("Sai");

                          return (
                            <tr
                              key={`${student.id}_${prog}`}
                              className="hover:bg-zinc-900/50 transition-colors"
                            >
                              {/* Index (hidden on mobile) */}
                              <td className="hidden sm:table-cell py-2.5 px-3 text-center font-mono text-[10px] font-bold text-zinc-500">
                                {idx + 1}
                              </td>

                              {/* Student Name */}
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-zinc-100 uppercase tracking-tight">
                                  {student.name}
                                </span>
                                {/* Mobile Kobudo Weapon Selection */}
                                {isKobudo && (
                                  <div className="mt-1.5 sm:hidden flex flex-col gap-1">
                                    <span className="text-[9px] font-black uppercase text-amber-400">
                                      Testing Weapon:
                                    </span>
                                    <div className="inline-flex rounded-lg bg-zinc-950 p-0.5 border border-zinc-800 w-fit">
                                      <button
                                        type="button"
                                        onClick={() => handleSetKobudoTestingWeapon(student, "Bo")}
                                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                          student.kobudoTestingWeapon === "Bo"
                                            ? "bg-amber-600 text-white font-black"
                                            : "text-zinc-400 hover:text-white"
                                        }`}
                                      >
                                        Bo
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSetKobudoTestingWeapon(student, "Sai")}
                                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                          student.kobudoTestingWeapon === "Sai"
                                            ? "bg-blue-600 text-white font-black"
                                            : "text-zinc-400 hover:text-white"
                                        }`}
                                      >
                                        Sai
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSetKobudoTestingWeapon(student, "Both")}
                                        className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                          student.kobudoTestingWeapon === "Both"
                                            ? "bg-purple-600 text-white font-black"
                                            : "text-zinc-500 hover:text-white"
                                        }`}
                                      >
                                        Both
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </td>

                              {/* Program Tag (hidden on mobile) */}
                              <td className="hidden sm:table-cell py-2.5 px-3">
                                <span
                                  className={`inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                                    prog === "karate"
                                      ? "bg-red-950/40 text-red-400 border-red-900/40"
                                      : prog === "tots"
                                      ? "bg-purple-950/40 text-purple-400 border-purple-900/40"
                                      : "bg-amber-950/40 text-amber-400 border-amber-900/40"
                                  }`}
                                >
                                  {prog === "karate" ? "Karate" : prog === "tots" ? "Tots" : "Kobudo"}
                                </span>
                              </td>

                              {/* Belt Advancement (Current -> Target) (hidden on mobile) */}
                              <td className="hidden sm:table-cell py-2.5 px-3">
                                {isKobudo ? (
                                  <div className="flex flex-col gap-2">
                                    {/* Interactive Weapon Question & Selector */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-[9.5px] font-black uppercase tracking-wider text-amber-400">
                                        Testing Weapon:
                                      </span>
                                      <div className="inline-flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
                                        <button
                                          type="button"
                                          onClick={() => handleSetKobudoTestingWeapon(student, "Bo")}
                                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition cursor-pointer ${
                                            student.kobudoTestingWeapon === "Bo"
                                              ? "bg-amber-600 text-white shadow font-black"
                                              : "text-zinc-400 hover:text-amber-300"
                                          }`}
                                          title="Test student with Bo (advances Bo rank)"
                                        >
                                          Bo
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSetKobudoTestingWeapon(student, "Sai")}
                                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition cursor-pointer ${
                                            student.kobudoTestingWeapon === "Sai"
                                              ? "bg-blue-600 text-white shadow font-black"
                                              : "text-zinc-400 hover:text-blue-300"
                                          }`}
                                          title="Test student with Sai (advances Sai rank)"
                                        >
                                          Sai
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSetKobudoTestingWeapon(student, "Both")}
                                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition cursor-pointer ${
                                            student.kobudoTestingWeapon === "Both"
                                              ? "bg-purple-600 text-white shadow font-black"
                                              : !student.kobudoTestingWeapon
                                              ? "bg-zinc-800 text-zinc-300"
                                              : "text-zinc-500 hover:text-zinc-300"
                                          }`}
                                          title="Test student with both Bo & Sai"
                                        >
                                          Both
                                        </button>
                                      </div>
                                      {!student.kobudoTestingWeapon && (
                                        <span className="text-[9px] font-bold text-amber-400 animate-pulse bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded">
                                          Please select weapon
                                        </span>
                                      )}
                                    </div>

                                    {/* Belt advancement display according to the chosen weapon */}
                                    {student.kobudoTestingWeapon === "Bo" ? (
                                      <div className="flex items-center gap-2">
                                        {(() => {
                                          const boCurId = normalizeKobudoRankId(student.kobudoRankings?.bo);
                                          const boCur = KOBUDO_RANKS.find((r) => r.id === boCurId) || KOBUDO_RANKS[0];
                                          const boTarget = getNextRank("kobudo", boCurId);
                                          return (
                                            <>
                                              <span className="text-[10px] font-bold text-amber-400 uppercase">Bo:</span>
                                              <BeltPreview rank={boCur} size="sm" showLabel={true} />
                                              <span className="text-zinc-600 text-xs font-bold">→</span>
                                              {boTarget ? (
                                                <BeltPreview rank={boTarget} size="sm" showLabel={true} />
                                              ) : (
                                                <span className="text-xs text-zinc-400 font-bold">Max Rank</span>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    ) : student.kobudoTestingWeapon === "Sai" ? (
                                      <div className="flex items-center gap-2">
                                        {(() => {
                                          const saiCurId = normalizeKobudoRankId(student.kobudoRankings?.sai);
                                          const saiCur = KOBUDO_RANKS.find((r) => r.id === saiCurId) || KOBUDO_RANKS[0];
                                          const saiTarget = getNextRank("kobudo", saiCurId);
                                          return (
                                            <>
                                              <span className="text-[10px] font-bold text-blue-400 uppercase">Sai:</span>
                                              <BeltPreview rank={saiCur} size="sm" showLabel={true} />
                                              <span className="text-zinc-600 text-xs font-bold">→</span>
                                              {saiTarget ? (
                                                <BeltPreview rank={saiTarget} size="sm" showLabel={true} />
                                              ) : (
                                                <span className="text-xs text-zinc-400 font-bold">Max Rank</span>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        {(() => {
                                          const boCurId = normalizeKobudoRankId(student.kobudoRankings?.bo);
                                          const boCur = KOBUDO_RANKS.find((r) => r.id === boCurId) || KOBUDO_RANKS[0];
                                          const boTarget = getNextRank("kobudo", boCurId);
                                          return (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-950/30 border border-amber-900/40 text-amber-300 text-[10px] font-medium">
                                              <span className="font-bold uppercase text-[9px] text-amber-400">Bo:</span>
                                              <span>{boCur.kyuText || boCur.name}</span>
                                              <span className="text-zinc-500">→</span>
                                              <span className="font-bold text-zinc-100">{boTarget?.kyuText || boTarget?.name || "Max"}</span>
                                            </span>
                                          );
                                        })()}
                                        {(() => {
                                          const saiCurId = normalizeKobudoRankId(student.kobudoRankings?.sai);
                                          const saiCur = KOBUDO_RANKS.find((r) => r.id === saiCurId) || KOBUDO_RANKS[0];
                                          const saiTarget = getNextRank("kobudo", saiCurId);
                                          return (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-950/30 border border-blue-900/40 text-blue-300 text-[10px] font-medium">
                                              <span className="font-bold uppercase text-[9px] text-blue-400">Sai:</span>
                                              <span>{saiCur.kyuText || saiCur.name}</span>
                                              <span className="text-zinc-500">→</span>
                                              <span className="font-bold text-zinc-100">{saiTarget?.kyuText || saiTarget?.name || "Max"}</span>
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <BeltPreview rank={cand.curRankObj} size="sm" showLabel={true} />
                                    <span className="text-zinc-600 text-xs font-bold">→</span>
                                    <BeltPreview rank={cand.targetRank} size="sm" showLabel={true} />
                                  </div>
                                )}
                              </td>

                              {/* Classes Attended (hidden on mobile) */}
                              <td className="hidden sm:table-cell py-2.5 px-3 text-center">
                                <div className="inline-flex items-center justify-center gap-1.5 text-[11px] font-mono font-bold text-zinc-300">
                                  {cand.isOverride ? (
                                    <span
                                      className="w-4.5 h-4.5 rounded-full border-2 border-emerald-400 bg-emerald-950/80 flex items-center justify-center shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.45)]"
                                      title="Eligible via manual instructor override"
                                    >
                                      <Check className="w-2.5 h-2.5 text-emerald-300 stroke-[3]" />
                                    </span>
                                  ) : (
                                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  )}
                                  <span>
                                    {cand.classesActual} / {cand.classesRequired}
                                  </span>
                                </div>
                              </td>

                              {/* Paid Status Toggle */}
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleToggleCandidatePaid(student, prog)}
                                  disabled={userRole === "Instructor"}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 border cursor-pointer ${
                                    cand.isPaid
                                      ? "bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/60 shadow-sm"
                                      : "bg-amber-950/50 hover:bg-amber-900/50 text-amber-300 border-amber-800/60 shadow-sm animate-pulse"
                                  } ${userRole === "Instructor" ? "opacity-75 cursor-not-allowed" : "hover:scale-[1.02] active:scale-95"}`}
                                  title={
                                    userRole === "Instructor"
                                      ? cand.isPaid ? "Paid" : "Unpaid"
                                      : cand.isPaid ? "Click to mark as Unpaid" : "Click to mark as Paid"
                                  }
                                >
                                  {cand.isPaid ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      <span>Paid</span>
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                      <span>Unpaid</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Chart & Specific Growth Stats */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-zinc-800 pb-4 mb-5 gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-red-500" />
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider">
                Promotion History & Growth Analytics
              </h2>
              <p className="text-[11px] text-zinc-500">
                Visualizing students passed in comparison to students who paid for testing from completed exams.
              </p>
            </div>
          </div>
          {testStatsList.length > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 block"></span>
                <span className="text-zinc-400 font-bold">Passed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-red-600 block"></span>
                <span className="text-zinc-400 font-bold">Did Not Pass</span>
              </div>
            </div>
          )}
        </div>

        {loadingTests ? (
          <div className="flex items-center justify-center min-h-[220px]">
            <RefreshCw className="w-6 h-6 text-red-500 animate-spin" />
          </div>
        ) : testStatsList.length === 0 ? (
          <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center min-h-[220px] text-center">
            <BarChart2 className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-xs font-black text-zinc-400 uppercase tracking-wider">No Testing Data Available</p>
            <p className="text-[10px] text-zinc-500 max-w-sm mt-1">
              No completed belt test records were found in the database. When you run an exam cycle and finalize results, promotion stats and charts will populate here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Custom Dynamic Stacked Bar Chart with Y-Axis Scale */}
            <div className="lg:col-span-3 bg-zinc-950/70 border border-zinc-800 rounded-xl p-5 flex flex-col justify-end min-h-[240px]">
              <div className="flex gap-4 items-stretch h-[180px] w-full">
                {/* Y-Axis scale */}
                <div className="flex flex-col justify-between text-[9px] font-mono text-zinc-500 text-right w-6 select-none pr-1.5 border-r border-zinc-800/40">
                  <span>{maxTested}</span>
                  <span>{Math.round(maxTested * 0.75)}</span>
                  <span>{Math.round(maxTested * 0.5)}</span>
                  <span>{Math.round(maxTested * 0.25)}</span>
                  <span>0</span>
                </div>

                {/* Bars Area */}
                <div className="flex-1 flex items-end justify-around relative pl-2">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-5 py-0.5">
                    <div className="border-b border-white w-full"></div>
                    <div className="border-b border-white w-full"></div>
                    <div className="border-b border-white w-full"></div>
                    <div className="border-b border-white w-full"></div>
                    <div className="w-full"></div>
                  </div>

                  {testStatsList.map((t) => {
                    const total = t.paid;
                    const passed = t.passed;
                    const failed = t.failed;
                    const barHeight = total > 0 ? (total / maxTested) * 150 : 0; // Max height 150px
                    
                    return (
                      <div key={t.id} className="flex flex-col items-center gap-1.5 group z-10 w-12 sm:w-16">
                        <div className="relative w-full flex flex-col items-center">
                          {/* Tooltip on Hover */}
                          <div className="absolute -top-16 bg-zinc-900 border border-zinc-800 text-zinc-100 text-[10px] font-black uppercase tracking-wider px-2 py-1.5 rounded shadow-xl hidden group-hover:block z-20 pointer-events-none whitespace-nowrap">
                            <p className="text-zinc-200 font-bold">{total} Paid for Testing</p>
                            <p className="text-emerald-400 font-extrabold">• {passed} Passed</p>
                            {failed > 0 && (
                              <p className="text-red-500 font-extrabold">• {failed} Did Not Pass</p>
                            )}
                          </div>

                          {/* Stacked Bar */}
                          <div 
                            className="w-8 sm:w-10 flex flex-col-reverse rounded-t bg-zinc-850 border border-zinc-800 shadow shadow-red-950/20 overflow-hidden" 
                            style={{ height: `${Math.max(12, barHeight)}px` }}
                          >
                            {/* Passed segment (green, bottom) */}
                            {passed > 0 && (
                              <div 
                                className="bg-emerald-500 hover:bg-emerald-400 transition-colors duration-150" 
                                style={{ height: total > 0 ? `${(passed / total) * 100}%` : "0%" }}
                                title={`${passed} Passed of ${total} Paid`}
                              />
                            )}
                            {/* Did Not Pass segment (red, top) */}
                            {failed > 0 && (
                              <div 
                                className="bg-red-600 hover:bg-red-500 transition-colors duration-150" 
                                style={{ height: total > 0 ? `${(failed / total) * 100}%` : "0%" }}
                                title={`${failed} Did Not Pass`}
                              />
                            )}
                          </div>
                        </div>
                        <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest text-center truncate w-full" title={t.month}>
                          {t.month}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Statistics Block using Real Data */}
            <div className="lg:col-span-1 space-y-4 flex flex-col justify-between">
              <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <span className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">
                    Total Exams Run
                  </span>
                  <span className="text-xl font-black text-white font-mono leading-none">
                    {totalExams} {totalExams === 1 ? 'Exam' : 'Exams'}
                  </span>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <span className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">
                    Exam Passing Rate
                  </span>
                  <span className="text-xl font-black text-emerald-400 font-mono leading-none">
                    {avgPassingRate}%
                  </span>
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-400 shrink-0" />
                <div>
                  <span className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">
                    Total Paid for Testing
                  </span>
                  <span className="text-xl font-black text-purple-400 font-mono leading-none">
                    {totalPaidSum} Students
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Reminders Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Barcode Reminder Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/30 border border-amber-900/20 flex items-center justify-center text-amber-500 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Print New Barcodes
              </h3>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Remember to print new check-in attendance barcode key tags! Students who just tested have their <strong>barcodePrinted</strong> flag automatically reset to <strong>Pending</strong> (and counters reset to 0 for their new rank) during promotion finalization.
              </p>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-4 mt-4 flex items-center justify-between">
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-wide">
              ⚠️ {pendingBarcodeCount} Student Barcodes Pending Print
            </span>
            <button
              onClick={() => onTabChange("stickers")}
              className="px-3.5 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition"
            >
              Print Labels
            </button>
          </div>
        </div>

        {/* Roster Reminder Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-950/30 border border-blue-900/20 flex items-center justify-center text-blue-400 shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Print Up-to-Date Rosters
              </h3>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Remember to generate and print a fresh set of classroom check-in clipboard rosters! This ensures that instructors have the correct, upgraded ranks and clean attendance counters at all checking stations.
              </p>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-4 mt-4 flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
              Clipboard Sheet Refresh Recommended
            </span>
            <button
              onClick={() => onTabChange("roster")}
              className="px-3.5 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition"
            >
              Go to Roster
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
