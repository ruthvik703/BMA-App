import React, { useMemo, useEffect, useState } from "react";
import { Student, BeltRank } from "../types";
import {
  getNextRank,
  getTestTime,
  checkEligibility,
  getStudentRankId,
  getProgramOverride,
  KARATE_RANKS,
  TOTS_RANKS,
  KOBUDO_RANKS,
} from "../constants";
import { DojoLogo } from "./DojoLogo";
import {
  Printer,
  ShoppingBag,
  CheckCircle2,
  AlertCircle,
  Package,
  Plus,
  Minus,
  Undo2,
  Redo2,
  ShieldAlert,
} from "lucide-react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  db,
  isFirebaseConfigured,
  handleFirestoreError,
  OperationType,
} from "../firebase";

interface BeltPullListProps {
  students: Student[];
  testDate: string;
  classesBuffer?: number;
  isDatabaseActive?: boolean;
  testingLock?: { date: string; month: string; studentIds: string[] } | null;
  onUpdateTestingLock?: (
    lock: { date: string; month: string; studentIds: string[] } | null,
  ) => void;
}

interface BeltRequirement {
  rankName: string;
  color: string;
  stripe?: BeltRank["stripe"];
  program: string;
  size: string;
  count: number;
  studentNames: string[];
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

export function BeltPullList({
  students,
  testDate,
  classesBuffer = 0,
  isDatabaseActive = true,
  testingLock,
  onUpdateTestingLock,
}: BeltPullListProps) {
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const eligibleCandidates = useMemo(() => {
    const candidates: any[] = [];
    students.forEach((student) => {
      student.programs.forEach((prog) => {
        const eligibility = checkEligibility(student, prog, classesBuffer);
        const override = getProgramOverride(student, prog);
        const isEligible = override === "eligible"
          ? true
          : override === "ineligible"
            ? false
            : testingLock
              ? (testingLock.studentIds.includes(student.id) && eligibility.eligible)
              : (eligibility.eligible || eligibility.isProvisional);

        if (isEligible) {
          const curRank = getStudentRankId(student, prog);
          const targetRank = getNextRank(prog, curRank);
          if (targetRank) {
            candidates.push({
              ...student,
              activeProgram: prog,
              targetRank,
            });
          }
        }
      });
    });
    return candidates;
  }, [students, classesBuffer, testingLock]);

  const [pulledCounts, setPulledCounts] = React.useState<{
    [key: string]: number;
  }>(() => {
    try {
      const saved = localStorage.getItem("bma_belt_inventory_counts");
      if (saved) {
        const parsed = JSON.parse(saved);
        const normalized: { [key: string]: number } = {};
        Object.entries(parsed).forEach(([k, v]) => {
          const cleanK = k.replace(/\s*[Ss]plit\b/g, "").trim();
          normalized[cleanK] = (normalized[cleanK] || 0) + (v as number);
        });
        return normalized;
      }
      return {};
    } catch {
      return {};
    }
  });

  // Real-time synchronization of pulled counts with Firebase Firestore
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !isDatabaseActive) return;
    const docRef = doc(db, "beltInventory", "current");
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.counts) {
            const normalized: { [key: string]: number } = {};
            Object.entries(data.counts).forEach(([k, v]) => {
              const cleanK = k.replace(/\s*[Ss]plit\b/g, "").trim();
              normalized[cleanK] = (normalized[cleanK] || 0) + (v as number);
            });
            setPulledCounts(normalized);
            localStorage.setItem(
              "bma_belt_inventory_counts",
              JSON.stringify(normalized),
            );
          }
        } else {
          setPulledCounts({});
        }
      },
      (err) => {
        console.error("Error fetching belt inventory:", err);
      },
    );
    return () => unsubscribe();
  }, [isDatabaseActive]);

  const pullList = useMemo(() => {
    const groups: { [key: string]: BeltRequirement } = {};

    eligibleCandidates.forEach((c) => {
      const size = c.activeProgram === "tots" ? "0" : c.beltSize || "Unknown";
      const key = `${c.targetRank.id}-${size}`;

      if (!groups[key]) {
        groups[key] = {
          rankName: c.targetRank.name,
          color: c.targetRank.color,
          stripe: c.targetRank.stripe,
          program: c.activeProgram,
          size,
          count: 0,
          studentNames: [],
        };
      }
      groups[key].count += 1;
      groups[key].studentNames.push(c.name);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.program !== b.program) return a.program.localeCompare(b.program);
      return a.rankName.localeCompare(b.rankName);
    });
  }, [eligibleCandidates]);

  const [printMode, setPrintMode] = React.useState<"full" | "order">("full");
  const [viewMode, setViewMode] = useState<"action" | "inventory">("action");
  const BELT_SIZES = ["0", "1", "2", "3", "4", "5", "6"];
  const getSizesForProgram = (programId: string) => {
    if (programId === "tots") return ["0"];
    return BELT_SIZES;
  };

  interface PendingAddition {
    program: "karate" | "tots" | "kobudo";
    rankName: string;
    size: string;
    qty: number;
  }
  const [pendingAdditions, setPendingAdditions] = useState<PendingAddition[]>(
    [],
  );

  const [showAddMode, setShowAddMode] = useState(false);
  const [inventoryAction, setInventoryAction] = useState<"add" | "remove">(
    "add",
  );
  const [addProg, setAddProg] = useState<"karate" | "tots" | "kobudo">(
    "karate",
  );
  const [addRank, setAddRank] = useState<string>("");
  const [addSize, setAddSize] = useState<string>("0");
  const [addQty, setAddQty] = useState<number>(1);

  const [history, setHistory] = useState<
    { counts: { [key: string]: number } }[]
  >([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pushHistory = (
    currentCounts: { [key: string]: number },
    nextCounts: { [key: string]: number },
  ) => {
    let newHistory = history;
    let newIndex = historyIndex;

    if (newHistory.length === 0) {
      newHistory = [{ counts: currentCounts }];
      newIndex = 0;
    } else {
      newHistory = newHistory.slice(0, newIndex + 1);
    }

    newHistory.push({ counts: nextCounts });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = async () => {
    if (historyIndex > 0) {
      const prevCounts = history[historyIndex - 1].counts;
      setHistoryIndex(historyIndex - 1);

      setPulledCounts(prevCounts);
      localStorage.setItem(
        "bma_belt_inventory_counts",
        JSON.stringify(prevCounts),
      );

      if (isFirebaseConfigured && db && isDatabaseActive) {
        try {
          const docRef = doc(db, "beltInventory", "current");
          await setDoc(docRef, {
            counts: prevCounts,
            lastUpdated: new Date().toISOString(),
          });
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.WRITE,
            "beltInventory/current",
          );
        }
      }
    }
  };

  const handleRedo = async () => {
    if (historyIndex < history.length - 1) {
      const nextCounts = history[historyIndex + 1].counts;
      setHistoryIndex(historyIndex + 1);

      setPulledCounts(nextCounts);
      localStorage.setItem(
        "bma_belt_inventory_counts",
        JSON.stringify(nextCounts),
      );

      if (isFirebaseConfigured && db && isDatabaseActive) {
        try {
          const docRef = doc(db, "beltInventory", "current");
          await setDoc(docRef, {
            counts: nextCounts,
            lastUpdated: new Date().toISOString(),
          });
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.WRITE,
            "beltInventory/current",
          );
        }
      }
    }
  };

  // Auto-reset state back to full/UI list views after print dialog interaction closes
  React.useEffect(() => {
    const handleAfterPrint = () => {
      setPrintMode("full");
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const updatePulled = async (key: string, val: number) => {
    const newCounts = { ...pulledCounts, [key]: Math.max(0, val) };
    pushHistory(pulledCounts, newCounts);
    setPulledCounts(newCounts); // optimistic UI update
    localStorage.setItem(
      "bma_belt_inventory_counts",
      JSON.stringify(newCounts),
    );

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        const docRef = doc(db, "beltInventory", "current");
        await setDoc(docRef, {
          counts: newCounts,
          lastUpdated: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "beltInventory/current");
      }
    }
  };

  const handleAddPending = () => {
    if (!addRank) return;
    const existingIdx = pendingAdditions.findIndex(
      (p) =>
        p.program === addProg && p.rankName === addRank && p.size === addSize,
    );
    if (existingIdx !== -1) {
      const updated = [...pendingAdditions];
      updated[existingIdx].qty += addQty;
      setPendingAdditions(updated);
    } else {
      setPendingAdditions([
        ...pendingAdditions,
        {
          program: addProg,
          rankName: addRank,
          size: addSize,
          qty: addQty,
        },
      ]);
    }
    setAddQty(1);
  };

  const handleSaveAllAdditions = async () => {
    if (pendingAdditions.length === 0) return;
    const newCounts = { ...pulledCounts };
    pendingAdditions.forEach((item) => {
      const key = `${item.program}-${item.rankName}-${item.size}`;
      if (inventoryAction === "add") {
        newCounts[key] = Math.max(0, (newCounts[key] || 0) + item.qty);
      } else {
        newCounts[key] = Math.max(0, (newCounts[key] || 0) - item.qty);
      }
    });

    pushHistory(pulledCounts, newCounts);
    setPulledCounts(newCounts); // optimistic UI update
    localStorage.setItem(
      "bma_belt_inventory_counts",
      JSON.stringify(newCounts),
    );
    setPendingAdditions([]);
    setShowAddMode(false);

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        const docRef = doc(db, "beltInventory", "current");
        await setDoc(docRef, {
          counts: newCounts,
          lastUpdated: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, "beltInventory/current");
      }
    }
  };

  const actionList = useMemo(() => {
    return pullList.map((item) => {
      const key = `${item.program}-${item.rankName}-${item.size}`;
      const stock = pulledCounts[key] || 0;
      const toPull = Math.min(item.count, stock);
      const toOrder = Math.max(0, item.count - stock);
      return { ...item, stock, toPull, toOrder };
    });
  }, [pullList, pulledCounts]);

  const stats = useMemo(() => {
    return {
      totalBelts: eligibleCandidates.length,
      programs: {
        karate: eligibleCandidates.filter((c) => c.activeProgram === "karate")
          .length,
        tots: eligibleCandidates.filter((c) => c.activeProgram === "tots")
          .length,
        kobudo: eligibleCandidates.filter((c) => c.activeProgram === "kobudo")
          .length,
      },
    };
  }, [eligibleCandidates]);

  const triggerPrint = (mode: "full" | "order") => {
    setPrintMode(mode);
    window.focus();
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const orderList = useMemo(() => {
    return actionList.filter((item) => item.toOrder > 0);
  }, [actionList]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto min-h-screen pb-20 select-none">
      {/* Header / Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 print:hidden">
        <div className="flex items-center gap-4">
          <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20">
            <Package className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-100 uppercase tracking-tight">
              Belt Inventory
            </h1>
            <p className="text-zinc-500 text-sm font-medium">
              Tracking for {testDate || "upcoming test"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 justify-center w-full md:w-auto">
          {viewMode === "action" && (
            <>
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
                          const eligibility = checkEligibility(student, prog, classesBuffer);
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
                onClick={() => triggerPrint("full")}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] sm:text-xs tracking-wider sm:tracking-widest transition shadow-xl shadow-red-900/40 cursor-pointer font-sans uppercase active:scale-95"
              >
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Print to Pull</span>
              </button>
              <button
                onClick={() => triggerPrint("order")}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] sm:text-xs tracking-wider sm:tracking-widest transition shadow-xl shadow-red-900/40 cursor-pointer font-sans uppercase active:scale-95"
              >
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Print to Order</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 mx-auto w-full max-w-md print:hidden">
        <button
          onClick={() => setViewMode("action")}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition ${
            viewMode === "action"
              ? "bg-red-600 text-white shadow-lg"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Test Actions
        </button>
        <button
          onClick={() => setViewMode("inventory")}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition ${
            viewMode === "inventory"
              ? "bg-red-600 text-white shadow-lg"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Full Inventory
        </button>
      </div>

      {/* Summary Stats */}
      {viewMode === "action" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
          <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
              Total Needed
            </span>
            <span className="text-2xl font-black text-zinc-100">
              {stats.totalBelts}
            </span>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl border-l-4 border-l-red-600">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
              Karate
            </span>
            <span className="text-2xl font-black text-zinc-100">
              {stats.programs.karate}
            </span>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl border-l-4 border-l-blue-600">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
              Tots
            </span>
            <span className="text-2xl font-black text-zinc-100">
              {stats.programs.tots}
            </span>
          </div>
          <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl border-l-4 border-l-amber-600">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">
              Kobudo
            </span>
            <span className="text-2xl font-black text-zinc-100">
              {stats.programs.kobudo}
            </span>
          </div>
        </div>
      )}

      {/* 1. Main Inventory Pull List Table (Visible on screen; on print, hidden if mode is order) */}
      {viewMode === "action" && (
        <div
          className={`bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:border print:border-zinc-200 ${printMode === "order" ? "print:hidden" : ""}`}
        >
          <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DojoLogo
                size={36}
                className="shadow-none border-zinc-200 bg-transparent flex-none shrink-0 print:!w-8 print:!h-8"
              />
              <div>
                <h2 className="text-base font-black text-zinc-900 uppercase tracking-tight leading-tight">
                  Belt Inventory Pull List
                </h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none mt-0.5">
                  {testDate}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    Program
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    Belt Name
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    Size
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">
                    Req.
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center bg-zinc-100/50">
                    To Pull
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">
                    To Order
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black text-zinc-500 uppercase tracking-widest print:hidden">
                    Candidates
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {actionList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-20 text-center text-zinc-400 italic"
                    >
                      No eligible candidates found for this test date.
                    </td>
                  </tr>
                ) : (
                  actionList.map((item, idx) => {
                    return (
                      <tr key={idx} className="hover:bg-zinc-50/50 transition">
                        <td className="px-6 py-4">
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                              item.program === "karate"
                                ? "bg-red-100 text-red-700"
                                : item.program === "tots"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {item.program}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-black text-zinc-800 uppercase tracking-tight leading-none">
                            {item.rankName}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-sm font-black font-mono ${item.size === "Unknown" ? "text-red-500" : "text-zinc-600"}`}
                          >
                            {item.size}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-bold text-zinc-500">
                            {item.count}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center bg-zinc-50/50 print:bg-transparent">
                          <span className="text-sm font-black text-zinc-900">
                            {item.toPull}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-lg font-black ${item.toOrder > 0 ? "text-red-600" : "text-green-600"}`}
                          >
                            {item.toOrder > 0 ? `${item.toOrder} Order` : "OK"}
                          </span>
                        </td>
                        <td className="px-6 py-4 print:hidden">
                          <p className="text-[10px] text-zinc-400 font-medium max-w-xs break-words">
                            {item.studentNames.join(", ")}
                          </p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Hidden Purchase Order List Table (Invisible on screen; on print, visible if mode is order) */}
      {(viewMode === "action" || printMode === "order") && (
        <div
          className={
            (viewMode === "action"
              ? `hidden ${printMode === "order" ? "print:block" : ""}`
              : "hidden") +
            " bg-white rounded-2xl p-6 shadow-xl print:shadow-none print:border print:border-zinc-200"
          }
        >
          <div className="pb-4 mb-4 border-b border-zinc-200">
            <div className="flex items-center gap-3">
              <DojoLogo
                size={36}
                className="shadow-none border-zinc-200 bg-transparent flex-none shrink-0 print:!w-8 print:!h-8"
              />
              <div>
                <h2 className="text-base font-black text-zinc-900 uppercase tracking-tight leading-tight">
                  Belt Purchase Order List
                </h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none mt-0.5">
                  {testDate}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="px-4 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    Program
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    Belt Name
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    Size
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black text-red-600 uppercase tracking-widest text-center bg-zinc-100/50">
                    To Order Qty
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {orderList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-20 text-center text-zinc-500 italic font-medium"
                    >
                      All required belts have been successfully pulled. No
                      orders needed!
                    </td>
                  </tr>
                ) : (
                  orderList.map((item, idx) => {
                    return (
                      <tr
                        key={idx}
                        className="transition border-b border-zinc-200"
                      >
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-extrabold uppercase text-zinc-700">
                            {item.program}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-zinc-800 uppercase">
                            {item.rankName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-black font-mono text-zinc-600">
                            {item.size}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center bg-zinc-50">
                          <span className="text-sm font-black text-red-600">
                            {item.toOrder}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Full Inventory Table */}
      {viewMode === "inventory" && (
        <div className="flex flex-col gap-8 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 text-white p-6 rounded-2xl print:hidden">
            {showAddMode ? (
              <div className="flex flex-col gap-4 w-full">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full">
                  <div className="flex flex-col">
                    <label className="text-[10px] text-zinc-400 uppercase font-black tracking-wider mb-1 ml-0.5">
                      Program Type
                    </label>
                    <select
                      value={addProg}
                      onChange={(e) => {
                        const nextProg = e.target.value as any;
                        setAddProg(nextProg);
                        setAddRank("");
                        if (nextProg === "tots") setAddSize("0");
                      }}
                      className="bg-zinc-950 border border-zinc-800 text-xs font-bold uppercase p-3 rounded-lg focus:border-red-500 focus:outline-none w-full"
                    >
                      <option value="karate">Karate</option>
                      <option value="tots">Tots</option>
                      <option value="kobudo">Kobudo</option>
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[10px] text-zinc-400 uppercase font-black tracking-wider mb-1 ml-0.5">
                      Belt Rank
                    </label>
                    <select
                      value={addRank}
                      onChange={(e) => setAddRank(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 text-xs font-bold uppercase p-3 rounded-lg focus:border-red-500 focus:outline-none w-full"
                    >
                      <option value="">Select Rank...</option>
                      {addProg === "karate" &&
                        KARATE_RANKS.filter((r) => r.id !== "white").map(
                          (r) => (
                            <option key={r.id} value={r.name}>
                              {r.name}
                            </option>
                          ),
                        )}
                      {addProg === "tots" &&
                        TOTS_RANKS.filter((r) => r.id !== "t_white").map(
                          (r) => (
                            <option key={r.id} value={r.name}>
                              {r.name}
                            </option>
                          ),
                        )}
                      {addProg === "kobudo" &&
                        KOBUDO_RANKS.filter((r) => r.id !== "k_white").map(
                          (r) => (
                            <option key={r.id} value={r.name}>
                              {r.name}
                            </option>
                          ),
                        )}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[10px] text-zinc-400 uppercase font-black tracking-wider mb-1 ml-0.5">
                      Belt Size
                    </label>
                    <select
                      value={addSize}
                      onChange={(e) => setAddSize(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 text-xs font-bold uppercase p-3 rounded-lg focus:border-red-500 focus:outline-none w-full"
                    >
                      {getSizesForProgram(addProg).map((s) => (
                        <option key={s} value={s}>
                          Size {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[10px] text-zinc-400 uppercase font-black tracking-wider mb-1 ml-0.5">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={addQty}
                      onChange={(e) => setAddQty(parseInt(e.target.value) || 0)}
                      className="bg-zinc-950 border border-zinc-800 text-sm font-bold p-3 rounded-lg text-center focus:border-red-500 focus:outline-none w-full"
                      placeholder="Qty"
                    />
                  </div>
                </div>

                {/* Pending Additions list */}
                {pendingAdditions.length > 0 && (
                  <div className="border border-zinc-800 bg-zinc-950 p-4 rounded-xl space-y-3 w-full">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                        {inventoryAction === "add"
                          ? "Pending Belt Additions"
                          : "Pending Belt Removals"}{" "}
                        ({pendingAdditions.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingAdditions([])}
                        className="text-[9px] font-black uppercase text-red-500 hover:text-red-400 tracking-widest"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                      {pendingAdditions.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-extrabold text-zinc-300"
                        >
                          <span className="capitalize text-zinc-500 font-black">
                            {item.program}:
                          </span>
                          <span className="text-zinc-100 font-bold">
                            {item.rankName} (S{item.size})
                          </span>
                          <span className="text-red-500 font-black ml-1">
                            {inventoryAction === "add"
                              ? `+${item.qty}`
                              : `-${item.qty}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingAdditions(
                                pendingAdditions.filter((_, i) => i !== idx),
                              );
                            }}
                            className="text-zinc-500 hover:text-red-500 font-black text-sm ml-1.5 px-1 hover:bg-zinc-800 rounded transition"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <button
                    type="button"
                    disabled={!addRank}
                    onClick={handleAddPending}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-30 disabled:hover:bg-zinc-800 border border-zinc-700 px-5 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center transition cursor-pointer"
                  >
                    {inventoryAction === "add" ? (
                      <>
                        <Plus className="w-4 h-4 mr-1.5" /> Add to entry list
                      </>
                    ) : (
                      <>
                        <Minus className="w-4 h-4 mr-1.5" /> Add to removal list
                      </>
                    )}
                  </button>
                  {pendingAdditions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveAllAdditions}
                      className="bg-red-600 hover:bg-red-500 text-white px-5 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center transition shadow-lg shadow-red-900/40 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />{" "}
                      {inventoryAction === "add"
                        ? "Save Additions"
                        : "Save Removals"}{" "}
                      (
                      {pendingAdditions.reduce(
                        (sum, item) => sum + item.qty,
                        0,
                      )}
                      )
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAdditions([]);
                      setShowAddMode(false);
                    }}
                    className="text-zinc-500 hover:text-zinc-300 px-4 py-3 uppercase text-[10px] font-black tracking-widest transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="font-black uppercase tracking-widest text-lg">
                    Full Inventory
                  </h3>
                  <p className="text-zinc-400 text-sm">
                    View and manage all available belt stock manually.
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => {
                        setShowAddMode(true);
                        setInventoryAction("add");
                      }}
                      className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-5 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition shadow-lg w-full justify-center sm:w-auto"
                    >
                      <Plus className="w-4 h-4" /> Add New Belts
                    </button>
                    <button
                      onClick={() => {
                        setShowAddMode(true);
                        setInventoryAction("remove");
                      }}
                      className="bg-zinc-800 hover:bg-red-950/40 border border-zinc-700 hover:border-red-900/60 text-white px-5 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition shadow-lg w-full justify-center sm:w-auto"
                    >
                      <Minus className="w-4 h-4" /> Remove Belts
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleUndo}
                      disabled={historyIndex <= 0}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 border border-zinc-700 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition shadow-sm"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> Undo
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={historyIndex >= history.length - 1}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 border border-zinc-700 text-white px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition shadow-sm"
                    >
                      <Redo2 className="w-3.5 h-3.5" /> Redo
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {[
            {
              id: "karate",
              name: "Karate",
              ranks: KARATE_RANKS.filter((r) => r.id !== "white"),
            },
            {
              id: "tots",
              name: "Tots",
              ranks: TOTS_RANKS.filter((r) => r.id !== "t_white"),
            },
            {
              id: "kobudo",
              name: "Kobudo",
              ranks: KOBUDO_RANKS.filter((r) => r.id !== "k_white"),
            },
          ].map((program) => (
            <div
              key={program.id}
              className="bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:border print:border-zinc-300"
            >
              <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
                <h2 className="text-lg font-black text-zinc-900 uppercase">
                  {program.name} Inventory
                </h2>
              </div>
              <div className="hidden sm:block overflow-auto max-h-[550px] print:max-h-none print:overflow-visible relative scrollbar-thin">
                <table className="w-full text-left border-collapse border-2 border-zinc-400">
                  <thead className="relative z-20">
                    <tr className="bg-zinc-100 border-b-2 border-zinc-400">
                      <th className="px-3 sm:px-6 py-4 text-[10.5px] font-black text-zinc-700 uppercase tracking-widest sticky left-0 top-0 bg-zinc-100 z-30 w-16 sm:w-64 min-w-[64px] sm:min-w-[200px] border-r-2 border-b-2 border-zinc-400 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                        Rank
                      </th>
                      {getSizesForProgram(program.id).map((sz) => (
                        <th
                          key={sz}
                          className="px-4 py-4 text-[10.5px] font-black text-zinc-700 uppercase tracking-widest text-center border-r-2 border-b-2 border-zinc-400 sticky top-0 bg-zinc-100 z-20"
                        >
                          Size {sz}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-zinc-400">
                    {program.ranks.map((rank, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-zinc-50/70 transition relative"
                      >
                        <td className="px-3 sm:px-6 py-4 sticky left-0 bg-white group-hover:bg-zinc-50/70 z-10 border-r-2 border-b-2 border-zinc-400 shadow-[2px_0_4px_rgba(0,0,0,0.03)]">
                          <div className="flex items-center gap-1.5 sm:gap-3">
                            <div
                              className="relative w-10 h-3 shrink-0 rounded shadow-sm border border-black/10 overflow-hidden"
                              style={{ background: rank.color }}
                            >
                              {rank.stripe &&
                                rank.stripe.style === "horizontal" && (
                                  <div
                                    className="absolute inset-x-0 h-0.5"
                                    style={{
                                      backgroundColor: rank.stripe.color,
                                      top: "calc(50% - 1px)",
                                    }}
                                  />
                                )}
                            </div>
                            <span className="hidden sm:block text-sm font-black text-zinc-800 uppercase tracking-tight leading-tight">
                              {rank.name}
                            </span>
                          </div>
                        </td>
                        {getSizesForProgram(program.id).map((sz) => {
                          const key = `${program.id}-${rank.name}-${sz}`;
                          const currentStock = pulledCounts[key] || 0;
                          return (
                            <td
                              key={sz}
                              className={`px-2 py-3 text-center border-r-2 border-b-2 border-zinc-400 ${currentStock === 0 ? "bg-red-50/60" : ""}`}
                            >
                              <div className="flex items-center justify-center w-full max-w-[84px] mx-auto gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePulled(
                                      key,
                                      Math.max(0, currentStock - 1),
                                    )
                                  }
                                  className="w-7 h-8 flex items-center justify-center text-zinc-500 hover:text-red-700 hover:bg-red-100 rounded bg-zinc-100 transition shrink-0 print:hidden border border-zinc-300"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={currentStock || ""}
                                  placeholder="0"
                                  onChange={(e) =>
                                    updatePulled(
                                      key,
                                      parseInt(e.target.value) || 0,
                                    )
                                  }
                                  className={`w-9 text-center text-sm font-black bg-transparent border-none focus:ring-0 p-0 m-0 ${currentStock === 0 ? "text-red-600" : "text-zinc-950"}`}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePulled(key, currentStock + 1)
                                  }
                                  className="w-7 h-8 flex items-center justify-center text-zinc-500 hover:text-green-700 hover:bg-green-100 rounded bg-zinc-100 transition shrink-0 print:hidden border border-zinc-300"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Layout */}
              <div className="sm:hidden flex flex-col gap-4">
                {program.ranks.map((rank, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-lg border-2 border-zinc-400 p-4 shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3 border-b-2 border-zinc-200 pb-3">
                      <div
                        className="relative w-12 h-4 shrink-0 rounded shadow-sm border border-black/10 overflow-hidden"
                        style={{ background: rank.color }}
                      >
                        {rank.stripe && rank.stripe.style === "horizontal" && (
                          <div
                            className="absolute inset-x-0 h-1"
                            style={{
                              backgroundColor: rank.stripe.color,
                              top: "calc(50% - 2px)",
                            }}
                          />
                        )}
                      </div>
                      <span className="text-base font-black text-zinc-800 uppercase tracking-tight leading-tight">
                        {rank.name}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {getSizesForProgram(program.id).map((sz) => {
                        const key = `${program.id}-${rank.name}-${sz}`;
                        const currentStock = pulledCounts[key] || 0;
                        return (
                          <div
                            key={sz}
                            className={`flex flex-col items-center p-2 rounded border-2 border-zinc-300 ${currentStock === 0 ? "bg-red-50/60" : "bg-zinc-50"}`}
                          >
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                              Size {sz}
                            </span>
                            <div className="flex items-center justify-center w-full gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updatePulled(
                                    key,
                                    Math.max(0, currentStock - 1),
                                  )
                                }
                                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-red-700 hover:bg-red-100 rounded bg-white transition shrink-0 border border-zinc-300 shadow-sm"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={currentStock || ""}
                                placeholder="0"
                                onChange={(e) =>
                                  updatePulled(
                                    key,
                                    parseInt(e.target.value) || 0,
                                  )
                                }
                                className={`w-12 text-center text-base font-black bg-transparent border-none focus:ring-0 p-0 m-0 ${currentStock === 0 ? "text-red-600" : "text-zinc-950"}`}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updatePulled(key, currentStock + 1)
                                }
                                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-green-700 hover:bg-green-100 rounded bg-white transition shrink-0 border border-zinc-300 shadow-sm"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

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
          html, body, #root, main {
            background: white !important;
            background-color: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            display: block !important;
            overflow: visible !important;
          }
          body {
            padding: 0.4in !important;
          }
          div, table, tr, td, th {
            max-width: none !important;
            width: 100% !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
          table {
            border-collapse: collapse !important;
          }
          th, td {
            width: auto !important;
            border-bottom: 1px solid #e5e7eb !important;
            padding: 8px !important;
          }
          .print\\:hidden { display: none !important; }
          .hidden { display: none !important; }
          .print\\:block { display: block !important; }
          
          /* Prevent any scroll bar or clip from appearing in print output */
          ::-webkit-scrollbar {
            display: none !important;
          }
          * {
            scrollbar-width: none !important;
            overflow: visible !important;
          }
        }
      `}</style>
    </div>
  );
}
