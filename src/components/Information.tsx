import React, { useState, useEffect } from "react";
import {
  Award,
  Clock,
  MapPin,
  DollarSign,
  Calculator,
  CalendarDays,
  Lock,
  AlertTriangle,
  X,
} from "lucide-react";
import { DojoLogo } from "./DojoLogo";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { UserRole } from "../types";

export interface InformationProps {
  userRole?: UserRole;
  isDatabaseActive?: boolean;
}

export function Information({
  userRole = "Front Desk",
  isDatabaseActive = true,
}: InformationProps) {
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockError, setLockError] = useState("");
  const [isLocking, setIsLocking] = useState(false);

  const handleLockApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLockError("");
    setIsLocking(true);

    try {
      if (!db) throw new Error("Database connection unavailable.");

      const settingsRef = doc(db, "settings", "general");
      await setDoc(
        settingsRef,
        { active: false, lockedAt: new Date().toISOString() },
        { merge: true }
      );
      setShowLockModal(false);
    } catch (err) {
      console.error("Lock app error:", err);
      setLockError("An error occurred while locking app access.");
    } finally {
      setIsLocking(false);
    }
  };

  const schedule: Record<string, Record<string, Record<string, string>>> = {
    "West Chester": {
      "Monday/Wednesday": {
        Tots: "5:00 PM",
        Karate: "5:30 PM, 6:30 PM, 7:30 PM",
      },
      "Tuesday/Thursday": {
        Tots: "6:00 PM",
        Karate: "5:00 PM, 6:30 PM",
      },
    },
    Monroe: {
      "Monday/Wednesday": {
        Tots: "6:05 PM",
        Karate: "5:00 PM, 6:40 PM",
      },
      "Tuesday/Thursday": {
        Tots: "5:45 PM",
        Karate: "6:20 PM",
      },
    },
    YMCA: {
      Irregular: {
        "General Roster": "Irregular Schedule",
      },
    },
  };

  interface ProgramGuide {
    name: string;
    age: string;
    guidelines: string[];
  }

  const programs: ProgramGuide[] = [
    {
      name: "Tots Program",
      age: "Tots Ranks",
      guidelines: ["All ranks: 16 classes minimum."],
    },
    {
      name: "Karate Program",
      age: "Standard Ranks",
      guidelines: [
        "White Belt: 8 classes minimum.",
        "Testing for 1st Kyu, Int. Shodan, or Shodan: 24 classes minimum.",
        "Other Kyu ranks: 16 classes minimum.",
        "Black Belt ranks require instructor manual approval.",
      ],
    },
    {
      name: "Kobudo Program",
      age: "Weapons Class",
      guidelines: ["All ranks: 16 classes minimum."],
    },
  ];

  return (
    <>
      {showLockModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-red-900/40 rounded-xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 inset-x-0 h-1 bg-red-600" />
            <button
              onClick={() => {
                setShowLockModal(false);
                setLockError("");
              }}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center mt-2">
              <div className="w-12 h-12 bg-red-950/50 rounded-full flex items-center justify-center mb-4 border border-red-900/50">
                <Lock className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-xl font-black uppercase text-zinc-100 tracking-wider">
                Lock App Editing
              </h2>
              <p className="text-zinc-400 text-xs mt-3 leading-relaxed font-medium">
                Are you sure you want to lock the app? All logged in users will be instantly logged out. They can log back in with read-only access. This lock can only be reversed in Firebase.
              </p>
            </div>

            <form onSubmit={handleLockApp} className="mt-6 space-y-4">
              {lockError && (
                <div className="bg-red-950/30 border border-red-900/50 p-2.5 rounded flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="text-[10px] text-red-300 font-medium">
                    {lockError}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLocking}
                className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest leading-none shadow-lg cursor-pointer disabled:opacity-50 transition-all active:scale-95"
              >
                {isLocking ? "Locking..." : "Confirm Lock"}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="print:hidden space-y-6 max-w-4xl mx-auto animate-in fade-in duration-100 pb-10 select-none">
        {/* Header with Lock Action */}
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-lg shadow-black/30">
          <div>
            <h2 className="text-xl font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
              <DojoLogo size={24} className="border-0 shadow-none p-0" /> System
              Information
            </h2>
            <p className="text-zinc-500 text-[11px] uppercase tracking-wider font-bold mt-1.5">
              Guidelines & Reference
            </p>
          </div>
          {isDatabaseActive && (
            <button
              onClick={() => setShowLockModal(true)}
              className="p-3 bg-zinc-950 border border-zinc-800 hover:border-red-600 hover:text-red-500 text-zinc-400 hover:bg-zinc-900 rounded-xl transition-all shadow-inner active:scale-95"
              title="Lock App Access"
            >
              <Lock className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 1. Class Schedule Reference */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 shadow-lg shadow-black/30">
          <h3 className="text-xl font-black text-red-500 uppercase tracking-widest border-b border-zinc-800 pb-2 flex items-center gap-2">
            <Clock className="w-5 h-5 text-red-500" /> Class Schedule Reference
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.entries(schedule).map(([location, days]) => (
              <div
                key={location}
                className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800"
              >
                <h4 className="font-extrabold text-white text-sm uppercase tracking-wide flex items-center gap-1.5 border-b border-zinc-900 pb-1.5">
                  <MapPin className="w-4 h-4 text-red-500 shrink-0" />
                  {location} Dojo
                </h4>
                <div className="space-y-3">
                  {Object.entries(days).map(([dayGroup, times]) => (
                    <div key={dayGroup} className="space-y-1">
                      <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500 block">
                        {dayGroup}
                      </span>
                      <div className="space-y-1 pl-1">
                        {Object.entries(times).map(([className, timeStr]) => (
                          <div
                            key={className}
                            className="flex justify-between items-center text-xs text-zinc-300"
                          >
                            <span className="font-medium text-zinc-400">
                              {className}
                            </span>
                            <span className="font-mono text-[11px] text-white font-semibold bg-zinc-900 px-1.5 py-0.5 rounded">
                              {timeStr}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Promotion Eligibility Guidelines */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 shadow-lg shadow-black/30">
          <h3 className="text-xl font-black text-red-500 uppercase tracking-widest border-b border-zinc-800 pb-2 flex items-center gap-2">
            <Award className="w-5 h-5 text-red-500" /> Promotion Eligibility
            Guidelines
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {programs.map((program) => (
              <div
                key={program.name}
                className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800"
              >
                <div className="border-b border-zinc-900 pb-1.5">
                  <h4 className="font-extrabold text-white text-sm uppercase tracking-wide">
                    {program.name}
                  </h4>
                  <div className="text-[10px] text-zinc-500 font-bold mt-0.5">
                    <span>{program.age}</span>
                  </div>
                </div>
                <ul className="space-y-1.5 list-disc pl-4 text-xs text-zinc-400">
                  {program.guidelines.map((g, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Promotion Fee Schedule */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4 shadow-lg shadow-black/30">
          <h3 className="text-xl font-black text-red-500 uppercase tracking-widest border-b border-zinc-800 pb-2 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-red-500" /> Promotion Fee
            Schedule
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-zinc-400">
            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 space-y-3">
              <span className="font-extrabold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Calculator className="w-4 h-4 text-red-500 shrink-0" /> Karate
                & Tots Programs
              </span>
              <ul className="space-y-1 list-none leading-relaxed">
                <li className="flex justify-between border-b border-zinc-800 pb-1">
                  <span>
                    <strong>Tots Program</strong> (All belt promotions)
                  </span>{" "}
                  <strong className="text-white">$25.00</strong>
                </li>
                <li className="flex justify-between pt-1">
                  <span>
                    <strong>9th Kyu</strong> (Red with White Stripe)
                  </span>{" "}
                  <strong className="text-white">$30.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. 8th Kyu</strong> (Red/white)
                  </span>{" "}
                  <strong className="text-white">$35.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>8th Kyu</strong> (Red Belt)
                  </span>{" "}
                  <strong className="text-white">$40.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. 7th Kyu</strong> (Red/orange)
                  </span>{" "}
                  <strong className="text-white">$45.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>7th Kyu</strong> (Orange Belt)
                  </span>{" "}
                  <strong className="text-white">$50.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. 6th Kyu</strong> (Orange/yellow)
                  </span>{" "}
                  <strong className="text-white">$55.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>6th Kyu</strong> (Yellow Belt)
                  </span>{" "}
                  <strong className="text-white">$60.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. 5th Kyu</strong> (Yellow/purple)
                  </span>{" "}
                  <strong className="text-white">$65.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>5th Kyu</strong> (Purple Belt)
                  </span>{" "}
                  <strong className="text-white">$70.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. 4th Kyu</strong> (Purple/blue)
                  </span>{" "}
                  <strong className="text-white">$75.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>4th Kyu</strong> (Blue Belt)
                  </span>{" "}
                  <strong className="text-white">$80.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. 3rd Kyu</strong> (Blue/green)
                  </span>{" "}
                  <strong className="text-white">$85.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>3rd Kyu</strong> (Green Belt)
                  </span>{" "}
                  <strong className="text-white">$90.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. 2nd Kyu</strong> (Green/brown)
                  </span>{" "}
                  <strong className="text-white">$95.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>2nd Kyu</strong> (Brown Belt)
                  </span>{" "}
                  <strong className="text-white">$100.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. 1st Kyu</strong> (Brown/black)
                  </span>{" "}
                  <strong className="text-white">$105.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>1st Kyu</strong> (Brown w/ black stripe)
                  </span>{" "}
                  <strong className="text-white">$110.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. Shodan</strong> (Black w/ white stripe)
                  </span>{" "}
                  <strong className="text-white">$150.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Shodan</strong> (Black Belt)
                  </span>{" "}
                  <strong className="text-white">$225.00</strong>
                </li>
              </ul>
            </div>

            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 space-y-3 h-fit">
              <span className="font-extrabold text-zinc-100 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Calculator className="w-4 h-4 text-red-500 shrink-0" /> Kobudo
                Weapons Program
              </span>
              <ul className="space-y-1 list-none leading-relaxed">
                <li className="flex justify-between">
                  <span>
                    <strong>9th Kyu</strong> (Red with White Stripe)
                  </span>{" "}
                  <strong className="text-white">$30.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>7th Kyu</strong> (Orange with White Stripe)
                  </span>{" "}
                  <strong className="text-white">$50.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>5th Kyu</strong> (Purple with White Stripe)
                  </span>{" "}
                  <strong className="text-white">$70.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>3rd Kyu</strong> (Green with White Stripe)
                  </span>{" "}
                  <strong className="text-white">$90.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>1st Kyu</strong> (Brown with White Stripe)
                  </span>{" "}
                  <strong className="text-white">$110.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Int. Shodan</strong> (Black with White Stripe)
                  </span>{" "}
                  <strong className="text-white">$150.00</strong>
                </li>
                <li className="flex justify-between">
                  <span>
                    <strong>Shodan</strong> (Black Belt)
                  </span>{" "}
                  <strong className="text-white">$225.00</strong>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
