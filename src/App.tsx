import React, { useState, useEffect, useMemo, useRef } from "react";
import { Student, UserRole, Dojo, ApprovalStatus } from "./types";
import {
  KARATE_RANKS,
  TOTS_RANKS,
  checkEligibility,
  getNextRank,
  getStudentRankId,
  getProgramOverride,
} from "./constants";
import { isAfterExamTime, getLastDayOfMonthDate, calculateDefaultExpiryDate, getStudentProgramExpiryState } from "./dateHelpers";
import {
  collection,
  onSnapshot,
  setDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import {
  db,
  isFirebaseConfigured,
  handleFirestoreError,
  OperationType,
  auth,
} from "./firebase";
import { BeltPreview } from "./components/BeltPreview";
import { StudentForm } from "./components/StudentForm";
import { StickerSheet } from "./components/StickerSheet";
import { TestSetupForm } from "./components/TestSetupForm";
import { Invitations } from "./components/Invitations";
import { BeltPullList } from "./components/BeltInventory";
import { ExamCompletion } from "./components/ExamCompletion";
import { Information } from "./components/Information";
import { DojoLogo } from "./components/DojoLogo";
import { LoginScreen } from "./components/LoginScreen";
import { StudentRoster } from "./components/StudentRoster";
import { SuggestionModal } from "./components/SuggestionModal";
import { EnrollmentManager } from "./components/EnrollmentManager";
import { TestingTab } from "./components/TestingTab";
import { AdminPanel } from "./components/AdminPanel";
import { MessageSquarePlus, Sun, Moon } from "lucide-react";
import {
  Users,
  UserPlus,
  Filter,
  Search,
  Plus,
  Calendar,
  Award,
  CheckCircle2,
  Clock,
  BookOpen,
  Undo2,
  Edit3,
  Trash2,
  Printer,
  Sparkles,
  Info,
  Check,
  XCircle,
  Hash,
  AlertCircle,
  AlertTriangle,
  MapPin,
  FileText,
  Shield,
  Lock,
  Menu,
  X,
  LogOut,
  User,
  Scan,
  ClipboardCheck,
  Crown,
} from "lucide-react";

const cleanStudentFields = (student: any): any => {
  if (!student || typeof student !== "object") return student;
  const clean = { ...student };
  delete clean.program;
  delete clean.currentRankId;
  delete clean.classesAttended;
  delete clean.manualOverride;
  delete clean.monthsAtRank;

  Object.keys(clean).forEach((key) => {
    if (clean[key] === undefined) {
      delete clean[key];
    } else if (clean[key] !== null && typeof clean[key] === "object" && !Array.isArray(clean[key])) {
      const nested = { ...clean[key] };
      Object.keys(nested).forEach((nestedKey) => {
        if (nested[nestedKey] === undefined) {
          delete nested[nestedKey];
        }
      });
      clean[key] = nested;
    }
  });
  return clean;
};

export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [undoStack, setUndoStack] = useState<Student[][]>([]);
  const [redoStack, setRedoStack] = useState<Student[][]>([]);
  const [classesBuffer, setClassesBuffer] = useState<number>(() => {
    return Number(localStorage.getItem("bma_classes_buffer")) || 2;
  });

  const pushToUndo = (previousState: Student[]) => {
    setUndoStack((prev) => [...prev.slice(-19), previousState]); // Keep last 20
    setRedoStack([]); // Clear redo on new action
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const current = [...students];

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, current]);

    // Apply previous state to Firestore (batch-ish)
    if (isFirebaseConfigured && db && isDatabaseActive) {
      const { writeBatch, doc } = await import("firebase/firestore");
      const batch = writeBatch(db);

      // This is a naive revert: find differences and apply
      // For simplicity in this Dojo app, we'll restore the whole snapshot if possible
      // But batch is better. Let's just update all students from the snapshot.
      // Note: This might be heavy if roster is huge.
      previous.forEach((s) => {
        batch.set(doc(db, "students", s.id), cleanStudentFields(s));
      });

      // Also delete students that were added in the current state but not in previous
      const currentIds = new Set(current.map((s) => s.id));
      const prevIds = new Set(previous.map((s) => s.id));
      current.forEach((s) => {
        if (!prevIds.has(s.id)) {
          batch.delete(doc(db, "students", s.id));
        }
      });

      await batch.commit();
    } else {
      setStudents(previous);
      localStorage.setItem("bma_student_roster", JSON.stringify(previous));
    }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const current = [...students];

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, current]);

    if (isFirebaseConfigured && db && isDatabaseActive) {
      const { writeBatch, doc } = await import("firebase/firestore");
      const batch = writeBatch(db);
      next.forEach((s) => batch.set(doc(db, "students", s.id), cleanStudentFields(s)));

      const currentIds = new Set(current.map((s) => s.id));
      const nextIds = new Set(next.map((s) => s.id));
      current.forEach((s) => {
        if (!nextIds.has(s.id)) batch.delete(doc(db, "students", s.id));
      });
      await batch.commit();
    } else {
      setStudents(next);
      localStorage.setItem("bma_student_roster", JSON.stringify(next));
    }
  };
  const [currentTab, setCurrentTab] = useState<
    | "roster"
    | "stickers"
    | "testForm"
    | "invitations"
    | "information"
    | "beltPull"
    | "enrollment"
    | "testing"
    | "admin"
  >("roster");
  const [autoPrintAllRosters, setAutoPrintAllRosters] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formInitialLocation, setFormInitialLocation] = useState<string | undefined>();
  const [formInitialProgram, setFormInitialProgram] = useState<string | undefined>();
  const [isInIframe, setIsInIframe] = useState(false);
  const [appUrl, setAppUrl] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
      let url = window.location.href;
      if (url.includes("-dev-")) {
        url = url.replace("-dev-", "-pre-");
      }
      setAppUrl(url);
    } catch (e) {
      setIsInIframe(true);
      setAppUrl(
        "https://ais-pre-oakrrxdpw5krss2zwonotc-641880171081.us-east1.run.app",
      );
    }
  }, []);

  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userSession, setUserSession] = useState<{
    role: UserRole;
    name: string;
  } | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);

  const [testDate, setTestDate] = useState(() => {
    return localStorage.getItem("bma_test_date") || "2026-06-20";
  });
  const [testingLock, setTestingLock] = useState<{
    date: string;
    month: string;
    studentIds: string[];
  } | null>(null);
  const [invitationsLock, setInvitationsLock] = useState<{
    date: string;
    month: string;
    studentIds: string[];
  } | null>(null);
  const [labelsLock, setLabelsLock] = useState<{
    date: string;
    month: string;
    studentIds: string[];
  } | null>(null);
  const [beltListLock, setBeltListLock] = useState<{
    date: string;
    month: string;
    studentIds: string[];
  } | null>(null);

  const [isDatabaseActive, setIsDatabaseActive] = useState(() => {
    return localStorage.getItem("bma_db_active") !== "false";
  });

  const [customDojos, setCustomDojos] = useState<Dojo[]>(() => {
    try {
      const saved = localStorage.getItem("bma_custom_dojos");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const lastHandledLockAtRef = useRef<string | null>(
    localStorage.getItem("bma_last_handled_lock")
  );

  // Load test date, buffer and active status from Firestore
  useEffect(() => {
    if (isFirebaseConfigured && db) {
      import("firebase/firestore").then(({ onSnapshot, doc }) => {
        const unsubscribe = onSnapshot(
          doc(db, "settings", "general"),
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              if (data.testDate) {
                setTestDate(data.testDate);
                localStorage.setItem("bma_test_date", data.testDate);
              }
              if (data.testingLock !== undefined) {
                setTestingLock(data.testingLock);
              }
              if (data.invitationsLock !== undefined) {
                setInvitationsLock(data.invitationsLock);
              }
              if (data.labelsLock !== undefined) {
                setLabelsLock(data.labelsLock);
              }
              if (data.beltListLock !== undefined) {
                setBeltListLock(data.beltListLock);
              }
              if (data.classesBuffer !== undefined) {
                setClassesBuffer(data.classesBuffer);
                localStorage.setItem(
                  "bma_classes_buffer",
                  data.classesBuffer.toString(),
                );
              }
              if (data.active !== undefined) {
                const newActiveStr = data.active ? "true" : "false";
                setIsDatabaseActive(data.active);
                localStorage.setItem("bma_db_active", newActiveStr);

                if (data.active === false) {
                  const currentLockAt = data.lockedAt
                    ? String(data.lockedAt)
                    : "locked_active_false";
                  if (currentLockAt !== lastHandledLockAtRef.current) {
                    lastHandledLockAtRef.current = currentLockAt;
                    localStorage.setItem("bma_last_handled_lock", currentLockAt);
                    // Instantly log out all active users when app gets locked
                    localStorage.removeItem("bma_user_session");
                    setUserSession(null);
                    setIsLoggedIn(false);
                    setCurrentTab("roster");
                    if (auth) {
                      import("firebase/auth").then(({ signOut }) => signOut(auth));
                    }
                  }
                } else {
                  // Re-enabled in Firebase console
                  lastHandledLockAtRef.current = null;
                  localStorage.removeItem("bma_last_handled_lock");
                }
              } else {
                setIsDatabaseActive(true);
                localStorage.setItem("bma_db_active", "true");
                lastHandledLockAtRef.current = null;
                localStorage.removeItem("bma_last_handled_lock");
              }
            }
          },
          (err) => {
            console.error(
              "Failed to load settings from Firestore general document:",
              err,
            );
          },
        );
        return () => unsubscribe();
      });
    }
  }, []);

  const handleUpdateTestDate = async (newDate: string) => {
    setTestDate(newDate);
    localStorage.setItem("bma_test_date", newDate);
    if (isFirebaseConfigured && db && isDatabaseActive) {
      import("firebase/firestore").then(({ setDoc, doc }) => {
        setDoc(
          doc(db, "settings", "general"),
          { testDate: newDate },
          { merge: true },
        );
      });
    }
  };

  const handleUpdateTestingLock = async (
    newLock: { date: string; month: string; studentIds: string[] } | null,
  ) => {
    setTestingLock(newLock);
    if (isFirebaseConfigured && db && isDatabaseActive) {
      import("firebase/firestore").then(({ setDoc, doc }) => {
        setDoc(
          doc(db, "settings", "general"),
          { testingLock: newLock },
          { merge: true },
        );
      });
    }
  };

  const handleUpdateInvitationsLock = async (
    newLock: { date: string; month: string; studentIds: string[] } | null,
  ) => {
    setInvitationsLock(newLock);
    if (isFirebaseConfigured && db && isDatabaseActive) {
      import("firebase/firestore").then(({ setDoc, doc }) => {
        setDoc(
          doc(db, "settings", "general"),
          { invitationsLock: newLock },
          { merge: true },
        );
      });
    }
  };

  const handleUpdateLabelsLock = async (
    newLock: { date: string; month: string; studentIds: string[] } | null,
  ) => {
    setLabelsLock(newLock);
    if (isFirebaseConfigured && db && isDatabaseActive) {
      import("firebase/firestore").then(({ setDoc, doc }) => {
        setDoc(
          doc(db, "settings", "general"),
          { labelsLock: newLock },
          { merge: true },
        );
      });
    }
  };

  const handleUpdateBeltListLock = async (
    newLock: { date: string; month: string; studentIds: string[] } | null,
  ) => {
    setBeltListLock(newLock);
    if (isFirebaseConfigured && db && isDatabaseActive) {
      import("firebase/firestore").then(({ setDoc, doc }) => {
        setDoc(
          doc(db, "settings", "general"),
          { beltListLock: newLock },
          { merge: true },
        );
      });
    }
  };

  const handleUpdateClassesBuffer = async (newBuffer: number) => {
    setClassesBuffer(newBuffer);
    localStorage.setItem("bma_classes_buffer", newBuffer.toString());
    if (isFirebaseConfigured && db && isDatabaseActive) {
      import("firebase/firestore").then(({ setDoc, doc }) => {
        setDoc(
          doc(db, "settings", "general"),
          { classesBuffer: newBuffer },
          { merge: true },
        );
      });
    }
  };

  // Sync user session with Firebase Auth and Firestore user roles on mount
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const savedSession = localStorage.getItem("bma_user_session");
    if (savedSession) {
      try {
        setUserSession(JSON.parse(savedSession));
        setIsLoggedIn(true);
      } catch (err) {
        console.error("Stale session could not be resumed", err);
      }
    }

    if (isFirebaseConfigured && auth) {
      import("firebase/auth").then(({ onAuthStateChanged }) => {
        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser && !firebaseUser.isAnonymous) {
            let isVerified = firebaseUser.emailVerified;
            if (db) {
              try {
                const { doc, getDoc, collection, query, where, getDocs } = await import("firebase/firestore");
                let userDocSnap = null;
                if (firebaseUser.displayName) {
                  const nameDocRef = doc(db, "users", firebaseUser.displayName.trim().replace(/\//g, "-"));
                  userDocSnap = await getDoc(nameDocRef);
                }
                if (!userDocSnap || !userDocSnap.exists()) {
                  const uidDocRef = doc(db, "users", firebaseUser.uid);
                  userDocSnap = await getDoc(uidDocRef);
                }
                if ((!userDocSnap || !userDocSnap.exists()) && firebaseUser.email) {
                  const q = query(collection(db, "users"), where("email", "==", firebaseUser.email));
                  const querySnap = await getDocs(q);
                  if (!querySnap.empty) {
                    userDocSnap = querySnap.docs[0];
                  }
                }

                if (userDocSnap && userDocSnap.exists()) {
                  const uData = userDocSnap.data();
                  const role: UserRole = (uData.role as UserRole) || (firebaseUser.email?.toLowerCase().includes("owner") ? "Owner" : "Instructor");
                  const isAccepted =
                    role === "Owner" ||
                    uData.approvalStatus === "approved" ||
                    uData.approvalStatus === ("accepted" as any) ||
                    uData.isActive === true ||
                    Boolean(uData.approvedAt);
                  const approvalStatus: ApprovalStatus = isAccepted ? "approved" : (uData.approvalStatus === "denied" ? "denied" : "pending");
                  const name = uData.name || firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User";

                  if (uData.emailVerified || uData.skipEmailVerification || approvalStatus === "approved" || role === "Owner") {
                    isVerified = true;
                  }

                  if (isVerified && (role === "Owner" || approvalStatus === "approved")) {
                    const session = { role, name };
                    localStorage.setItem("bma_user_session", JSON.stringify(session));
                    setUserSession(session);
                    setIsLoggedIn(true);

                    // Ensure Firestore user document has approvalStatus: 'approved' and isActive: true so no lingering 'pending' tag
                    if (uData.approvalStatus !== "approved" || !uData.isActive) {
                      import("firebase/firestore").then(({ doc, setDoc }) => {
                        setDoc(
                          doc(db, "users", firebaseUser.uid),
                          {
                            id: firebaseUser.uid,
                            name,
                            email: firebaseUser.email || uData.email || "",
                            role,
                            approvalStatus: "approved",
                            isActive: true,
                            emailVerified: true,
                            skipEmailVerification: true,
                            lastLogin: new Date().toISOString()
                          },
                          { merge: true }
                        ).catch(console.warn);
                      });
                    }
                  } else {
                    localStorage.removeItem("bma_user_session");
                    setUserSession(null);
                    setIsLoggedIn(false);
                  }
                }
              } catch (e) {
                console.warn("Could not sync Firestore user document on auth change:", e);
              }
            } else if (isVerified) {
              const session = { role: "Front Desk" as UserRole, name: firebaseUser.displayName || "User" };
              localStorage.setItem("bma_user_session", JSON.stringify(session));
              setUserSession(session);
              setIsLoggedIn(true);
            }
          }
          setIsLoadingAuth(false);
        });
      });
    } else {
      setIsLoadingAuth(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleLoginSuccess = (
    role: UserRole,
    operatorName: string,
  ) => {
    const session = { role, name: operatorName };
    localStorage.setItem("bma_user_session", JSON.stringify(session));
    setUserSession(session);
    setIsLoggedIn(true);
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("bma_user_session");
    setUserSession(null);
    setIsLoggedIn(false);
    setCurrentTab("roster");
    if (auth) {
      import("firebase/auth").then(({ signOut }) => signOut(auth));
    }
  };

  // Load / Sync Roster with Firestore or local storage fallback
  useEffect(() => {
    if (!isLoggedIn) {
      setStudents([]);
      setIsLoadingData(true);
      return;
    }

    setIsLoadingData(true);

    if (isFirebaseConfigured && db) {
      const q = collection(db, "students");
      const unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          const list: Student[] = [];
          const dirtyStudentDocRefsToClean: { ref: any, cleanData: any }[] = [];
          if (!snapshot.empty) {
            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as any;
              let isDirty = false;
              const programs =
                data.programs && data.programs.length > 0
                  ? data.programs
                  : [data.program || "karate"];
              const rankings = data.rankings || {
                [data.program || "karate"]: data.currentRankId || "white",
              };
              const attendance = data.attendance || {
                [programs[0]]: data.classesAttended || 0,
              };
              const manualOverrides = data.manualOverrides || {};
              if (data.manualOverride && !manualOverrides[programs[0]]) {
                manualOverrides[programs[0]] = data.manualOverride;
              }

              if (
                data.program !== undefined ||
                data.currentRankId !== undefined ||
                data.classesAttended !== undefined ||
                data.manualOverride !== undefined ||
                data.monthsAtRank !== undefined ||
                !data.barcode
              ) {
                isDirty = true;
              }

              const cleanObj = {
                ...data,
                programs,
                rankings,
                attendance,
                manualOverrides,
                barcode: data.barcode || `BMA-${Math.floor(100000 + Math.random() * 900000)}`,
              };

              delete cleanObj.program;
              delete cleanObj.currentRankId;
              delete cleanObj.classesAttended;
              delete cleanObj.manualOverride;
              delete cleanObj.monthsAtRank;

              const agreements = { ...(data.enrollmentAgreements || {}) };
              const expiries = { ...(data.enrollmentExpiries || {}) };
              const discontinueFlags = { ...(data.discontinueAfterExpiry || {}) };

              Object.keys(expiries).forEach((prog) => {
                const val = expiries[prog];
                if (val && val.split("-").length === 2) {
                  expiries[prog] = getLastDayOfMonthDate(val);
                }
              });

              const isKobudo = (data.programs || []).includes('kobudo') || !!agreements['kobudo'];
              if (isKobudo) {
                if (!agreements['kobudo']) {
                  agreements['kobudo'] = '6 months';
                }
                if (!expiries['kobudo'] && agreements['kobudo'] !== 'Monthly' && agreements['kobudo'] !== 'None') {
                  expiries['kobudo'] = calculateDefaultExpiryDate(agreements['kobudo']);
                }
              }

              // Automatically clean up programs marked for discontinuation AFTER their agreement expiry date
              if (!data.inactive) {
                let activeProgs = [...programs];
                let hasDiscontinuedExpired = false;

                activeProgs.forEach((prog) => {
                  if (discontinueFlags[prog]) {
                    const dummyStudent = {
                      enrollmentAgreements: agreements,
                      enrollmentExpiries: expiries,
                    };
                    const state = getStudentProgramExpiryState(dummyStudent, prog);
                    if (state === 'expired') {
                      hasDiscontinuedExpired = true;
                      delete agreements[prog];
                      delete expiries[prog];
                      delete discontinueFlags[prog];
                    }
                  }
                });

                if (hasDiscontinuedExpired) {
                  isDirty = true;
                  const remaining = activeProgs.filter((p) => agreements[p] !== undefined || p in discontinueFlags);
                  cleanObj.programs = remaining;
                  if (remaining.length === 0) {
                    cleanObj.inactive = true;
                  }
                }
              }

              cleanObj.enrollmentAgreements = agreements;
              cleanObj.enrollmentExpiries = expiries;
              cleanObj.discontinueAfterExpiry = discontinueFlags;

              // Normalize and clean up attendance timestamps
              let lastAttUpdate = data.lastAttendanceUpdate;
              if (lastAttUpdate === "2000-01-01") {
                lastAttUpdate = undefined;
                cleanObj.inactive = true;
                isDirty = true;
              }

              const incMap = { ...(data.lastIncrementDateByProgram || {}) };
              Object.keys(incMap).forEach((k) => {
                if (incMap[k] === "2000-01-01") {
                  delete incMap[k];
                  isDirty = true;
                }
              });

              if (lastAttUpdate) {
                programs.forEach((prog: string) => {
                  if (!incMap[prog] && (attendance[prog] ?? 0) > 0) {
                    incMap[prog] = lastAttUpdate;
                  }
                });
              } else {
                const dates = Object.values(incMap).filter(Boolean) as string[];
                if (dates.length > 0) {
                  dates.sort();
                  lastAttUpdate = dates[dates.length - 1];
                }
              }

              if (lastAttUpdate) {
                cleanObj.lastAttendanceUpdate = lastAttUpdate;
              } else {
                delete cleanObj.lastAttendanceUpdate;
              }
              cleanObj.lastIncrementDateByProgram = incMap;

              const cleanDataForFirestore = cleanStudentFields(cleanObj);

              if (isDirty) {
                dirtyStudentDocRefsToClean.push({
                  ref: docSnap.ref,
                  cleanData: cleanDataForFirestore
                });
              }

              list.push(cleanObj as Student);
            });

            if (dirtyStudentDocRefsToClean.length > 0 && isDatabaseActive) {
              import("firebase/firestore").then(async ({ writeBatch }) => {
                try {
                  const batch = writeBatch(db);
                  dirtyStudentDocRefsToClean.forEach(({ ref, cleanData }) => {
                    batch.set(ref, cleanStudentFields(cleanData));
                  });
                  await batch.commit();
                  console.log(`Cleaned up duplicate fields in Firestore for ${dirtyStudentDocRefsToClean.length} student documents.`);
                } catch (e) {
                  console.error("Failed to batch save database cleanup:", e);
                }
              });
            }

            localStorage.setItem("bma_student_roster", JSON.stringify(list));
          }
          setStudents(list);
          setIsLoadingData(false);
        },
        (error) => {
          setIsLoadingData(false);
          handleFirestoreError(error, OperationType.GET, "students");
        },
      );
      return () => unsubscribe();
    } else {
      const saved = localStorage.getItem("bma_student_roster");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          let isLocalStorageDirty = false;
          const sanitized = parsed.map((s: any) => {
            const programs =
              s.programs && s.programs.length > 0
                ? s.programs
                : [s.program || "karate"];
            const rankings = s.rankings || {
              [s.program || "karate"]: s.currentRankId || "white",
            };
            const attendance = s.attendance || {
              [programs[0]]: s.classesAttended || 0,
            };
            const manualOverrides = s.manualOverrides || {};
            if (s.manualOverride && !manualOverrides[programs[0]]) {
              manualOverrides[programs[0]] = s.manualOverride;
            }

            const cleanObj = {
              ...s,
              programs,
              rankings,
              attendance,
              manualOverrides,
              barcode: s.barcode || `BMA-${Math.floor(100000 + Math.random() * 900000)}`,
            };

            if (
              s.program !== undefined ||
              s.currentRankId !== undefined ||
              s.classesAttended !== undefined ||
              s.manualOverride !== undefined ||
              s.monthsAtRank !== undefined ||
              !s.barcode
            ) {
              isLocalStorageDirty = true;
            }

            delete cleanObj.program;
            delete cleanObj.currentRankId;
            delete cleanObj.classesAttended;
            delete cleanObj.manualOverride;
            delete cleanObj.monthsAtRank;

            const expiries = { ...(s.enrollmentExpiries || {}) };
            Object.keys(expiries).forEach((prog) => {
              const val = expiries[prog];
              if (val && val.split("-").length === 2) {
                expiries[prog] = getLastDayOfMonthDate(val);
              }
            });
            cleanObj.enrollmentExpiries = expiries;

            // Normalize and clean up attendance timestamps
            let lastAttUpdate = s.lastAttendanceUpdate;
            if (lastAttUpdate === "2000-01-01") {
              lastAttUpdate = undefined;
              cleanObj.inactive = true;
              isLocalStorageDirty = true;
            }

            const incMap = { ...(s.lastIncrementDateByProgram || {}) };
            Object.keys(incMap).forEach((k) => {
              if (incMap[k] === "2000-01-01") {
                delete incMap[k];
                isLocalStorageDirty = true;
              }
            });

            if (lastAttUpdate) {
              programs.forEach((prog: string) => {
                if (!incMap[prog] && (attendance[prog] ?? 0) > 0) {
                  incMap[prog] = lastAttUpdate;
                }
              });
            } else {
              const dates = Object.values(incMap).filter(Boolean) as string[];
              if (dates.length > 0) {
                dates.sort();
                lastAttUpdate = dates[dates.length - 1];
              }
            }

            cleanObj.lastAttendanceUpdate = lastAttUpdate;
            cleanObj.lastIncrementDateByProgram = incMap;

            return cleanObj;
          });

          if (isLocalStorageDirty) {
            localStorage.setItem("bma_student_roster", JSON.stringify(sanitized));
          }
          setStudents(sanitized);
        } catch (e) {
          setStudents([]);
        }
      } else {
        setStudents([]);
        localStorage.setItem("bma_student_roster", JSON.stringify([]));
      }
      setIsLoadingData(false);
    }
  }, [isLoggedIn]);

  // Load / Sync Custom Dojos with Firestore or local storage fallback
  useEffect(() => {
    if (!isLoggedIn) {
      setCustomDojos([]);
      return;
    }

    if (isFirebaseConfigured && db) {
      const q = collection(db, "dojos");
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: Dojo[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            list.push({
              id: docSnap.id,
              ...data,
            });
          });
          setCustomDojos(list);
          localStorage.setItem("bma_custom_dojos", JSON.stringify(list));
        },
        (error) => {
          console.error("Failed to load dojos from Firestore:", error);
        }
      );
      return () => unsubscribe();
    } else {
      try {
        const saved = localStorage.getItem("bma_custom_dojos");
        if (saved) {
          setCustomDojos(JSON.parse(saved));
        }
      } catch (err) {
        console.error("Failed to parse custom dojos from local storage:", err);
      }
    }
  }, [isLoggedIn]);

  // Save / Delete custom dojos
  const handleSaveDojo = async (dojo: Dojo) => {
    const dojoId =
      dojo.id ||
      dojo.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
    const dojoToSave: Dojo = {
      ...dojo,
      id: dojoId,
      updatedAt: new Date().toISOString(),
      createdAt: dojo.createdAt || new Date().toISOString(),
    };

    const clean = { ...dojoToSave };
    Object.keys(clean).forEach((k) => {
      if ((clean as any)[k] === undefined) delete (clean as any)[k];
    });

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        await setDoc(doc(db, "dojos", dojoId), clean, { merge: true });
      } catch (err) {
        console.error("Failed to save dojo to Firestore:", err);
      }
    } else {
      setCustomDojos((prev) => {
        const idx = prev.findIndex((d) => d.id === dojoId);
        const next = idx >= 0 ? [...prev] : [...prev, clean as Dojo];
        if (idx >= 0) next[idx] = clean as Dojo;
        localStorage.setItem("bma_custom_dojos", JSON.stringify(next));
        return next;
      });
    }
  };

  const handleDeleteDojo = async (dojoId: string) => {
    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        await deleteDoc(doc(db, "dojos", dojoId));
      } catch (err) {
        console.error("Failed to delete dojo from Firestore:", err);
      }
    } else {
      setCustomDojos((prev) => {
        const next = prev.filter((d) => d.id !== dojoId);
        localStorage.setItem("bma_custom_dojos", JSON.stringify(next));
        return next;
      });
    }
  };

  // Track daily logon date
  useEffect(() => {
    if (!isLoggedIn) return;
    const todayString = new Date().toLocaleDateString("en-CA");
    localStorage.setItem("bma_last_logon_date", todayString);
  }, [isLoggedIn]);

  // Save changes offline helper
  const saveToLocalStorage = (newList: Student[]) => {
    setStudents(newList);
    localStorage.setItem("bma_student_roster", JSON.stringify(newList));
  };

  // Add / Edit student save handler
  const handleSaveStudent = async (student: Student) => {
    const finalStudent = { ...student } as any;
    if (!finalStudent.barcode) {
      finalStudent.barcode = `BMA-${Math.floor(100000 + Math.random() * 900000)}`;
    }
    if (finalStudent.barcodePrinted === undefined) {
      finalStudent.barcodePrinted = false;
    }
    if (finalStudent.barcodePrintedCount === undefined) {
      finalStudent.barcodePrintedCount = 0;
    }

    const originalStudent = students.find((s) => s.id === finalStudent.id);
    const oldFamilyIds = originalStudent?.familyIds || [];
    const newFamilyIds = finalStudent.familyIds || [];
    const addedIds = newFamilyIds.filter(id => !oldFamilyIds.includes(id));
    const removedIds = oldFamilyIds.filter(id => !newFamilyIds.includes(id));

    const finalStudentDoc = cleanStudentFields(finalStudent);

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        pushToUndo(students);
        await setDoc(doc(db, "students", finalStudent.id), finalStudentDoc);

        // Update added family members in Firestore
        for (const otherId of addedIds) {
          const otherStudent = students.find(s => s.id === otherId);
          if (otherStudent) {
            const updatedOther = {
              ...otherStudent,
              familyIds: Array.from(new Set([...(otherStudent.familyIds || []), finalStudent.id]))
            };
            await setDoc(doc(db, "students", otherId), cleanStudentFields(updatedOther));
          }
        }

        // Update removed family members in Firestore
        for (const otherId of removedIds) {
          const otherStudent = students.find(s => s.id === otherId);
          if (otherStudent) {
            const updatedOther = {
              ...otherStudent,
              familyIds: (otherStudent.familyIds || []).filter(id => id !== finalStudent.id)
            };
            await setDoc(doc(db, "students", otherId), cleanStudentFields(updatedOther));
          }
        }
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `students/${finalStudent.id}`,
        );
      }
    } else {
      const existsIndex = students.findIndex((s) => s.id === finalStudent.id);
      let updated: Student[];
      if (existsIndex > -1) {
        updated = [...students];
        updated[existsIndex] = finalStudent;
      } else {
        updated = [finalStudent, ...students];
      }

      // Update added family members locally
      addedIds.forEach(otherId => {
        const idx = updated.findIndex(s => s.id === otherId);
        if (idx > -1) {
          updated[idx] = {
            ...updated[idx],
            familyIds: Array.from(new Set([...(updated[idx].familyIds || []), finalStudent.id]))
          };
        }
      });

      // Update removed family members locally
      removedIds.forEach(otherId => {
        const idx = updated.findIndex(s => s.id === otherId);
        if (idx > -1) {
          updated[idx] = {
            ...updated[idx],
            familyIds: (updated[idx].familyIds || []).filter(id => id !== finalStudent.id)
          };
        }
      });

      saveToLocalStorage(updated);
    }
    setIsFormOpen(false);
    setEditingStudent(null);
  };

  const handleAddStudentsBatch = async (newStudents: Student[]) => {
    if (newStudents.length === 0) return;
    pushToUndo(students);

    const prepared = newStudents.map((s) => {
      const finalStudent = { ...s } as any;
      if (!finalStudent.barcode) {
        finalStudent.barcode = `BMA-${Math.floor(100000 + Math.random() * 900000)}`;
      }
      if (finalStudent.barcodePrinted === undefined) {
        finalStudent.barcodePrinted = false;
      }
      if (finalStudent.barcodePrintedCount === undefined) {
        finalStudent.barcodePrintedCount = 0;
      }
      return finalStudent;
    });

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        const { writeBatch, doc } = await import("firebase/firestore");
        for (let i = 0; i < prepared.length; i += 400) {
          const chunk = prepared.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach((st) => {
            batch.set(doc(db, "students", st.id), cleanStudentFields(st));
          });
          await batch.commit();
        }
      } catch (err) {
        console.error("Batch write failed, falling back to individual save:", err);
        for (const st of prepared) {
          await handleSaveStudent(st);
        }
      }
    } else {
      setStudents((prev) => [...prev, ...prepared]);
      try {
        localStorage.setItem("bma_student_roster", JSON.stringify([...students, ...prepared]));
      } catch (err) {
        console.warn("Local storage write failed:", err);
      }
    }
  };

  const handleUpdateStudent = async (updatedStudent: Student) => {
    const finalStudent = { ...updatedStudent };
    if (!finalStudent.barcode) {
      finalStudent.barcode = `BMA-${Math.floor(100000 + Math.random() * 900000)}`;
    }
    if (finalStudent.barcodePrinted === undefined) {
      finalStudent.barcodePrinted = false;
    }
    if (finalStudent.barcodePrintedCount === undefined) {
      finalStudent.barcodePrintedCount = 0;
    }

    // Capture changes to attendance and reactivate the student if they were modified
    const originalStudent = students.find((s) => s.id === finalStudent.id);
    if (originalStudent) {
      const changedProgs = (finalStudent.programs || []).filter(
        (p: string) =>
          (originalStudent.attendance?.[p] ?? 0) !==
          (finalStudent.attendance?.[p] ?? 0),
      );
      if (changedProgs.length > 0) {
        const todayStr = new Date().toLocaleDateString("en-CA");
        finalStudent.lastAttendanceUpdate = todayStr;
        finalStudent.inactive = false;
        const incMap = { ...(finalStudent.lastIncrementDateByProgram || originalStudent.lastIncrementDateByProgram || {}) };
        changedProgs.forEach((p: string) => {
          incMap[p] = todayStr;
        });
        finalStudent.lastIncrementDateByProgram = incMap;
      }
    } else {
      if (!finalStudent.lastAttendanceUpdate) {
        finalStudent.lastAttendanceUpdate = new Date().toLocaleDateString(
          "en-CA",
        );
      }
    }

    const originalStudentOfList = students.find((s) => s.id === finalStudent.id);
    const oldFamilyIds = originalStudentOfList?.familyIds || [];
    const newFamilyIds = finalStudent.familyIds || [];
    const addedIds = newFamilyIds.filter(id => !oldFamilyIds.includes(id));
    const removedIds = oldFamilyIds.filter(id => !newFamilyIds.includes(id));

    const finalStudentDoc = cleanStudentFields(finalStudent);

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        pushToUndo(students);
        await setDoc(doc(db, "students", finalStudent.id), finalStudentDoc);

        // Update added family members in Firestore
        for (const otherId of addedIds) {
          const otherStudent = students.find(s => s.id === otherId);
          if (otherStudent) {
            const updatedOther = {
              ...otherStudent,
              familyIds: Array.from(new Set([...(otherStudent.familyIds || []), finalStudent.id]))
            };
            await setDoc(doc(db, "students", otherId), cleanStudentFields(updatedOther));
          }
        }

        // Update removed family members in Firestore
        for (const otherId of removedIds) {
          const otherStudent = students.find(s => s.id === otherId);
          if (otherStudent) {
            const updatedOther = {
              ...otherStudent,
              familyIds: (otherStudent.familyIds || []).filter(id => id !== finalStudent.id)
            };
            await setDoc(doc(db, "students", otherId), cleanStudentFields(updatedOther));
          }
        }
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `students/${finalStudent.id}`,
        );
      }
    } else {
      const existsIndex = students.findIndex((s) => s.id === finalStudent.id);
      if (existsIndex > -1) {
        const updated = [...students];
        updated[existsIndex] = finalStudent;

        // Update added family members locally
        addedIds.forEach(otherId => {
          const idx = updated.findIndex(s => s.id === otherId);
          if (idx > -1) {
            updated[idx] = {
              ...updated[idx],
              familyIds: Array.from(new Set([...(updated[idx].familyIds || []), finalStudent.id]))
            };
          }
        });

        // Update removed family members locally
        removedIds.forEach(otherId => {
          const idx = updated.findIndex(s => s.id === otherId);
          if (idx > -1) {
            updated[idx] = {
              ...updated[idx],
              familyIds: (updated[idx].familyIds || []).filter(id => id !== finalStudent.id)
            };
          }
        });

        saveToLocalStorage(updated);
      }
    }
  };

  const handleBulkUpdate = async (updatedStudentsList: Student[]) => {
    const interceptedList = updatedStudentsList.map((updatedStudent) => {
      const finalStudent = { ...updatedStudent };
      const originalStudent = students.find((s) => s.id === updatedStudent.id);
      if (originalStudent) {
        const changedProgs = (finalStudent.programs || []).filter(
          (p: string) =>
            (originalStudent.attendance?.[p] ?? 0) !==
            (updatedStudent.attendance?.[p] ?? 0),
        );
        if (changedProgs.length > 0) {
          const todayStr = new Date().toLocaleDateString("en-CA");
          finalStudent.lastAttendanceUpdate = todayStr;
          finalStudent.inactive = false;
          const incMap = { ...(finalStudent.lastIncrementDateByProgram || originalStudent.lastIncrementDateByProgram || {}) };
          changedProgs.forEach((p: string) => {
            incMap[p] = todayStr;
          });
          finalStudent.lastIncrementDateByProgram = incMap;
        }
      } else {
        if (!finalStudent.lastAttendanceUpdate) {
          finalStudent.lastAttendanceUpdate = new Date().toLocaleDateString(
            "en-CA",
          );
        }
      }
      return finalStudent;
    });

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        const { writeBatch, doc } = await import("firebase/firestore");
        const batch = writeBatch(db);
        pushToUndo(students);
        interceptedList.forEach((s) => {
          const cleanS = cleanStudentFields(s);
          batch.set(doc(db, "students", cleanS.id), cleanS);
        });
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `students_bulk`);
      }
    } else {
      const map = new Map(interceptedList.map((s) => [s.id, s]));
      const next = students.map((s) => map.get(s.id) || s);
      pushToUndo(students);
      setStudents(next);
      saveToLocalStorage(next);
    }
  };

  // Delete student
  const handleDeleteStudent = (id: string) => {
    if (userSession?.role === "Instructor") return;
    setStudentToDelete(id);
  };

  const executeDeleteStudent = async () => {
    if (!studentToDelete || userSession?.role === "Instructor") return;
    const id = studentToDelete;

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        pushToUndo(students);
        await deleteDoc(doc(db, "students", id));

        // Clean up from other students in Firestore
        const relatedStudents = students.filter(s => s.familyIds?.includes(id));
        for (const sibling of relatedStudents) {
          const updatedSibling = {
            ...sibling,
            familyIds: (sibling.familyIds || []).filter(fid => fid !== id)
          };
          await setDoc(doc(db, "students", sibling.id), cleanStudentFields(updatedSibling));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `students/${id}`);
      }
    } else {
      let updated = students.filter((s) => s.id !== id);
      updated = updated.map(s => {
        if (s.familyIds?.includes(id)) {
          return {
            ...s,
            familyIds: s.familyIds.filter(fid => fid !== id)
          };
        }
        return s;
      });
      saveToLocalStorage(updated);
    }

    setStudentToDelete(null);
  };

  // Fast manual override toggler
  const handleCycleOverride = async (studentId: string, program?: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const targetProg = program || student.programs[0] || "karate";
    const currentOverrides = student.manualOverrides || {};
    const currentOverride = getProgramOverride(student, targetProg as any);

    let nextOverride: Student["manualOverride"] = null;
    if (currentOverride === null) nextOverride = "eligible";
    else if (currentOverride === "eligible") nextOverride = "ineligible";
    else nextOverride = null;

    const updatedStudent = {
      ...student,
      manualOverrides: {
        ...currentOverrides,
        [targetProg]: nextOverride,
      },
    };

    if (isFirebaseConfigured && db && isDatabaseActive) {
      try {
        pushToUndo(students);
        await setDoc(doc(db, "students", studentId), cleanStudentFields(updatedStudent));
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `students/${studentId}`,
        );
      }
    } else {
      const updated = students.map((s) =>
        s.id === studentId ? updatedStudent : s,
      );
      saveToLocalStorage(updated);
    }
  };

  // Full eligibility metadata calculations for each student
  const searchQuery = "";
  const filterProgram: any = "all";
  const filterEligible: any = "all";
  const filterLocation: any = "all";
  const filteredStudents: any[] = [];
  const setSearchQuery = (v: string) => {};
  const setFilterProgram = (v: any) => {};
  const setFilterEligible = (v: any) => {};
  const setFilterLocation = (v: any) => {};

  const studentsWithEligibility = useMemo(() => {
    return students.map((student) => {
      const eligibilityByProgram: { [key: string]: any } = {};
      const targetRankByProgram: { [key: string]: any } = {};

      student.programs.forEach((prog) => {
        eligibilityByProgram[prog] = checkEligibility(
          student,
          prog,
          classesBuffer,
        );
        targetRankByProgram[prog] = getNextRank(prog, getStudentRankId(student, prog));
      });

      // Default/Primary program metadata
      const primaryProgram = student.programs[0] || "karate";
      const eligibility = eligibilityByProgram[primaryProgram] || {
        eligible: false,
        isProvisional: false,
        reasons: ["No programs assigned"],
        classesActual: 0,
        classesRequired: 0,
      };
      const targetRank = targetRankByProgram[primaryProgram];

      // Calculate isInactive helper based on rules
      let isInactive = !!student.inactive;
      if (!isInactive) {
        const activeProgs = student.programs || [];
        if (activeProgs.length > 0) {
          const allDiscontinuedAndExpired = activeProgs.every((prog) => {
            return (
              !!student.discontinueAfterExpiry?.[prog] &&
              getStudentProgramExpiryState(student, prog) === "expired"
            );
          });
          if (allDiscontinuedAndExpired) {
            isInactive = true;
          }
        }
        if (!isInactive && student.lastAttendanceUpdate) {
          const lastUpdateDate = new Date(
            student.lastAttendanceUpdate + "T00:00:00",
          );
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          if (lastUpdateDate < oneMonthAgo) {
            isInactive = true;
          }
        }
      }

      return {
        ...student,
        eligibility,
        targetRank,
        eligibilityByProgram,
        targetRankByProgram,
        isInactive,
      };
    });
  }, [students, classesBuffer]);

  // Statistics Summary counts
  const stats = useMemo(() => {
    const activeStudents = studentsWithEligibility.filter(
      (s) => !(s as any).isInactive,
    );
    const total = activeStudents.length;
    const karateCount = activeStudents.filter((s) =>
      s.programs.includes("karate"),
    ).length;
    const totsCount = activeStudents.filter((s) =>
      s.programs.includes("tots"),
    ).length;
    const kobudoCount = activeStudents.filter((s) =>
      s.programs.includes("kobudo"),
    ).length;
    const isTestingLocked = !!testingLock;
    const eligibleCount = activeStudents.filter((s) => {
      // Eligible if eligible in at least one enrolled program
      return s.programs.some((prog) => {
        const progElig = (s as any).eligibilityByProgram[prog];
        if (!progElig) return false;
        const override = getProgramOverride(s, prog as any);
        const isStudentInThisTest =
          isTestingLocked && testingLock.studentIds.includes(s.id);

        if (override === "eligible") return true;
        if (override === "ineligible") return false;

        if (isTestingLocked) {
          return isStudentInThisTest && progElig.eligible;
        }
        return progElig.eligible;
      });
    }).length;

    return { total, karateCount, totsCount, kobudoCount, eligibleCount };
  }, [studentsWithEligibility, testingLock]);

  const statsWithProvisional = useMemo(() => {
    const provisionalCount = studentsWithEligibility.filter((s) => {
      // Not fully eligible, but provisional in at least one program
      const isEligible = Object.values(s.eligibilityByProgram).some(
        (e: any) => e.eligible,
      );
      const isProvisional = Object.values(s.eligibilityByProgram).some(
        (e: any) => e.isProvisional,
      );
      return !isEligible && isProvisional;
    }).length;

    return { ...stats, provisionalCount };
  }, [studentsWithEligibility, stats]);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + R: Preview Exam Completion
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        setCurrentTab("roster");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-500 select-none">
        <span className="font-extrabold text-xs uppercase tracking-widest animate-pulse">
          Synchronizing Dojo Credentials...
        </span>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center select-none p-4 text-center">
        <div className="relative mb-6">
          <DojoLogo size={64} />
        </div>
        <h2 className="text-zinc-100 font-black text-sm uppercase tracking-widest mb-1.5">
          Buckner Martial Arts
        </h2>
        <span className="font-extrabold text-[10px] text-zinc-500 uppercase tracking-widest animate-pulse">
          Communicating with Dojo Database...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-red-600 selection:text-white bg-zinc-950 text-zinc-100">
      {!isDatabaseActive && (
        <div className="bg-amber-950/80 border-b border-amber-900/40 text-amber-200 text-center py-1.5 px-4 text-[10.5px] font-black tracking-widest uppercase select-none print:hidden">
          READ ONLY
        </div>
      )}
      <header
        id="header-and-nav"
        className="print:hidden border-b border-zinc-800 bg-black/90 sticky top-0 z-40 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          {/* Logo & Mobile Menu Toggle */}
          <div className="flex items-center gap-4">
            {userSession && (
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="xl:hidden p-2 text-zinc-400 hover:text-white transition bg-zinc-900 border border-zinc-800 rounded-lg"
                aria-label="Toggle Menu"
              >
                {isMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="relative hover:scale-105 transition duration-200">
                <DojoLogo size={36} />
              </div>
              <span className="text-sm sm:text-base font-black uppercase tracking-widest text-zinc-100 block whitespace-nowrap">
                Buckner Martial Arts
              </span>
            </div>
          </div>

          {/* Nav Tabs - Tablet/Desktop Row */}
          <div className="flex items-center gap-4">
            {userSession && userSession.role !== "Instructor" && (
              <div className="hidden xl:flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl flex-nowrap gap-1 shadow-inner">
                <button
                  onClick={() => setCurrentTab("roster")}
                  className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                    currentTab === "roster"
                      ? "bg-red-600 text-white shadow shadow-red-905/40"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Roster</span>
                </button>
                {(userSession.role === "Front Desk" || userSession.role === "Owner") && (
                  <button
                    onClick={() => setCurrentTab("enrollment")}
                    className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                      currentTab === "enrollment"
                        ? "bg-red-600 text-white shadow shadow-red-905/40"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Enrollments</span>
                  </button>
                )}
                <button
                  onClick={() => setCurrentTab("testForm")}
                  className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                    currentTab === "testForm"
                      ? "bg-red-600 text-white shadow shadow-red-905/40"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Setup</span>
                </button>
                <button
                  onClick={() => setCurrentTab("invitations")}
                  className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                    currentTab === "invitations"
                      ? "bg-red-600 text-white shadow shadow-red-905/40"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Invites</span>
                </button>
                <button
                  onClick={() => setCurrentTab("stickers")}
                  className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                    currentTab === "stickers"
                      ? "bg-red-600 text-white shadow shadow-red-905/40"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Hash className="w-3.5 h-3.5" />
                  <span>Labels</span>
                </button>
                <button
                  onClick={() => setCurrentTab("beltPull")}
                  className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                    currentTab === "beltPull"
                      ? "bg-red-600 text-white shadow shadow-red-905/40"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Belts</span>
                </button>
                <button
                  onClick={() => setCurrentTab("testing")}
                  className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                    currentTab === "testing"
                      ? "bg-red-600 text-white shadow shadow-red-905/40"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>Testing</span>
                </button>
                {userSession.role === "Owner" && (
                  <button
                    onClick={() => setCurrentTab("admin")}
                    className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                      currentTab === "admin"
                        ? "bg-red-600 text-white shadow shadow-red-905/40"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </button>
                )}
              </div>
            )}

            {userSession && (userSession.role === "Front Desk" || userSession.role === "Owner") && (
              <div className="hidden xl:flex items-center gap-4 border-l border-zinc-800 pl-6 select-none group">
                <div className="hidden sm:flex flex-col items-end">
                  <span className={`font-black text-xs uppercase tracking-widest leading-none ${userSession.role === "Owner" ? "text-amber-400 flex items-center gap-1" : "text-red-500"}`}>
                    {userSession.role === "Owner" && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                    {userSession.role}
                  </span>
                </div>
                {userSession.role === "Owner" && (
                  <button
                    onClick={() => setCurrentTab("admin")}
                    className={`p-2 transition-colors rounded-lg cursor-pointer border ${currentTab === "admin" ? "bg-red-600 text-white border-red-500 shadow-md shadow-red-900/20" : "text-zinc-400 hover:text-red-500 hover:border-red-900/40 bg-zinc-900 border-zinc-800"}`}
                    title="Owner Admin Panel"
                  >
                    <Crown className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setCurrentTab("information")}
                  className={`p-2 transition-colors rounded-lg cursor-pointer border ${currentTab === "information" ? "bg-red-600 text-white border-red-500 shadow-md shadow-red-900/20" : "text-zinc-400 hover:text-red-500 hover:border-red-900/40 bg-zinc-900 border-zinc-800"}`}
                  title="App Information & Guide"
                >
                  <Info className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsFeedbackOpen(true)}
                  className="p-2 text-zinc-400 hover:text-red-500 hover:border-red-900/40 transition-colors bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer"
                  title="Report Suggestions & Feedback"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 text-zinc-500 hover:text-red-500 transition-colors bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {userSession && userSession.role === "Instructor" && (
              <div className="hidden xl:flex items-center gap-4 border-l border-zinc-800 pl-6 select-none animate-in fade-in">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-red-500 font-black text-xs uppercase tracking-widest leading-none">
                    Instructor
                  </span>
                </div>
                {/* Temporary button to return to roster if currentTab is information */}
                {currentTab === "information" && (
                  <button
                    onClick={() => setCurrentTab("roster")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-wider transition rounded-lg text-[10px] cursor-pointer shadow-md shadow-red-900/20 active:scale-95 animate-in fade-in slide-in-from-right-3 duration-200"
                    title="Return to Roster"
                  >
                    <Users className="w-3.5 h-3.5 shrink-0" />
                    <span>Return to Roster</span>
                  </button>
                )}
                <button
                  onClick={() => setCurrentTab("information")}
                  className={`p-2 transition-colors rounded-lg cursor-pointer border ${currentTab === "information" ? "bg-red-600 text-white border-red-500 shadow-md shadow-red-900/20" : "text-zinc-400 hover:text-red-500 hover:border-red-900/40 bg-zinc-900 border-zinc-800"}`}
                  title="App Information & Guide"
                >
                  <Info className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsFeedbackOpen(true)}
                  className="p-2 text-zinc-400 hover:text-red-500 hover:border-red-900/40 transition-colors bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer"
                  title="Report Suggestions & Feedback"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 text-zinc-400 hover:text-red-500 transition-colors bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Actions Panel */}
          </div>
        </div>

        {/* Unified Mobile Slide-out Drawer Menu & Backdrop */}
        {isMenuOpen && userSession && (
          <>
            {/* Backdrop */}
            <div
              className="xl:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
              onClick={() => setIsMenuOpen(false)}
            />

            {/* Slide-out Drawer */}
            <div className="xl:hidden fixed top-0 left-0 right-0 z-50 bg-zinc-950 border-b border-zinc-800 p-5 space-y-5 animate-in slide-in-from-top-4 duration-300 shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Drawer Top Bar with Brand & Close Button */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <DojoLogo size={28} />
                  <span className="text-xs font-black uppercase tracking-wider text-white">
                    Buckner Martial Arts
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="p-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-lg transition cursor-pointer"
                  aria-label="Close Menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile Profile Display */}
              <div className="flex flex-col min-[380px]:flex-row items-stretch min-[380px]:items-center justify-between bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-500 shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block text-sm font-black text-zinc-100 uppercase tracking-tight">
                      {userSession?.name || "User"}
                    </span>
                    <span className="block text-[10px] font-black text-red-500 uppercase tracking-widest leading-none mt-0.5">
                      {userSession?.role}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full min-[380px]:w-auto">
                  <button
                    onClick={() => {
                      setCurrentTab("information");
                      setIsMenuOpen(false);
                    }}
                    className={`flex-1 min-[380px]:flex-initial px-3 py-2 text-[10px] font-black uppercase rounded-lg border transition tracking-wider text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                      currentTab === "information"
                        ? "bg-red-600 text-white border-red-500 shadow-md shadow-red-900/20"
                        : "text-zinc-400 hover:text-red-500 hover:border-red-900/40 bg-zinc-900 border-zinc-800"
                    }`}
                    title="App Information"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>Info</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsFeedbackOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="flex-1 min-[380px]:flex-initial px-3 py-2 bg-red-950/30 text-red-400 hover:bg-red-900/30 text-[10px] font-black uppercase rounded-lg border border-red-900/30 transition tracking-wider text-center flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Submit Suggestions"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Suggest</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 min-[380px]:flex-initial px-3 py-2 bg-zinc-800 hover:bg-red-950/30 text-zinc-400 hover:text-red-400 text-[10px] font-black uppercase rounded-lg border border-zinc-700 transition tracking-wider text-center cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              </div>

              {/* Temporary Return to Roster block for Instructor if currentTab is information */}
              {userSession && userSession.role === "Instructor" && currentTab === "information" && (
                <div className="pt-1 animate-in fade-in slide-in-from-top-3 duration-200">
                  <button
                    onClick={() => {
                      setCurrentTab("roster");
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-3 p-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition bg-red-600 text-white shadow-lg shadow-red-900/40 hover:bg-red-600 active:scale-95"
                  >
                    <Users className="w-4 h-4" /> Return to Roster
                  </button>
                </div>
              )}

              {userSession && userSession.role !== "Instructor" && (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      setCurrentTab("roster");
                      setIsMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                      currentTab === "roster"
                        ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <Users className="w-4 h-4" /> Roster
                  </button>
                  {(userSession.role === "Front Desk" || userSession.role === "Owner") && (
                    <button
                      onClick={() => {
                        setCurrentTab("enrollment");
                        setIsMenuOpen(false);
                      }}
                      className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                        currentTab === "enrollment"
                          ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <Clock className="w-4 h-4" /> Enrollments
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setCurrentTab("testForm");
                      setIsMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                      currentTab === "testForm"
                        ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <Calendar className="w-4 h-4" /> Setup
                  </button>
                  <button
                    onClick={() => {
                      setCurrentTab("invitations");
                      setIsMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                      currentTab === "invitations"
                        ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <FileText className="w-4 h-4" /> Invites
                  </button>
                  <button
                    onClick={() => {
                      setCurrentTab("stickers");
                      setIsMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                      currentTab === "stickers"
                        ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <Hash className="w-4 h-4" /> Labels
                  </button>
                  <button
                    onClick={() => {
                      setCurrentTab("beltPull");
                      setIsMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                      currentTab === "beltPull"
                        ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <Award className="w-4 h-4" /> Belts
                  </button>
                  <button
                    onClick={() => {
                      setCurrentTab("testing");
                      setIsMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                      currentTab === "testing"
                        ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                    }`}
                  >
                    <ClipboardCheck className="w-4 h-4" /> Testing
                  </button>
                  {userSession.role === "Owner" && (
                    <button
                      onClick={() => {
                        setCurrentTab("admin");
                        setIsMenuOpen(false);
                      }}
                      className={`flex items-center gap-2.5 p-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer active:scale-95 ${
                        currentTab === "admin"
                          ? "bg-red-600 text-white shadow-lg shadow-red-900/40"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <Crown className="w-4 h-4" /> Admin
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </header>

      {/* 2. Main Dashboard panel wrapper */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-20">
        {isInIframe &&
          ["stickers", "invitations", "beltPull", "testForm"].includes(
            currentTab,
          ) && (
            <div className="mb-6 bg-amber-950/60 border-2 border-amber-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 text-amber-500 shrink-0">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-amber-200 uppercase tracking-wide">
                    Browser Print Block Alert
                  </h4>
                  <p className="text-xs text-zinc-400 font-medium mt-0.5 leading-relaxed">
                    Browsers block printing triggered from within nested
                    workspace previews. To make the print preview load
                    successfully (or save to PDF), click the button on the right
                    to run the app in a dedicated tab!
                  </p>
                </div>
              </div>
              <a
                href={appUrl || window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full md:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-black text-xs rounded-xl transition shrink-0 uppercase tracking-widest flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-900/40 text-center select-none"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
                <span>Buckner Martial Arts</span>
              </a>
            </div>
          )}

        {/* TAB BODY 1: STUDENT ROSTER & ELIGIBILITY TABLE */}
        {currentTab === "roster" && (
          <StudentRoster
            students={students}
            studentsWithEligibility={studentsWithEligibility}
            stats={stats}
            testingLock={testingLock}
            isDatabaseActive={isDatabaseActive}
            customDojos={customDojos}
            onUpdateTestingLock={handleUpdateTestingLock}
            onUpdateInvitationsLock={handleUpdateInvitationsLock}
            onUpdateLabelsLock={handleUpdateLabelsLock}
            onUpdateBeltListLock={handleUpdateBeltListLock}
            onAddClick={(loc, prog) => {
              setEditingStudent(null);
              setFormInitialLocation(loc);
              setFormInitialProgram(prog);
              setIsFormOpen(true);
            }}
            onEditStudent={(student) => {
              setEditingStudent(student);
              setFormInitialLocation(student.location);
              setFormInitialProgram(student.programs?.[0]);
              setIsFormOpen(true);
            }}
            onDeleteStudent={handleDeleteStudent}
            onUpdateStudent={handleUpdateStudent}
            onAddStudents={handleAddStudentsBatch}
            onCycleOverride={handleCycleOverride}
            autoPrintAllRosters={autoPrintAllRosters}
            onClearAutoPrintAllRosters={() => setAutoPrintAllRosters(false)}
            userRole={userSession?.role}
            testDate={testDate}
            onTestDateChange={handleUpdateTestDate}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            classesBuffer={classesBuffer}
            onBufferChange={handleUpdateClassesBuffer}
            onBulkUpdate={handleBulkUpdate}
            onTabChange={(tab) => setCurrentTab(tab as any)}
          />
        )}

        {/* INACTIVE OLD TABLE COLD START BLOCK */}
        {false && (
          <div className="space-y-4 print:hidden animate-in fade-in duration-100"></div>
        )}
        {/* TAB BODY 2: STICKER SHEET CANVAS AND PRINTER CONTROLS */}
        {currentTab === "stickers" && (
          <div className="print:m-0 animate-in fade-in duration-100">
            <StickerSheet
              students={students}
              testDate={testDate}
              classesBuffer={classesBuffer}
              testingLock={labelsLock}
              onUpdateTestingLock={handleUpdateLabelsLock}
              onUpdateStudent={handleUpdateStudent}
              onBulkUpdate={handleBulkUpdate}
            />
          </div>
        )}

        {/* TAB BODY 3: TEST SETUP FORM PREVIEW & PRINTABLE BLOCKS */}
        {currentTab === "testForm" && (
          <div className="animate-in fade-in duration-100">
            <TestSetupForm
              students={students}
              onUpdateStudent={handleUpdateStudent}
              testDate={testDate}
              onTestDateChange={handleUpdateTestDate}
              classesBuffer={classesBuffer}
              testingLock={testingLock}
              onUpdateTestingLock={handleUpdateTestingLock}
            />
          </div>
        )}

        {/* TAB BODY 4: TESTING HALF-SHEET INVITATIONS */}
        {currentTab === "invitations" && (
          <div className="animate-in fade-in duration-100">
            <Invitations
              students={students}
              testDate={testDate}
              classesBuffer={classesBuffer}
              testingLock={invitationsLock}
              onUpdateTestingLock={handleUpdateInvitationsLock}
            />
          </div>
        )}

        {/* TAB BODY 4.2: BELT PULL LIST */}
        {currentTab === "beltPull" && (
          <div className="animate-in fade-in duration-100">
            <BeltPullList
              students={students}
              testDate={testDate}
              classesBuffer={classesBuffer}
              isDatabaseActive={isDatabaseActive}
              testingLock={beltListLock}
              onUpdateTestingLock={handleUpdateBeltListLock}
            />
          </div>
        )}

        {/* TAB BODY 4.7: ENROLLMENT EXPIRATIONS MANAGER */}
        {(currentTab === "enrollment" && (userSession?.role === "Front Desk" || userSession?.role === "Owner")) && (
          <div className="animate-in fade-in duration-100">
            <EnrollmentManager
              students={students}
              onUpdateStudent={handleUpdateStudent}
            />
          </div>
        )}

        {/* TAB BODY 4.9: OWNER ADMIN PANEL */}
        {currentTab === "admin" && userSession?.role === "Owner" && (
          <div className="animate-in fade-in duration-100">
            <AdminPanel
              customDojos={customDojos}
              onSaveDojo={handleSaveDojo}
              onDeleteDojo={handleDeleteDojo}
              currentUserName={userSession?.name || "Admin"}
              onAddStudents={handleAddStudentsBatch}
            />
          </div>
        )}

        {/* TAB BODY 4.8: TESTING DASHBOARD */}
        {currentTab === "testing" && (
          <div className="animate-in fade-in duration-100">
            <TestingTab
              students={students}
              onUpdateStudent={handleUpdateStudent}
              testDate={testDate}
              onTestDateChange={handleUpdateTestDate}
              classesBuffer={classesBuffer}
              isDatabaseActive={isDatabaseActive}
              onTabChange={(tab) => setCurrentTab(tab as any)}
              testingLock={testingLock}
              onUpdateTestingLock={handleUpdateTestingLock}
              onUpdateInvitationsLock={handleUpdateInvitationsLock}
              onUpdateLabelsLock={handleUpdateLabelsLock}
              onUpdateBeltListLock={handleUpdateBeltListLock}
              userRole={userSession?.role}
            />
          </div>
        )}

        {/* TAB BODY 5: INFORMATION MANUAL & CHECKLIST */}
        {currentTab === "information" && (
          <Information
            userRole={userSession?.role}
            isDatabaseActive={isDatabaseActive}
          />
        )}
      </main>

      {/* 4. Student Form Modal Overlay */}
      {isFormOpen && (
        <StudentForm
          student={editingStudent}
          initialLocation={formInitialLocation}
          initialProgram={formInitialProgram}
          onSave={handleSaveStudent}
          students={students}
          customDojos={customDojos}
          onClose={() => {
            setIsFormOpen(false);
            setEditingStudent(null);
            setFormInitialLocation(undefined);
            setFormInitialProgram(undefined);
          }}
          userRole={userSession?.role}
          testingLock={testingLock}
        />
      )}

      {/* 5. Suggestion Form Modal Overlay */}
      <SuggestionModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        userSession={userSession}
        isDatabaseActive={isDatabaseActive}
      />

      {/* 6. Delete Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm sm:p-6 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-sm w-full p-6 text-center space-y-6">
            <div className="mx-auto w-12 h-12 bg-red-950/50 flex items-center justify-center rounded-full mb-4">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-wider">
              Delete Student
            </h3>
            <p className="text-sm text-zinc-400 font-medium">
              Are you sure you want to permanently delete this student record?
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-center w-full mt-8">
              <button
                onClick={() => setStudentToDelete(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-bold uppercase tracking-widest text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteStudent}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold uppercase tracking-widest text-xs transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
