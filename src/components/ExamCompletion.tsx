import React, { useState, useMemo, useEffect } from 'react';
import { Student } from '../types';
import { checkEligibility, getNextRank, KARATE_RANKS, TOTS_RANKS, KOBUDO_RANKS, getStudentRankId, getProgramOverride, normalizeKobudoRankId } from '../constants';
import { DojoLogo } from './DojoLogo';
import { CheckCircle2, XCircle, Award, Lock, AlertCircle } from 'lucide-react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase';
import { getThirdSaturday, isAfterExamSubmitTime } from '../dateHelpers';

interface ExamCompletionProps {
  students: Student[];
  onUpdateStudent: (student: Student) => void;
  testDate: string;
  onTestDateChange?: (date: string) => void;
  classesBuffer?: number;
  isDatabaseActive?: boolean;
  onTabChange?: (tab: 'roster' | 'stickers' | 'testForm' | 'invitations' | 'information' | 'beltPull' | 'enrollment') => void;
  onReprintRosters?: () => void;
  testingLock?: { date: string; month: string; studentIds: string[] } | null;
  onUpdateTestingLock?: (lock: { date: string; month: string; studentIds: string[] } | null) => void;
  onUpdateInvitationsLock?: (lock: { date: string; month: string; studentIds: string[] } | null) => void;
  onUpdateLabelsLock?: (lock: { date: string; month: string; studentIds: string[] } | null) => void;
  onUpdateBeltListLock?: (lock: { date: string; month: string; studentIds: string[] } | null) => void;
  updatePastTests?: (record: any) => void;
  onClearReadinessChecklist?: () => void;
}

