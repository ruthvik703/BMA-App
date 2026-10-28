import React, { useState, useEffect } from "react";
import { db, auth } from "../firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut
} from "firebase/auth";
import {
  ShieldAlert,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Lock,
  User,
  UserCheck,
  CheckCircle2,
  ShieldCheck,
  MailCheck,
  RefreshCw,
  ArrowLeft,
  Clock,
  Crown,
  XCircle,
  Hourglass
} from "lucide-react";
import { DojoLogo } from "./DojoLogo";
import { UserRole, ApprovalStatus } from "../types";

interface LoginScreenProps {
  onLoginSuccess: (
    role: UserRole,
    operatorName: string,
  ) => void;
}

type AuthMode = "login" | "signup" | "verify" | "secondary_verification";

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  // Note: Selected Role on signup dropdown/toggle MUST only present Front Desk and Instructor (Owner can only be set via DB)
  const [selectedRole, setSelectedRole] = useState<"Front Desk" | "Instructor">("Front Desk");

  // Verification & Secondary Verification state tracking
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [pendingRole, setPendingRole] = useState<UserRole>("Front Desk");
  const [pendingName, setPendingName] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("pending");

  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg("Please provide both an email address and password.");
      return;
    }

    if (mode === "signup" && !displayName.trim()) {
      setErrorMsg("Please enter your full name.");
      return;
    }

    setIsAuthenticating(true);

    try {
      if (!auth) {
        throw new Error("Firebase Authentication is not available.");
      }

      if (mode === "signup") {
        // Create new account
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        const user = userCredential.user;
        const nameToSave = displayName.trim() || email.split("@")[0];

        // Send Firebase verification email
        try {
          await sendEmailVerification(user);
        } catch (emailErr) {
          console.warn("Error triggering email verification send:", emailErr);
        }

        // Save initial user document in Firestore on the waiting list (approvalStatus: "pending")
        if (db) {
          try {
            const userDocId = user.uid;
            await setDoc(doc(db, "users", userDocId), {
              id: user.uid,
              name: nameToSave,
              email: user.email,
              role: selectedRole, // Front Desk or Instructor
              emailVerified: false,
              approvalStatus: "pending", // Waiting list!
              isActive: false, // Inactive until approved by Owner
              createdAt: new Date().toISOString(),
              lastLogin: new Date().toISOString(),
            });
          } catch (dbErr) {
            console.warn("User document creation warning:", dbErr);
          }
        }

        // Transition to primary email verification screen
        setUnverifiedEmail(user.email || email.trim());
        setPendingRole(selectedRole);
        setPendingName(nameToSave);
        setApprovalStatus("pending");
        setMode("verify");
        setInfoMsg("Registration successful! A verification email was sent to your email address.");
      } else {
        // Sign in existing user
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        const user = userCredential.user;

        // Reload user to verify latest emailVerified state
        try {
          await user.reload();
        } catch (reloadErr) {
          console.warn("Error reloading user on sign in check:", reloadErr);
        }

        let role: UserRole = "Front Desk";
        let userApproval: ApprovalStatus = "pending";
        let operatorName = user.displayName || user.email?.split("@")[0] || "User";

        let isEmailVerified = user.emailVerified;

        if (db) {
          try {
            let userSnap = null;
            if (user.displayName) {
              const nameDocRef = doc(db, "users", user.displayName.trim().replace(/\//g, "-"));
              userSnap = await getDoc(nameDocRef);
            }
            if (!userSnap || !userSnap.exists()) {
              const uidDocRef = doc(db, "users", user.uid);
              userSnap = await getDoc(uidDocRef);
            }
            if ((!userSnap || !userSnap.exists()) && user.email) {
              const q = query(collection(db, "users"), where("email", "==", user.email));
              const querySnap = await getDocs(q);
              if (!querySnap.empty) {
                userSnap = querySnap.docs[0];
              }
            }

            if (userSnap && userSnap.exists()) {
              const userData = userSnap.data();
              if (userData.role === "Owner" || userData.role === "Instructor" || userData.role === "Front Desk") {
                role = userData.role;
              }
              if (userData.name) {
                operatorName = userData.name;
              }
              const isAccepted =
                role === "Owner" ||
                userData.approvalStatus === "approved" ||
                userData.approvalStatus === ("accepted" as any) ||
                userData.isActive === true ||
                Boolean(userData.approvedAt);

              if (isAccepted) {
                userApproval = "approved";
              } else if (userData.approvalStatus) {
                userApproval = userData.approvalStatus;
              }

              if (userData.emailVerified || userData.skipEmailVerification || userApproval === "approved" || role === "Owner") {
                isEmailVerified = true;
              }
            }
          } catch (fetchErr) {
            console.warn("Error reading user profile:", fetchErr);
          }
        }

        setUnverifiedEmail(user.email || email.trim());
        setPendingName(operatorName);
        setPendingRole(role);
        setApprovalStatus(userApproval);

        // Check if email is STILL unverified (Step 1)
        if (!isEmailVerified) {
          setMode("verify");
          setErrorMsg("Your account email is not verified yet. Please check your inbox or wait for Owner authorization.");
          return;
        }

        // Email IS verified -> Check Secondary Verification / Waiting List Approval Status
        if (role === "Owner" || userApproval === "approved") {
          // Sync to Firestore that user is approved and active so pending tag is never shown
          if (db) {
            try {
              const syncPayload = {
                id: user.uid,
                name: operatorName,
                email: user.email,
                role: role,
                approvalStatus: "approved" as const,
                isActive: true,
                emailVerified: true,
                skipEmailVerification: true,
                lastLogin: new Date().toISOString()
              };
              await setDoc(doc(db, "users", user.uid), syncPayload, { merge: true });
              if (operatorName && operatorName.trim().replace(/\//g, "-") !== user.uid) {
                await setDoc(doc(db, "users", operatorName.trim().replace(/\//g, "-")), syncPayload, { merge: true });
              }
            } catch (profileErr) {
              console.warn("Could not sync verified status:", profileErr);
            }
          }
          onLoginSuccess(role, operatorName);
        } else {
          // Account is pending approval or denied! Show secondary verification screen
          if (db) {
            try {
              await setDoc(
                doc(db, "users", user.uid),
                {
                  id: user.uid,
                  name: operatorName,
                  email: user.email,
                  role: role,
                  emailVerified: true,
                  lastLogin: new Date().toISOString()
                },
                { merge: true }
              );
            } catch (profileErr) {
              console.warn("Could not sync verified status:", profileErr);
            }
          }
          setMode("secondary_verification");
        }
      }
    } catch (err: any) {
      console.error("Auth Exception:", err);
      const code = err?.code || "";

      if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
        setErrorMsg("Invalid email or password. Please double check your credentials.");
      } else if (code === "auth/email-already-in-use") {
        setErrorMsg("An account with this email address already exists. Try logging in instead.");
      } else if (code === "auth/weak-password") {
        setErrorMsg("Password should be at least 6 characters long.");
      } else if (code === "auth/invalid-email") {
        setErrorMsg("Please enter a valid email address.");
      } else if (code === "auth/operation-not-allowed") {
        setErrorMsg(
          "Email/Password sign-in is not enabled in Firebase Console. Please enable Email/Password under Authentication > Sign-in method in your Firebase Console."
        );
      } else {
        setErrorMsg(err.message || "An authentication error occurred. Please try again.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Re-check email verification status (Step 1)
  const handleCheckVerification = async () => {
    setIsAuthenticating(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (!auth || !auth.currentUser) {
        setErrorMsg("Session expired. Please sign in again.");
        setMode("login");
        return;
      }

      await auth.currentUser.reload();

      let isVerified = auth.currentUser.emailVerified;
      let role: UserRole = pendingRole || "Front Desk";
      let userApproval: ApprovalStatus = "pending";
      let userName = pendingName || auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "User";

      // Read user doc from Firestore
      if (db) {
        try {
          const userDocId = userName ? userName.trim().replace(/\//g, "-") : auth.currentUser.uid;
          let userSnap = await getDoc(doc(db, "users", userDocId));
          if (!userSnap.exists()) {
            userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
          }
          if (userSnap.exists()) {
            const uData = userSnap.data();
            if (uData.role) role = uData.role;
            if (uData.name) userName = uData.name;
            if (role === "Owner") {
              userApproval = "approved";
            } else if (uData.approvalStatus) {
              userApproval = uData.approvalStatus;
            } else if (uData.isActive === true) {
              userApproval = "approved";
            }

            if (uData.emailVerified || uData.skipEmailVerification || userApproval === "approved" || role === "Owner") {
              isVerified = true;
            }
          }

          if (isVerified) {
            // Sync emailVerified: true in Firestore
            await setDoc(
              doc(db, "users", userDocId),
              {
                id: auth.currentUser.uid,
                name: userName,
                emailVerified: true,
                skipEmailVerification: true,
                lastLogin: new Date().toISOString()
              },
              { merge: true }
            );
          }
        } catch (e) {
          console.warn("Firestore update error:", e);
        }
      }

      if (isVerified) {
        setPendingName(userName);
        setPendingRole(role);
        setApprovalStatus(userApproval);

        if (role === "Owner" || userApproval === "approved") {
          setInfoMsg("Account verified and authorized! Logging you into the portal...");
          setTimeout(() => {
            onLoginSuccess(role, userName);
          }, 800);
        } else {
          // Transition to secondary verification (waiting list)
          setInfoMsg("Email verification completed! Secondary Owner authorization required.");
          setMode("secondary_verification");
        }
      } else {
        setErrorMsg("Email not verified yet. Please check your inbox or wait for Owner authorization.");
      }
    } catch (err: any) {
      console.error("Verification re-check error:", err);
      setErrorMsg("Unable to check verification status. Please try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Re-check Secondary Verification (Approval / Waiting List) status
  const handleCheckApprovalStatus = async () => {
    setIsAuthenticating(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (!auth || !auth.currentUser) {
        setErrorMsg("Session expired. Please sign in again.");
        setMode("login");
        return;
      }

      await auth.currentUser.reload();

      let currentRole: UserRole = pendingRole;
      let currentApproval: ApprovalStatus = approvalStatus;
      let userName = pendingName || auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "User";

      if (db) {
        try {
          const userDocId = userName ? userName.trim().replace(/\//g, "-") : auth.currentUser.uid;
          let userSnap = await getDoc(doc(db, "users", userDocId));
          if (!userSnap.exists()) {
            userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
          }
          if ((!userSnap || !userSnap.exists()) && auth.currentUser.email) {
            const q = query(collection(db, "users"), where("email", "==", auth.currentUser.email));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              userSnap = querySnap.docs[0];
            }
          }

          if (userSnap && userSnap.exists()) {
            const uData = userSnap.data();
            if (uData.role) currentRole = uData.role;
            if (uData.name) userName = uData.name;
            if (currentRole === "Owner") {
              currentApproval = "approved";
            } else if (uData.approvalStatus) {
              currentApproval = uData.approvalStatus;
            } else if (uData.isActive === true) {
              currentApproval = "approved";
            }
          }
        } catch (err) {
          console.warn("Error re-checking approval status:", err);
        }
      }

      setPendingName(userName);
      setPendingRole(currentRole);
      setApprovalStatus(currentApproval);

      if (currentRole === "Owner" || currentApproval === "approved") {
        setInfoMsg("Congratulations! Your account request has been approved by the Owner.");
        setTimeout(() => {
          onLoginSuccess(currentRole, userName);
        }, 1000);
      } else if (currentApproval === "denied") {
        setErrorMsg("Your account request was reviewed and denied. You are on the block list.");
      } else {
        setInfoMsg("Your account is still on the waiting list pending Owner authorization.");
      }
    } catch (err: any) {
      console.error("Approval re-check error:", err);
      setErrorMsg("Unable to refresh approval status. Please try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleResendEmail = async () => {
    setIsAuthenticating(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (!auth || !auth.currentUser) {
        setErrorMsg("Session expired. Please try signing in again.");
        setMode("login");
        return;
      }

      await sendEmailVerification(auth.currentUser);
      setInfoMsg(`Verification email resent to ${unverifiedEmail || auth.currentUser.email}. Please check your inbox.`);
    } catch (err: any) {
      console.error("Resend email error:", err);
      if (err?.code === "auth/too-many-requests") {
        setErrorMsg("Too many requests sent. Please wait a few minutes before requesting another verification email.");
      } else {
        setErrorMsg("Failed to resend verification email. Please try again later.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleBackToLogin = async () => {
    try {
      if (auth) await signOut(auth);
    } catch (e) {
      console.warn("Sign out error:", e);
    }
    setErrorMsg(null);
    setInfoMsg(null);
    setMode("login");
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-red-600 selection:text-white">
      {/* High contrast visual background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950 opacity-90 pointer-events-none" />

      {/* Login Card */}
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 md:p-8 overflow-hidden z-10 transition duration-300">
        {/* Visual Martial Arts Master Ribbon Accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-red-600" />
        <div className="absolute top-1.5 inset-x-0 h-0.5 bg-zinc-950" />
        <div className="absolute top-2 inset-x-0 h-1 bg-red-600" />

        <div className="flex flex-col items-center text-center mt-3 select-none">
          <div className="relative">
            <DojoLogo
              size={76}
              className="shadow-lg border border-zinc-800 bg-zinc-950"
            />
          </div>
          <h2 className="text-xl font-black uppercase text-zinc-100 tracking-wider mt-4">
            Buckner Martial Arts
          </h2>
          <p className="text-zinc-500 text-[10.5px] uppercase font-bold font-mono tracking-widest mt-1">
            Dojo Operator Portal
          </p>
        </div>

        {mode !== "verify" && mode !== "secondary_verification" && (
          /* Auth Mode Toggle Bar */
          <div className="mt-6 flex rounded-xl bg-zinc-950 p-1 border border-zinc-800/80">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-red-600 text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                mode === "signup"
                  ? "bg-red-600 text-white shadow-md"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            <span className="text-zinc-500 text-[10.5px] uppercase font-bold font-mono tracking-wider">
              Loading Portal...
            </span>
          </div>
        ) : mode === "secondary_verification" ? (
          /* SECONDARY VERIFICATION SCREEN (Waiting List / Pending Owner Approval OR Blocked) */
          <div className="mt-6 space-y-5 animate-in fade-in duration-300">
            {approvalStatus === "denied" ? (
              /* Blocked / Denied View */
              <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-5 text-center flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl bg-red-600/10 border border-red-600/30 flex items-center justify-center text-red-500 mb-3 shadow-lg shadow-red-950/50">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <span className="px-2.5 py-0.5 bg-red-950 border border-red-800 text-red-400 font-mono text-[10px] font-black uppercase tracking-widest rounded-full mb-2">
                  Access Denied
                </span>
                <h3 className="text-lg font-black uppercase text-zinc-100 tracking-wider">
                  Account Blocked
                </h3>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  Your account request was reviewed and denied. You are on the block list and cannot access the application.
                </p>

                <div className="w-full mt-4 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-left space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Name:</span>
                    <span className="text-zinc-200 font-bold">{pendingName || "User"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Email:</span>
                    <span className="text-red-400 font-bold truncate max-w-[200px]">{unverifiedEmail || auth?.currentUser?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Status:</span>
                    <span className="text-red-500 font-black uppercase">Blocked</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Pending Waiting List View */
              <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-5 text-center flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 shadow-lg shadow-amber-950/50">
                  <Clock className="w-8 h-8 animate-pulse" />
                </div>
                <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[10px] font-black uppercase tracking-widest rounded-full mb-2">
                  Waiting List
                </span>
                <h3 className="text-base font-black uppercase text-zinc-100 tracking-wider">
                  Pending Owner Verification
                </h3>
                <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
                  Email verification complete! Your account request is now on the waiting list pending secondary verification and authorization by the Dojo Owner.
                </p>

                <div className="w-full mt-4 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-left space-y-2 font-mono text-xs">
                  <div className="flex justify-between border-b border-zinc-800/80 pb-1.5">
                    <span className="text-zinc-500">Applicant:</span>
                    <span className="text-zinc-200 font-bold">{pendingName || "User"}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/80 pb-1.5">
                    <span className="text-zinc-500">Email:</span>
                    <span className="text-amber-400 font-bold truncate max-w-[200px]">{unverifiedEmail || auth?.currentUser?.email}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800/80 pb-1.5">
                    <span className="text-zinc-500">Requested Role:</span>
                    <span className="text-zinc-200 font-bold">{pendingRole}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Current Status:</span>
                    <span className="text-amber-400 font-black uppercase flex items-center gap-1">
                      <Hourglass className="w-3 h-3 animate-spin" />
                      Pending Approval
                    </span>
                  </div>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="bg-red-950/40 border border-red-900/50 p-3 rounded-xl flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="text-[11px] text-red-300 font-medium leading-relaxed">
                  {errorMsg}
                </span>
              </div>
            )}

            {infoMsg && (
              <div className="bg-emerald-950/40 border border-emerald-900/50 p-3 rounded-xl flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-emerald-300 font-medium leading-relaxed">
                  {infoMsg}
                </span>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              {approvalStatus !== "denied" && (
                <button
                  type="button"
                  onClick={handleCheckApprovalStatus}
                  disabled={isAuthenticating}
                  className="w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-amber-950/40 cursor-pointer disabled:opacity-40 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {isAuthenticating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Check Approval Status
                </button>
              )}

              <button
                type="button"
                onClick={handleBackToLogin}
                className="w-full py-3 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-xs uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Sign Out & Return to Sign In
              </button>
            </div>
          </div>
        ) : mode === "verify" ? (
          /* PRIMARY EMAIL VERIFICATION VIEW */
          <div className="mt-6 space-y-5 animate-in fade-in duration-300">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-center flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-red-600/10 border border-red-600/30 flex items-center justify-center text-red-500 mb-3 shadow-inner">
                <MailCheck className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-base font-black uppercase text-zinc-100 tracking-wider">
                Verify Email Address
              </h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Step 1: We sent a verification link to:
              </p>
              <div className="mt-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono font-bold text-red-400 truncate max-w-full">
                {unverifiedEmail || auth?.currentUser?.email || "your email"}
              </div>
              <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
                Please check your inbox (and spam folder) and click the link to validate your account before proceeding.
              </p>
            </div>

            {errorMsg && (
              <div className="bg-red-950/40 border border-red-900/50 p-3 rounded-xl flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="text-[11px] text-red-300 font-medium leading-relaxed">
                  {errorMsg}
                </span>
              </div>
            )}

            {infoMsg && (
              <div className="bg-emerald-950/40 border border-emerald-900/50 p-3 rounded-xl flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-emerald-300 font-medium leading-relaxed">
                  {infoMsg}
                </span>
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleCheckVerification}
                disabled={isAuthenticating}
                className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-red-950/40 cursor-pointer disabled:opacity-40 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isAuthenticating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Refresh Status
              </button>

              <button
                type="button"
                onClick={handleResendEmail}
                disabled={isAuthenticating}
                className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-40 transition"
              >
                Resend Verification Email
              </button>

              <button
                type="button"
                onClick={handleBackToLogin}
                className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer mt-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>
            </div>
          </div>
        ) : (
          /* Email / Password Sign In or Create Account Form */
          <form onSubmit={handleEmailAuth} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-[10.5px] uppercase font-black text-zinc-400 tracking-wider mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-red-600 transition"
                    required={mode === "signup"}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10.5px] uppercase font-black text-zinc-400 tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-red-600 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10.5px] uppercase font-black text-zinc-400 tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-red-600 transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label className="block text-[10.5px] uppercase font-black text-zinc-400 tracking-wider mb-1.5">
                  Assigned Account Type (Role)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRole("Front Desk")}
                    className={`py-3 px-3 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      selectedRole === "Front Desk"
                        ? "bg-zinc-800 border-red-600 text-white shadow-md"
                        : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                    Front Desk
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole("Instructor")}
                    className={`py-3 px-3 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      selectedRole === "Instructor"
                        ? "bg-zinc-800 border-red-600 text-white shadow-md"
                        : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                    Instructor
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="bg-red-950/40 border border-red-900/50 p-3 rounded-xl flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span className="text-[11px] text-red-300 font-medium leading-relaxed">
                  {errorMsg}
                </span>
              </div>
            )}

            {infoMsg && (
              <div className="bg-emerald-950/40 border border-emerald-900/50 p-3 rounded-xl flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-emerald-300 font-medium leading-relaxed">
                  {infoMsg}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-3.5 mt-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-red-950/40 cursor-pointer disabled:opacity-40 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === "signup" ? "Creating Account..." : "Signing In..."}
                </>
              ) : mode === "signup" ? (
                "Register & Verify Email"
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
