import React, { useState, useMemo } from "react";
import { Student } from "../types";
import {
  getNextRank,
  checkEligibility,
  getRankCategory,
  getGroupLabel,
  getTestTime,
  getStudentRankId,
  getProgramOverride,
} from "../constants";
import { getPaymentDeadline } from "../dateHelpers";
import { DojoLogo } from "./DojoLogo";
import {
  Printer,
  Settings,
  Check,
  RefreshCw,
  AlertCircle,
  Sparkles,
  DollarSign,
  ShieldAlert,
} from "lucide-react";

interface InvitationsProps {
  students: Student[];
  testDate: string;
  classesBuffer?: number;
  testingLock?: { date: string; month: string; studentIds: string[] } | null;
  onUpdateTestingLock?: (
    lock: { date: string; month: string; studentIds: string[] } | null,
  ) => void;
}

const getClassScheduleString = (student: Student) => {
  const parts: string[] = [];
  if (student.scheduleDay1) {
    const day = student.scheduleDay1.substring(0, 3);
    parts.push(`${day} ${student.scheduleTime1 || ""}`.trim());
  }
  if (student.scheduleDay2) {
    const day = student.scheduleDay2.substring(0, 3);
    parts.push(`${day} ${student.scheduleTime2 || ""}`.trim());
  }
  return parts.join(" • ");
};

const getLocationPriority = (loc?: string): number => {
  const normalized = (loc || "West Chester").trim();
  if (normalized === "West Chester") return 1;
  if (normalized === "Monroe") return 2;
  if (normalized === "YMCA") return 3;
  return 4;
};

const parseTimeToMinutes = (timeStr?: string): number => {
  if (!timeStr) return 9999;
  const match = timeStr.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 9999;
  let hrs = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const isPM = match[3].toUpperCase() === "PM";
  if (isPM && hrs !== 12) hrs += 12;
  if (!isPM && hrs === 12) hrs = 0;
  return hrs * 60 + mins;
};

export interface ScheduleClassification {
  isIrregular: boolean;
  dayRank: number;
  dayTrack: string;
  timeStr: string;
  timeVal: number;
  label: string;
}

export const getStudentScheduleClassification = (student: Student): ScheduleClassification => {
  const loc = (student.location || "West Chester").trim();
  if (loc === "YMCA") {
    return {
      isIrregular: true,
      dayRank: 99,
      dayTrack: "General Roster",
      timeStr: "",
      timeVal: 9999,
      label: "General Roster",
    };
  }

  const d1 = student.scheduleDay1?.trim() || "";
  const t1 = student.scheduleTime1?.trim() || "";
  const d2 = student.scheduleDay2?.trim() || "";
  const t2 = student.scheduleTime2?.trim() || "";

  if (d1 && t1 && d2 && t2) {
    const days = [d1, d2];
    const t1Norm = t1.toUpperCase();
    const t2Norm = t2.toUpperCase();

    if (t1Norm === t2Norm) {
      const timeVal = parseTimeToMinutes(t1);
      if (days.includes("Monday") && days.includes("Wednesday")) {
        return {
          isIrregular: false,
          dayRank: 1,
          dayTrack: "Monday/Wednesday",
          timeStr: t1,
          timeVal,
          label: `Monday/Wednesday - ${t1}`,
        };
      }
      if (days.includes("Tuesday") && days.includes("Thursday")) {
        return {
          isIrregular: false,
          dayRank: 2,
          dayTrack: "Tuesday/Thursday",
          timeStr: t1,
          timeVal,
          label: `Tuesday/Thursday - ${t1}`,
        };
      }
      if (d1 === d2) {
        return {
          isIrregular: false,
          dayRank: 3,
          dayTrack: d1,
          timeStr: t1,
          timeVal,
          label: `${d1} - ${t1}`,
        };
      }
    }
  }

  return {
    isIrregular: true,
    dayRank: 99,
    dayTrack: "Irregular",
    timeStr: t1 || t2 || "",
    timeVal: parseTimeToMinutes(t1 || t2),
    label: "Irregular Schedule",
  };
};

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