export function ExamCompletion({ 
  students, 
  onUpdateStudent, 
  testDate, 
  onTestDateChange,
  classesBuffer = 0, 
  isDatabaseActive = true, 
  onTabChange, 
  onReprintRosters, 
  testingLock, 
  onUpdateTestingLock,
  onUpdateInvitationsLock,
  onUpdateLabelsLock,
  onUpdateBeltListLock,
  updatePastTests,
  onClearReadinessChecklist
}: ExamCompletionProps) {
  const [justProcessed, setJustProcessed] = useState(false);

  const getNextTestDatePreset = () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const thirdSat = getThirdSaturday(nextMonth);
    const year = thirdSat.getFullYear();
    const month = String(thirdSat.getMonth() + 1).padStart(2, '0');
    const day = String(thirdSat.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [nextTestDate, setNextTestDate] = useState<string>(getNextTestDatePreset());
  const [canSubmit, setCanSubmit] = useState<boolean>(() => isAfterExamSubmitTime(testDate));

  useEffect(() => {
    setCanSubmit(isAfterExamSubmitTime(testDate));
    const interval = setInterval(() => {
      setCanSubmit(isAfterExamSubmitTime(testDate));
    }, 10000);
    return () => clearInterval(interval);
  }, [testDate]);
  // Organized candidates for display
  const candidatesByProgram = useMemo(() => {
    const groups: { [key: string]: Student[] } = {};
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
          const isPaid = student.testingFeePaidByProgram?.[prog] ?? student.testingFeePaid ?? false;
          if (isPaid) {
            if (!groups[prog]) groups[prog] = [];
            if (!groups[prog].find(s => s.id === student.id)) {
              groups[prog].push(student);
            }
          }
        }
      });
    });
    return groups;
  }, [students, testingLock, classesBuffer]);

  const [results, setResults] = useState<{ [id: string]: 'pass' | 'fail' | null }>(() => {
    const initial: { [key: string]: 'pass' | 'fail' | null } = {};
    students.forEach(s => initial[s.id] = null);
    return initial;
  });

  const saveReviewProgress = async (
    updatedResults: { [id: string]: 'pass' | 'fail' | null },
    updatedNextTestDate: string
  ) => {
    if (isFirebaseConfigured && db && isDatabaseActive) {
      const path = 'settings/examReview';
      try {
        const docRef = doc(db, 'settings', 'examReview');
        await setDoc(docRef, {
          results: updatedResults,
          nextTestDate: updatedNextTestDate,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
  };

  useEffect(() => {
    if (isFirebaseConfigured && db && isDatabaseActive) {
      const path = 'settings/examReview';
      const docRef = doc(db, 'settings', 'examReview');
      getDoc(docRef).then(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.results) {
            setResults(prev => {
              const merged = { ...prev };
              Object.entries(data.results).forEach(([id, val]) => {
                if (students.some(s => s.id === id)) {
                  merged[id] = val as 'pass' | 'fail' | null;
                }
              });
              return merged;
            });
          }
          if (data.nextTestDate) {
            setNextTestDate(data.nextTestDate);
          }
        }
      }).catch(error => {
        handleFirestoreError(error, OperationType.GET, path);
      });
    }
  }, [students, isDatabaseActive]);

  const setResult = (id: string, result: 'pass' | 'fail') => {
    setResults(prev => {
      const nextVal = prev[id] === result ? null : result;
      const next = {
        ...prev,
        [id]: nextVal
      };
      saveReviewProgress(next, nextTestDate);

      if (nextVal === 'pass') {
        const student = students.find(s => s.id === id);
        if (student) {
          onUpdateStudent({
            ...student,
            barcodePrinted: false,
            passedStickerPending: true,
          });
        }
      }

      return next;
    });
  };

  const handleNextTestDateChange = (date: string) => {
    setNextTestDate(date);
    saveReviewProgress(results, date);
  };

  const handleProcessResults = async () => {
    if (!canSubmit) {
      alert('The submit button cannot be pressed until after 3:30 PM on test day.');
      return;
    }

    if (window.confirm('Are you sure you want to finalize these exam results? Passed students will be promoted and reset.')) {
      
      // Update inventory directly by deducting passed students' target belts
      let currentCounts: { [key: string]: number } = {};
      try {
        const saved = localStorage.getItem('bma_belt_inventory_counts');
        if (saved) {
          const parsed = JSON.parse(saved);
          Object.entries(parsed).forEach(([k, v]) => {
            const cleanK = k.replace(/\s*[Ss]plit\b/g, '').trim();
            currentCounts[cleanK] = (currentCounts[cleanK] || 0) + (v as number);
          });
        }
      } catch (e) {
        console.error(e);
      }

      students.forEach(student => {
        const res = results[student.id];
        if (res === 'pass') {
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
              const _rank = getNextRank(prog, curRank);
              if (_rank) {
                const size = student.beltSize || 'Unknown';
                const key = `${prog}-${_rank.name}-${size}`.replace(/\s*[Ss]plit\b/g, '').trim();
                if (currentCounts[key] && currentCounts[key] > 0) {
                  currentCounts[key] -= 1;
                }
              }
            }
          });
        }
      });

      localStorage.setItem('bma_belt_inventory_counts', JSON.stringify(currentCounts));

      if (isFirebaseConfigured && db && isDatabaseActive) {
        try {
          const docRef = doc(db, 'beltInventory', 'current');
          const docSnap = await getDoc(docRef);
          let dbCounts: { [key: string]: number } = {};
          if (docSnap.exists() && docSnap.data()?.counts) {
            const fetchedCounts = docSnap.data().counts || {};
            Object.entries(fetchedCounts).forEach(([k, v]) => {
              const cleanK = k.replace(/\s*[Ss]plit\b/g, '').trim();
              dbCounts[cleanK] = (dbCounts[cleanK] || 0) + (v as number);
            });
          } else {
            dbCounts = { ...currentCounts };
          }
          
          students.forEach(student => {
            const res = results[student.id];
            if (res === 'pass') {
              student.programs.forEach(prog => {
                let isEligible = false;
                const eligibility = checkEligibility(student, prog, classesBuffer);
                const override = getProgramOverride(student, prog);

                if (override === 'eligible') {
                  isEligible = true;
                } else if (override === 'ineligible') {
                  isEligible = false;
                } else if (testingLock) {
                  isEligible = testingLock.studentIds.includes(student.id) && eligibility.eligible;
                } else {
                  isEligible = eligibility.eligible;
                }

                if (isEligible) {
                  const curRank = getStudentRankId(student, prog);
                  const _rank = getNextRank(prog, curRank);
                  if (_rank) {
                    const size = student.beltSize || 'Unknown';
                    const key = `${prog}-${_rank.name}-${size}`.replace(/\s*[Ss]plit\b/g, '').trim();
                    if (dbCounts[key] && dbCounts[key] > 0) {
                      dbCounts[key] -= 1;
                    }
                  }
                }
              });
            }
          });

          await setDoc(docRef, { ...docSnap.data(), counts: dbCounts, lastUpdated: new Date().toISOString() }, { merge: true });
          localStorage.setItem('bma_belt_inventory_counts', JSON.stringify(dbCounts));
        } catch (error) {
          console.error("Failed to update belt inventory during exam review completion:", error);
        }
      }

      students.forEach(student => {
        const res = results[student.id];
        let hasChanges = false;
        const updated = { ...student };

        if (updated.manualOverride) {
          updated.manualOverride = null;
          hasChanges = true;
        }

        if (updated.manualOverrides && Object.keys(updated.manualOverrides).length > 0) {
          updated.manualOverrides = {};
          hasChanges = true;
        }

        if (res === 'pass') {
          // Promote them for ALL programs they were eligible for
          const updatedRankings = { ...student.rankings };
          const updatedAttendance = { ...(student.attendance || {}) };
          const updatedTestingFeePaidByProgram = { ...(student.testingFeePaidByProgram || {}) };

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
              const _rank = getNextRank(prog, curRank);
              if (_rank) {
                updatedRankings[prog] = _rank.id;
                if (prog === 'kobudo') {
                  const kobudoR = { ...(student.kobudoRankings || {}) };
                  const testingWeapon = student.kobudoTestingWeapon || 'Both';
                  const shouldPromoteBo = testingWeapon === 'Bo' || testingWeapon === 'Both';
                  const shouldPromoteSai = testingWeapon === 'Sai' || testingWeapon === 'Both';

                  if (shouldPromoteBo) {
                    const boCur = normalizeKobudoRankId(kobudoR.bo);
                    const boNext = getNextRank('kobudo', boCur);
                    if (boNext) {
                      kobudoR.bo = boNext.id;
                      if (testingWeapon === 'Bo') {
                        updatedRankings['kobudo'] = boNext.id;
                      }
                    }
                  }
                  if (shouldPromoteSai) {
                    const saiCur = normalizeKobudoRankId(kobudoR.sai);
                    const saiNext = getNextRank('kobudo', saiCur);
                    if (saiNext) {
                      kobudoR.sai = saiNext.id;
                      if (testingWeapon === 'Sai') {
                        updatedRankings['kobudo'] = saiNext.id;
                      }
                    }
                  }
                  updated.kobudoRankings = kobudoR;
                }
                updatedAttendance[prog] = 0;
                updatedTestingFeePaidByProgram[prog] = false;
              }
            }
          });

          updated.rankings = updatedRankings;
          updated.attendance = updatedAttendance;
          updated.testingFeePaidByProgram = updatedTestingFeePaidByProgram;
          updated.testingFeePaid = false; // reset sync fallback
          updated.stickerPlaced = false;
          updated.cardFormCollected = false;
          updated.passedStickerPending = true;
          updated.barcodePrinted = false;
          hasChanges = true;
        }

        if (hasChanges) {
          onUpdateStudent(updated);
        }
      });

      // Clear all active locks of the exam components
      if (onUpdateTestingLock) {
        onUpdateTestingLock(null);
      }
      if (onUpdateInvitationsLock) {
        onUpdateInvitationsLock(null);
      }
      if (onUpdateLabelsLock) {
        onUpdateLabelsLock(null);
      }
      if (onUpdateBeltListLock) {
        onUpdateBeltListLock(null);
      }

      // Automatically clear the pre-testing readiness checklist
      const clearedChecklist = {
        printList: false,
        printLabels: false,
        printInvites: false,
        printBelts: false
      };
      localStorage.setItem('bma_testing_checklist', JSON.stringify(clearedChecklist));

      if (isFirebaseConfigured && db && isDatabaseActive) {
        try {
          const { setDoc, doc } = await import('firebase/firestore');
          await setDoc(doc(db, 'settings', 'general'), { readinessChecklist: clearedChecklist }, { merge: true });
        } catch (err) {
          console.error('Error clearing readiness checklist in DB:', err);
        }
      }

      if (onClearReadinessChecklist) {
        onClearReadinessChecklist();
      }

      // Reset print reminder dismissal flags so the next test cycle shows its reminder
      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('bma_print_reminder_cleared')) {
            localStorage.removeItem(key);
          }
        });
      } catch (err) {
        console.error(err);
      }

      setJustProcessed(true);
      alert('Exam results processed successfully.');

      // Collect unique paid candidates who were eligible and paid for this exam
      const paidCandidatesMap = new Map<string, { student: Student; prog: string }>();
      Object.entries(candidatesByProgram).forEach(([prog, studentList]) => {
        studentList.forEach(student => {
          if (!paidCandidatesMap.has(student.id)) {
            paidCandidatesMap.set(student.id, { student, prog });
          }
        });
      });

      const testingParticipants = Array.from(paidCandidatesMap.values()).map(({ student, prog }) => {
        let passedAny = false;
        let oldRank = '';
        let newRank = null;
        
        const curRankId = getStudentRankId(student, prog as any);
        const R = prog === 'karate' ? KARATE_RANKS : prog === 'tots' ? TOTS_RANKS : KOBUDO_RANKS;
        const r = R.find(x => x.id === curRankId) || R[0];
        if (r) oldRank = r.name;

        if (results[student.id] === 'pass') {
          passedAny = true;
          const nr = getNextRank(prog as any, curRankId);
          if (nr) newRank = nr.name;
        }
        
        return {
          studentId: student.id,
          studentName: student.name,
          program: prog,
          passed: results[student.id] === 'pass' && passedAny,
          oldRank,
          newRank,
          paid: true,
        };
      });

      const passedCount = testingParticipants.filter(p => p.passed).length;
      const paidCount = testingParticipants.length;

      // Save to Past Tests
      const newRecord = {
        id: String(Date.now()),
        month: testDate,
        date: new Date().toISOString(),
        paidCount,
        passedCount,
        participants: testingParticipants
      };

      if (isFirebaseConfigured && db && isDatabaseActive) {
         try {
            const { doc, setDoc, collection, getDocs, query, orderBy, deleteDoc } = await import('firebase/firestore');
            await setDoc(doc(db, 'beltTests', newRecord.id), newRecord);
            try {
               const snap = await getDocs(query(collection(db, 'beltTests'), orderBy('date', 'desc')));
               let count = 0;
               snap.forEach(d => {
                  count++;
                  if (count > 3) deleteDoc(d.ref).catch(() => {});
               });
            } catch (fetchErr) {
               handleFirestoreError(fetchErr, OperationType.GET, 'beltTests');
            }
         } catch(e) {
            handleFirestoreError(e, OperationType.WRITE, `beltTests/${newRecord.id}`);
         }
      }
      
      if (updatePastTests) {
         updatePastTests(newRecord);
      }

      // Clear the temporary updates from the database
      if (isFirebaseConfigured && db && isDatabaseActive) {
         const path = 'settings/examReview';
         try {
            const docRef = doc(db, 'settings', 'examReview');
            await setDoc(docRef, { results: {}, nextTestDate: '' });
         } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
         }
      }

      // Propagate next test date to update invitations, labels, etc.
      if (onTestDateChange) {
         onTestDateChange(nextTestDate);
      }

    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-xl font-black text-red-500 uppercase tracking-widest border-b border-zinc-800 pb-2 mb-4 flex items-center gap-2">
          <Award className="w-5 h-5" /> Exam Completion: {testDate}
        </h2>
        <p className="text-zinc-400 text-sm mb-6">
          Mark the results for all eligible candidates. Passed students will be automatically promoted and their required attendance counters will reset.
        </p>

        {Object.keys(candidatesByProgram).length === 0 ? (
          <p className="text-zinc-500 italic">No eligible candidates to process.</p>
        ) : (
          Object.entries(candidatesByProgram as { [key: string]: Student[] }).map(([prog, studentsInProg]) => (
            <div key={prog} className="space-y-4 mb-8">
              <h3 className="text-sm font-black text-zinc-300 uppercase tracking-widest border-b border-zinc-800 pb-1">
                {prog === 'karate' ? 'Karate' : prog === 'tots' ? 'Tots' : prog === 'kobudo' ? 'Kobudo' : prog}
              </h3>
              <div className="space-y-3">
                {studentsInProg.map((student) => {
                  const currentRes = results[student.id];
                  const eligibleProgsForStudent: string[] = student.programs.filter(p => {
                    if (p !== prog) return false;
                    const eligibility = checkEligibility(student, p, classesBuffer);
                    const override = getProgramOverride(student, p);
                    return override === 'eligible' ? true : override === 'ineligible' ? false : (testingLock ? (testingLock.studentIds.includes(student.id) && eligibility.eligible) : eligibility.eligible);
                  });

                  return (
                    <div key={student.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-zinc-950 border border-zinc-800 p-4 rounded-xl gap-3.5">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-zinc-100 text-sm">{student.name}</h3>
                        <div className="mt-1 space-y-2">
                          {eligibleProgsForStudent.map(p => {
                            const progType = p as 'karate' | 'tots' | 'kobudo';
                            if (progType === 'kobudo') {
                              return (
                                <div key={p} className="space-y-2 mt-1">
                                  {/* Weapon Selector */}
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                                      Testing Weapon:
                                    </span>
                                    <div className="inline-flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800 w-fit">
                                      <button
                                        type="button"
                                        onClick={() => onUpdateStudent({ ...student, kobudoTestingWeapon: 'Bo' })}
                                        className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition cursor-pointer ${
                                          student.kobudoTestingWeapon === 'Bo'
                                            ? 'bg-amber-600 text-white font-black shadow'
                                            : 'text-zinc-400 hover:text-white'
                                        }`}
                                      >
                                        Bo
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onUpdateStudent({ ...student, kobudoTestingWeapon: 'Sai' })}
                                        className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition cursor-pointer ${
                                          student.kobudoTestingWeapon === 'Sai'
                                            ? 'bg-blue-600 text-white font-black shadow'
                                            : 'text-zinc-400 hover:text-white'
                                        }`}
                                      >
                                        Sai
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onUpdateStudent({ ...student, kobudoTestingWeapon: 'Both' })}
                                        className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition cursor-pointer ${
                                          student.kobudoTestingWeapon === 'Both' || !student.kobudoTestingWeapon
                                            ? 'bg-purple-600 text-white font-black shadow'
                                            : 'text-zinc-500 hover:text-white'
                                        }`}
                                      >
                                        Both
                                      </button>
                                    </div>
                                    {!student.kobudoTestingWeapon && (
                                      <span className="text-[9px] font-bold text-amber-400 animate-pulse bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded w-fit">
                                        Select weapon
                                      </span>
                                    )}
                                  </div>

                                  {/* Target rank advancement determined by selected weapon (arranged top/below) */}
                                  {student.kobudoTestingWeapon === 'Bo' ? (
                                    <div className="flex flex-col gap-0.5 text-xs bg-amber-950/30 border border-amber-800/50 p-2 rounded-lg w-fit">
                                      {(() => {
                                        const boCurId = normalizeKobudoRankId(student.kobudoRankings?.bo);
                                        const boCur = KOBUDO_RANKS.find(r => r.id === boCurId) || KOBUDO_RANKS[0];
                                        const boTarget = getNextRank('kobudo', boCurId);
                                        return (
                                          <>
                                            <span className="uppercase text-[9.5px] font-bold text-amber-400">
                                              Current Bo: <span className="text-zinc-200">{boCur.kyuText || boCur.name}</span>
                                            </span>
                                            <span className="text-[11px] font-extrabold text-white">
                                              Target Bo: <span className="text-amber-300">{boTarget?.name || 'Max Rank'}</span>
                                            </span>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  ) : student.kobudoTestingWeapon === 'Sai' ? (
                                    <div className="flex flex-col gap-0.5 text-xs bg-blue-950/30 border border-blue-800/50 p-2 rounded-lg w-fit">
                                      {(() => {
                                        const saiCurId = normalizeKobudoRankId(student.kobudoRankings?.sai);
                                        const saiCur = KOBUDO_RANKS.find(r => r.id === saiCurId) || KOBUDO_RANKS[0];
                                        const saiTarget = getNextRank('kobudo', saiCurId);
                                        return (
                                          <>
                                            <span className="uppercase text-[9.5px] font-bold text-blue-400">
                                              Current Sai: <span className="text-zinc-200">{saiCur.kyuText || saiCur.name}</span>
                                            </span>
                                            <span className="text-[11px] font-extrabold text-white">
                                              Target Sai: <span className="text-blue-300">{saiTarget?.name || 'Max Rank'}</span>
                                            </span>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-2 text-xs">
                                      {(() => {
                                        const boCurId = normalizeKobudoRankId(student.kobudoRankings?.bo);
                                        const boCur = KOBUDO_RANKS.find(r => r.id === boCurId) || KOBUDO_RANKS[0];
                                        const boTarget = getNextRank('kobudo', boCurId);
                                        return (
                                          <div key="bo" className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded bg-amber-950/30 border border-amber-800/50 text-amber-300">
                                            <span className="font-bold uppercase text-[9px] text-amber-400">
                                              Current Bo: <span className="text-zinc-200">{boCur.kyuText || boCur.name}</span>
                                            </span>
                                            <span className="text-[11px] font-extrabold text-white">
                                              Target Bo: <span className="text-amber-300">{boTarget?.kyuText || boTarget?.name || 'Max'}</span>
                                            </span>
                                          </div>
                                        );
                                      })()}
                                      {(() => {
                                        const saiCurId = normalizeKobudoRankId(student.kobudoRankings?.sai);
                                        const saiCur = KOBUDO_RANKS.find(r => r.id === saiCurId) || KOBUDO_RANKS[0];
                                        const saiTarget = getNextRank('kobudo', saiCurId);
                                        return (
                                          <div key="sai" className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded bg-blue-950/30 border border-blue-800/50 text-blue-300">
                                            <span className="font-bold uppercase text-[9px] text-blue-400">
                                              Current Sai: <span className="text-zinc-200">{saiCur.kyuText || saiCur.name}</span>
                                            </span>
                                            <span className="text-[11px] font-extrabold text-white">
                                              Target Sai: <span className="text-blue-300">{saiTarget?.kyuText || saiTarget?.name || 'Max'}</span>
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            const curRankId = getStudentRankId(student, progType);
                            const rankList = progType === 'karate' ? KARATE_RANKS : TOTS_RANKS;
                            const curRank = rankList.find(r => r.id === curRankId) || rankList[0];
                            const targetBelt = getNextRank(progType, curRankId);
                            return (
                              <div key={p} className="flex flex-col gap-0.5 text-xs mt-1">
                                <span className="text-[11px] text-zinc-400">
                                  Current: <span className="text-zinc-200 font-semibold">{curRank.name}</span>
                                </span>
                                <span className="text-[11px] font-black text-amber-400">
                                  Target: <span className="text-white">{targetBelt?.name || 'Unknown'}</span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => setResult(student.id, 'pass')}
                          className={`p-2.5 rounded-lg font-bold text-xs uppercase flex items-center justify-center transition cursor-pointer ${
                            currentRes === 'pass' 
                              ? 'bg-green-600 text-white shadow-lg shadow-green-900/50 scale-105' 
                              : 'bg-zinc-800 text-green-500 hover:bg-green-900/30'
                          }`}
                          title="Pass"
                        >
                          <CheckCircle2 className="w-6 h-6" />
                        </button>
                        <button
                          onClick={() => setResult(student.id, 'fail')}
                          className={`p-2.5 rounded-lg font-bold text-xs uppercase flex items-center justify-center transition cursor-pointer ${
                            currentRes === 'fail' 
                              ? 'bg-red-600 text-white shadow-lg shadow-red-900/50 scale-105' 
                              : 'bg-zinc-800 text-red-500 hover:bg-red-900/30'
                          }`}
                          title="Fail"
                        >
                          <XCircle className="w-6 h-6" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-lg mb-6">
          <label className="block text-xs font-black text-zinc-400 uppercase tracking-widest mb-1.5">
            Select Next Test Day Date
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="date"
              value={nextTestDate}
              onChange={(e) => handleNextTestDateChange(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-red-500 text-xs font-black font-mono tracking-tight p-2.5 rounded focus:outline-none focus:border-red-650 transition w-full sm:w-56"
            />
            <p className="text-zinc-500 text-[11px] leading-snug">
              This date automatically defaults to the third Saturday of next month, but you can change it. Once you submit, this will update the active exam date across the app (invitations, rosters, lists, labels, etc.).
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {!canSubmit && (
            <div className="bg-amber-950/30 border border-amber-900/40 rounded-xl p-3.5 flex items-start gap-3 text-amber-300 text-xs">
              <AlertCircle className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold uppercase tracking-wide block">
                  Final Submission Locked Until 3:30 PM
                </span>
                <span className="text-zinc-400 text-[11px] leading-relaxed">
                  You can mark pass and fail grades on this review sheet now. The final submit button will automatically unlock at 3:30 PM on test day ({testDate || "Test Day"}) once all testing sessions conclude.
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleProcessResults}
            disabled={!canSubmit || Object.keys(candidatesByProgram).length === 0}
            className={`w-full font-black uppercase tracking-wider py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-lg ${
              !canSubmit
                ? "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed opacity-75"
                : Object.keys(candidatesByProgram).length === 0
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-500 text-white shadow-red-950/40 cursor-pointer active:scale-[0.99]"
            }`}
          >
            {!canSubmit ? (
              <>
                <Lock className="w-4 h-4" />
                Submit Locked (Available After 3:30 PM)
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Submit Final Results
              </>
            )}
          </button>
        </div>
      </div>

      {/* Linked Post-Exam Reminders */}
      <div className={`bg-zinc-900 border ${justProcessed ? 'border-red-500/50 shadow-lg shadow-red-905/10 animate-pulse' : 'border-zinc-800'} rounded-xl p-6 space-y-4 transition-all duration-300`}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-5 bg-red-600 rounded-sm inline-block"></span>
          <h3 className="text-sm font-black text-white uppercase tracking-widest">
            Post-Exam Success Protocol
          </h3>
          {justProcessed && (
            <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-505/20 px-2 py-0.5 rounded font-black uppercase">
              Action Required
            </span>
          )}
        </div>
        
        <p className="text-zinc-400 text-xs leading-relaxed">
          Testing results are processed! Now that student rankings and attendance logs are updated, you must print the updated materials for the new scheduling period.
        </p>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              if (onReprintRosters) {
                onReprintRosters();
              } else {
                onTabChange?.('roster');
              }
            }}
            className="flex flex-col items-start p-4 bg-zinc-950 border border-zinc-800 hover:border-red-600/50 hover:bg-zinc-900/40 rounded-lg group text-left transition cursor-pointer w-full text-zinc-100"
          >
            <span className="text-white text-xs font-black uppercase tracking-wider group-hover:text-red-500 transition-colors">
              Print New Class Rosters &rarr;
            </span>
            <span className="text-zinc-400 text-[11px] mt-1.5 leading-relaxed font-medium">
              Open the print preview with all class rosters across all dojo locations pre-loaded.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