export function Invitations({
  students,
  testDate: globalTestDate,
  classesBuffer = 0,
  testingLock,
  onUpdateTestingLock,
}: InvitationsProps) {
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  // Configurable values
  const [testDate, setTestDate] = useState(globalTestDate);

  // Sync testDate if globalTestDate changes
  React.useEffect(() => {
    setTestDate(globalTestDate);
  }, [globalTestDate]);

  const paymentDeadline = useMemo(
    () => getPaymentDeadline(testDate),
    [testDate],
  );
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterSchedule, setFilterSchedule] = useState<string>("all");

  // Map rank IDs to categories to calculate test times and fees
  const getCandidateDetails = (
    student: Student,
    program: "karate" | "tots" | "kobudo",
  ) => {
    const rankId = getStudentRankId(student, program);
    const nextBelt = getNextRank(program, rankId);
    if (!nextBelt) return null;

    const category = getRankCategory(program, rankId);
    const groupLabel = getGroupLabel(program, rankId);
    const testTime = getTestTime(program, rankId);

    // Fee calculation logic: all tots exams are $25, otherwise use price constant
    const fee = program === "tots" ? 25 : nextBelt.price || 0;

    // Terms/History requirement check (Karate Int 8th Kyu and above)
    const nonTermsIds = [
      "white",
      "t_white",
      "t_red",
      "t_orange",
      "t_yellow",
      "t_purple",
      "t_blue",
      "t_green",
      "t_brown",
      "t_black",
      "kyu9",
      "k_kyu9",
      "k_white",
    ];
    const termsRequired = !nonTermsIds.includes(nextBelt.id);

    return {
      student,
      nextBelt,
      testTime,
      groupLabel,
      fee: fee.toString(),
      category,
      termsRequired,
    };
  };

  // Determine eligibility matches for ALL programs and sort strictly:
  // 1. Locations: West Chester -> Monroe -> YMCA
  // 2. Within each location: Irregular schedules first
  // 3. Then class times in sequential order (only next class time after previous finishes)
  const eligibleInvitations = useMemo(() => {
    const list: (ReturnType<typeof getCandidateDetails> & {
      program: string;
    })[] = [];

    students.forEach((student) => {
      student.programs.forEach((prog) => {
        // Do not print invitations for Kobudo testing students
        if (prog === "kobudo") return;

        const eligibility = checkEligibility(student, prog, classesBuffer);
        const override = getProgramOverride(student, prog);
        const isEligible = override === "eligible"
          ? true
          : override === "ineligible"
            ? false
            : testingLock
              ? (testingLock.studentIds.includes(student.id) && (eligibility.eligible || eligibility.isProvisional))
              : (eligibility.eligible || eligibility.isProvisional);

        if (isEligible) {
          const details = getCandidateDetails(student, prog);
          if (details) {
            list.push({ ...details, program: prog });
          }
        }
      });
    });

    return list.sort((a, b) => {
      // 1. Order of locations: West Chester, Monroe, YMCA
      const locPriorityA = getLocationPriority(a.student.location);
      const locPriorityB = getLocationPriority(b.student.location);
      if (locPriorityA !== locPriorityB) {
        return locPriorityA - locPriorityB;
      }
      if (locPriorityA === 4) {
        const locComp = (a.student.location || "").localeCompare(b.student.location || "");
        if (locComp !== 0) return locComp;
      }

      // 2. Within each location: Irregular schedules first
      const schedA = getStudentScheduleClassification(a.student);
      const schedB = getStudentScheduleClassification(b.student);

      if (schedA.isIrregular && !schedB.isIrregular) return -1;
      if (!schedA.isIrregular && schedB.isIrregular) return 1;

      if (schedA.isIrregular && schedB.isIrregular) {
        // Alphabetical by student name within irregulars
        const nameComp = (a.student.name || "").localeCompare(b.student.name || "");
        if (nameComp !== 0) return nameComp;
        return a.program.localeCompare(b.program);
      }

      // 3. Regular class times: group by class day track then time sequentially
      if (schedA.dayRank !== schedB.dayRank) {
        return schedA.dayRank - schedB.dayRank;
      }
      if (schedA.timeVal !== schedB.timeVal) {
        return schedA.timeVal - schedB.timeVal;
      }
      const labelComp = schedA.label.localeCompare(schedB.label);
      if (labelComp !== 0) return labelComp;

      // Within same class time: alphabetical by student name
      const nameComp = (a.student.name || "").localeCompare(b.student.name || "");
      if (nameComp !== 0) return nameComp;
      return a.program.localeCompare(b.program);
    });
  }, [students, classesBuffer, testingLock]);

  // Handle filtering
  const filteredInvitations = useMemo(() => {
    let list = eligibleInvitations;

    if (filterLocation !== "all") {
      list = list.filter((item) => (item.student.location || "West Chester") === filterLocation);
    }

    if (filterSchedule !== "all") {
      list = list.filter((item) => {
        const sched = getStudentScheduleClassification(item.student);
        if (filterSchedule === "irregular") {
          return sched.isIrregular;
        }
        return sched.label === filterSchedule || item.student.scheduleTime1 === filterSchedule || item.student.scheduleTime2 === filterSchedule;
      });
    }

    return list;
  }, [eligibleInvitations, filterLocation, filterSchedule]);

  const uniqueSchedules = useMemo(() => {
    const schedules = new Map<string, { label: string; count: number; isIrregular: boolean; dayRank: number; timeVal: number }>();
    eligibleInvitations.forEach((item) => {
      const sched = getStudentScheduleClassification(item.student);
      const key = sched.label;
      if (!schedules.has(key)) {
        schedules.set(key, {
          label: sched.label,
          count: 1,
          isIrregular: sched.isIrregular,
          dayRank: sched.dayRank,
          timeVal: sched.timeVal,
        });
      } else {
        schedules.get(key)!.count++;
      }
    });

    return Array.from(schedules.values()).sort((a, b) => {
      if (a.isIrregular && !b.isIrregular) return -1;
      if (!a.isIrregular && b.isIrregular) return 1;
      if (a.dayRank !== b.dayRank) return a.dayRank - b.dayRank;
      if (a.timeVal !== b.timeVal) return a.timeVal - b.timeVal;
      return a.label.localeCompare(b.label);
    });
  }, [eligibleInvitations]);

  // Group invitations into pairs of 2 for beautiful 2-per-page printable page layouts
  // Sorted so that top halves are cut and stacked on bottom halves to preserve sorted order
  // When S = ceil(N / 2):
  // Top half of Sheet j has item j (from 0 to S-1)
  // Bottom half of Sheet j has item j + S (from S to N-1)
  // When all sheets are cut across the middle, stacking the Top Half stack on the Bottom Half stack gives 0..N-1 in exact order!
  const groupedSheets = useMemo(() => {
    const N = filteredInvitations.length;
    if (N === 0) return [];
    
    const S = Math.ceil(N / 2);
    const sheets = [];
    
    for (let j = 0; j < S; j++) {
      const sheetItems = [];
      // Top half of page (Sheet j)
      sheetItems.push(filteredInvitations[j]);
      // Bottom half of page (Sheet j: corresponding second-half item)
      if (j + S < N) {
        sheetItems.push(filteredInvitations[j + S]);
      }
      sheets.push(sheetItems);
    }
    
    return sheets;
  }, [filteredInvitations]);

  const totalSheets = groupedSheets.length;
  const totalInvites = filteredInvitations.length;

  const triggerPrint = () => {
    window.focus();
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="space-y-6">
      {/* Config Settings Area (Print Hidden) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg print:hidden space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-black text-zinc-100 uppercase tracking-wider">
              Testing Invitations
            </h3>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            {testingLock ? (
              <button
                onClick={() => {
                  onUpdateTestingLock?.(null);
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 font-bold text-xs uppercase tracking-wider rounded-lg transition active:scale-95 cursor-pointer border border-zinc-700"
              >
                <span>Finalized for {getMonthName(testingLock.month || testDate)}</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  const monthName = getMonthName(testDate);
                  const idsToLock = Array.from(new Set(
                    students.filter(student => !student.inactive).filter(student => {
                      return student.programs.some(prog => {
                        if (prog === "kobudo") return false;
                        const eligibility = checkEligibility(student, prog, classesBuffer);
                        const override = getProgramOverride(student, prog);
                        if (override === "eligible") return true;
                        if (override === "ineligible") return false;
                        return eligibility.eligible || eligibility.isProvisional;
                      });
                    }).map(s => s.id)
                  ));
                  onUpdateTestingLock?.({
                    date: new Date().toISOString(),
                    month: monthName,
                    studentIds: idsToLock
                  });
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition active:scale-95 cursor-pointer shadow-lg shadow-indigo-950/40 border border-indigo-500/30"
              >
                <span>Finalize for {getMonthName(testDate)}</span>
              </button>
            )}
            <button
              onClick={triggerPrint}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] sm:text-xs tracking-wider sm:tracking-widest transition shadow-xl shadow-red-900/40 cursor-pointer font-sans uppercase active:scale-95"
            >
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Inputs & Organization Guide */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1 font-semibold text-zinc-100">
                Filter by Location
              </label>
              <select
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-red-600 font-sans"
              >
                <option value="all">All Locations (West Chester → Monroe → YMCA)</option>
                <option value="West Chester">West Chester</option>
                <option value="Monroe">Monroe</option>
                <option value="YMCA">YMCA</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1 font-semibold text-zinc-100">
                Filter by Class Schedule
              </label>
              <select
                value={filterSchedule}
                onChange={(e) => setFilterSchedule(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-red-600 font-sans"
              >
                <option value="all">All Schedules & Class Times ({totalInvites} invites)</option>
                <option value="irregular">Irregular Schedules</option>
                {uniqueSchedules.map((item) => (
                  <option key={item.label} value={item.label}>
                    {item.label} ({item.count})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Cut & Stack Guide Pill */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-zinc-300">
              <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 font-bold border border-red-800/40 text-[10px] uppercase tracking-wider">
                Cut & Stack Order
              </span>
              <span className="text-zinc-400 text-[11px]">
                {totalInvites} invites across {totalSheets} sheets • Organized by <strong className="text-zinc-200">West Chester → Monroe → YMCA</strong> (Irregular first, then class times sequentially)
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 font-mono bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800 shrink-0">
              Cut sheets in half → Stack top half on bottom half
            </div>
          </div>
        </div>
      </div>

      {/* RENDER SHEETS (2 INVITATIONS PER SHEET) */}
      <div className="w-full overflow-x-auto py-4 select-none bg-zinc-950 shrink-0 print-clean-wrapper">
        <div className="min-w-[8.5in] space-y-8 flex flex-col items-center print-clean-align">
          {groupedSheets.length === 0 ? (
            <div className="bg-zinc-900 rounded-lg p-10 text-center text-zinc-500 border border-zinc-800 w-full max-w-4xl">
              <AlertCircle className="w-8 h-8 mx-auto text-zinc-500 mb-2" />
              <p className="text-sm font-semibold">
                No students meet the eligibility thresholds for printing.
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                Check student attendance cards and kata mastery under the Roster
                tab to make them eligible.
              </p>
            </div>
          ) : (
            groupedSheets.map((sheetItems, sheetIndex) => (
              <div
                key={`sheet-${sheetIndex}`}
                className="bg-white p-6 mx-auto rounded-lg shadow-2xl relative border-2 border-dashed border-zinc-200 print-sheet-portrait"
                style={{
                  width: "8.5in",
                  height: "11.0in", // Force exact standard letter height
                  boxSizing: "border-box",
                  padding: "0.4in",
                }}
              >
                {/* Horizontal cut line in exact middle of page */}
                <div 
                  className="absolute left-0 right-0 border-t border-dotted border-zinc-300 pointer-events-none"
                  style={{ top: "5.5in" }}
                />

                {/* Loop over invitations on this sheet (maximum 2) */}
                <div
                  className="h-full flex flex-col justify-between"
                  style={{ height: "10.2in" }}
                >
                  {sheetItems.map((invite, itemIndex) => (
                    <div
                      key={`invite-${invite.student.id}-${invite.program}`}
                      className={`flex flex-col p-4 border-[6px] border-double border-zinc-900 bg-white relative ${
                        itemIndex === 0 ? "mb-6" : ""
                      }`}
                      style={{
                        height: "4.6in",
                        boxSizing: "border-box",
                      }}
                    >
                      {/* Dojo Header */}
                      <div className="flex flex-col items-center mb-2 text-center">
                        <div className="flex items-center gap-2 mb-1">
                          <DojoLogo size={36} />
                          <h2 className="text-2xl font-black text-zinc-950 uppercase tracking-tight">
                            Buckner Martial Arts
                          </h2>
                        </div>
                      </div>

                      {/* Centered Student Underlined Name Column */}
                      <div className="text-center mb-3">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-0.5">
                          Student Candidate:
                        </span>
                        <div className="text-xl font-black uppercase text-zinc-950 px-4 border-b-2 border-zinc-950 pb-0.5 inline-block min-w-[280px] max-w-full">
                          {invite.student.name}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                          {invite.student.location}
                          {getClassScheduleString(invite.student)
                            ? ` | ${getClassScheduleString(invite.student)}`
                            : ""}
                        </div>
                      </div>

                      {/* Half-Sheet Invitation Content */}
                      <div className="flex-1 flex flex-col items-center justify-center text-center py-2 px-6 relative">
                        <div className="space-y-4 w-full">
                          <h2 className="text-lg font-black text-zinc-900 uppercase tracking-wide leading-tight">
                            Congratulations! You are eligible to test!
                          </h2>

                          <div className="space-y-2 pt-2 text-left max-w-[280px] mx-auto">
                            <div className="flex items-end gap-3">
                              <span className="text-sm font-bold text-zinc-900 min-w-[50px]">
                                Date:
                              </span>
                              <div className="flex-1 border-b-2 border-zinc-950 h-5 px-2 text-sm font-black uppercase text-zinc-900">
                                {testDate}
                              </div>
                            </div>

                            <div className="flex items-end gap-3">
                              <span className="text-sm font-bold text-zinc-900 min-w-[50px] whitespace-nowrap">
                                Test Time:
                              </span>
                              <div className="flex-1 border-b-2 border-zinc-950 h-5 px-2 text-sm font-black uppercase text-zinc-900">
                                {invite.testTime}
                              </div>
                            </div>

                            <div className="flex items-end gap-1">
                              <span className="text-sm font-bold text-zinc-900 whitespace-nowrap">
                                Testing Fee:
                              </span>
                              <div className="flex-1 border-b-2 border-zinc-950 h-5 px-2 text-sm font-black text-zinc-900">
                                ${parseFloat(invite.fee).toFixed(2)}
                              </div>
                            </div>
                          </div>

                          <div className="pt-3 space-y-1 px-4 text-center select-text">
                            {invite.termsRequired && (
                              <p className="text-[9px] font-bold text-red-700 uppercase tracking-widest leading-tight">
                                * Terms & History Required *
                              </p>
                            )}
                            <p className="text-[10px] font-bold text-zinc-950 leading-tight">
                              Payment must be made by {paymentDeadline}.
                            </p>
                            <p className="text-[10px] font-bold text-zinc-950 leading-tight">
                              Check in at the front desk upon arrival.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* If single invite on sheet, render empty whitespace container blank for print */}
                  {sheetItems.length === 1 && (
                    <>
                      {/* Screen-only display placeholder */}
                      <div
                        className="flex-1 border-2 border-dashed border-gray-200 rounded-xl flex flex-col justify-center items-center p-8 bg-zinc-50 print:hidden"
                        style={{ height: "4.6in" }}
                      >
                        <span className="text-zinc-400 font-mono text-xs uppercase font-bold">
                          Blank Invitation Block
                        </span>
                        <span className="text-[10px] text-zinc-300 font-mono mt-1">
                          Single invitation layout. Bottom half is printed
                          completely blank.
                        </span>
                      </div>

                      {/* Print-only exact spacing placeholder (Prints completely blank) */}
                      <div
                        className="hidden print:block"
                        style={{ height: "4.6in" }}
                      />
                    </>
                  )}
                </div>
              </div>
            ))
          )}
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
          .print-sheet-portrait {
            width: 8.5in !important;
            height: 11.0in !important;
            box-sizing: border-box !important;
            padding: 0.4in !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            position: relative !important;
            background: white !important;
          }
          .print-sheet-portrait:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
