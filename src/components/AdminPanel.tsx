import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { AppUser, UserRole, ApprovalStatus, Dojo, Student } from '../types';
import { CreateDojoModal } from './CreateDojoModal';
import { BulkStudentUploadModal } from './BulkStudentUploadModal';
import {
  Crown,
  UserCheck,
  UserX,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Search,
  RefreshCw,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Mail,
  MailCheck,
  Calendar,
  SlidersHorizontal,
  ChevronRight,
  Building2,
  Plus,
  Edit3,
  Trash2,
  MapPin,
  Phone,
  Layers,
  Sparkles,
  Upload
} from 'lucide-react';

interface AdminPanelProps {
  customDojos?: Dojo[];
  onSaveDojo?: (dojo: Dojo) => Promise<void> | void;
  onDeleteDojo?: (dojoId: string) => Promise<void> | void;
  currentUserName?: string;
  onAddStudents?: (students: Student[]) => Promise<void> | void;
}

export function AdminPanel({
  customDojos = [],
  onSaveDojo,
  onDeleteDojo,
  currentUserName = 'Admin',
  onAddStudents,
}: AdminPanelProps = {}) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'waiting_list' | 'approved' | 'blocked' | 'all' | 'dojos'>('waiting_list');
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dojo Modal & Management State
  const [isCreateDojoModalOpen, setIsCreateDojoModalOpen] = useState(false);
  const [selectedDojoToEdit, setSelectedDojoToEdit] = useState<Dojo | null>(null);
  const [dojoToDelete, setDojoToDelete] = useState<Dojo | null>(null);

  // Bulk Student Upload Modal state
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [bulkUploadTargetLocation, setBulkUploadTargetLocation] = useState<string>('West Chester');

  const handleOpenBulkUpload = (locationName: string) => {
    setBulkUploadTargetLocation(locationName);
    setIsBulkUploadModalOpen(true);
  };

  // Subscribe to users collection in Firestore
  useEffect(() => {
    if (!db) {
      setIsLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');
        const usersRef = collection(db, 'users');
        const q = query(usersRef);

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const rawList: AppUser[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              const isSkipped = data.skipEmailVerification === true;
              const isVerified = data.emailVerified === true || isSkipped;
              const isExplicitDenied = data.approvalStatus === 'denied';
              const isAccepted =
                !isExplicitDenied &&
                (data.approvalStatus === 'approved' ||
                  data.approvalStatus === ('accepted' as any) ||
                  data.isActive === true ||
                  Boolean(data.approvedAt) ||
                  data.role === 'Owner');

              const approvalStatus: ApprovalStatus = isAccepted
                ? 'approved'
                : isExplicitDenied
                ? 'denied'
                : 'pending';

              rawList.push({
                id: docSnap.id,
                name: data.name || data.displayName || data.email?.split('@')[0] || docSnap.id,
                role: (data.role as UserRole) || 'Instructor',
                email: data.email || '',
                emailVerified: isVerified,
                skipEmailVerification: isSkipped,
                approvalStatus,
                location: data.location || 'All',
                createdAt: data.createdAt,
                lastLogin: data.lastLogin,
                approvedAt: data.approvedAt,
                deniedAt: data.deniedAt,
                isActive: isAccepted,
              });
            });

            // Deduplicate users/instructors smartly by email, UID, or name
            const userMap = new Map<string, AppUser>();
            rawList.forEach((u) => {
              const emailKey = u.email ? u.email.trim().toLowerCase() : null;
              const nameKey = u.name ? u.name.trim().toLowerCase() : null;
              const idKey = u.id;

              let existingKey: string | null = null;
              let existing: AppUser | null = null;

              for (const [key, userObj] of userMap.entries()) {
                if (
                  (emailKey && userObj.email && userObj.email.trim().toLowerCase() === emailKey) ||
                  (idKey && userObj.id === idKey) ||
                  (nameKey && userObj.name && userObj.name.trim().toLowerCase() === nameKey)
                ) {
                  existingKey = key;
                  existing = userObj;
                  break;
                }
              }

              if (!existing || !existingKey) {
                userMap.set(emailKey || idKey, u);
              } else {
                // If any associated doc is approved or active, the user is definitively approved
                const mergedApproved =
                  existing.approvalStatus === 'approved' ||
                  u.approvalStatus === 'approved' ||
                  existing.isActive === true ||
                  u.isActive === true ||
                  Boolean(existing.approvedAt) ||
                  Boolean(u.approvedAt) ||
                  existing.role === 'Owner' ||
                  u.role === 'Owner';

                const mergedStatus: ApprovalStatus = mergedApproved
                  ? 'approved'
                  : existing.approvalStatus === 'denied' || u.approvalStatus === 'denied'
                  ? 'denied'
                  : 'pending';

                const preferredId = u.id.length > existing.id.length ? u.id : existing.id;
                const preferredEmail = u.email || existing.email;
                const preferredName = u.name && u.name !== 'Unnamed User' ? u.name : existing.name;
                const preferredRole =
                  existing.role === 'Owner' || u.role === 'Owner'
                    ? 'Owner'
                    : (u.role || existing.role);

                userMap.set(existingKey, {
                  ...existing,
                  ...u,
                  id: preferredId,
                  name: preferredName,
                  email: preferredEmail,
                  role: preferredRole,
                  approvalStatus: mergedStatus,
                  isActive: mergedApproved,
                  emailVerified: existing.emailVerified || u.emailVerified || false,
                  skipEmailVerification: existing.skipEmailVerification || u.skipEmailVerification || false,
                  approvedAt: existing.approvedAt || u.approvedAt,
                });
              }
            });

            const userList = Array.from(userMap.values());

            // Sort: Pending items first, then by createdAt descending
            userList.sort((a, b) => {
              if (a.approvalStatus === 'pending' && b.approvalStatus !== 'pending') return -1;
              if (a.approvalStatus !== 'pending' && b.approvalStatus === 'pending') return 1;
              return 0;
            });

            setUsers(userList);
            setIsLoading(false);
          },
          (err) => {
            console.error('Error fetching users stream in AdminPanel:', err);
            setStatusMessage({ type: 'error', text: 'Failed to load live user updates from Firestore.' });
            setIsLoading(false);
          }
        );
      } catch (err: any) {
        console.error('Failed to setup Firestore user listener:', err);
        setIsLoading(false);
      }
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Filter lists by tab and search
  const pendingUsers = users.filter(u => u.approvalStatus === 'pending' && u.role !== 'Owner');
  const approvedUsers = users.filter(u => u.approvalStatus === 'approved' || u.role === 'Owner');
  const blockedUsers = users.filter(u => u.approvalStatus === 'denied' && u.role !== 'Owner');

  const getFilteredUsers = () => {
    let list: AppUser[] = [];
    if (activeTab === 'waiting_list') list = pendingUsers;
    else if (activeTab === 'approved') list = approvedUsers;
    else if (activeTab === 'blocked') list = blockedUsers;
    else list = users;

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(u =>
      u.name.toLowerCase().includes(term) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      u.role.toLowerCase().includes(term)
    );
  };

  const filteredUsers = getFilteredUsers();

  // Action handlers
  const handleApproveUser = async (user: AppUser) => {
    if (!db) return;
    setProcessingUserId(user.id);
    setStatusMessage(null);
    try {
      const { doc, setDoc, collection, query, where, getDocs } = await import('firebase/firestore');
      const approvedAt = new Date().toISOString();
      const updateData = {
        approvalStatus: 'approved' as const,
        isActive: true,
        emailVerified: true,
        skipEmailVerification: true,
        approvedAt,
      };

      // 1. Update the document for user.id
      const userRef = doc(db, 'users', user.id);
      await setDoc(userRef, updateData, { merge: true });

      // 2. Also search for and update any duplicate docs with the same email
      if (user.email) {
        try {
          const qEmail = query(collection(db, 'users'), where('email', '==', user.email.trim()));
          const snap = await getDocs(qEmail);
          for (const d of snap.docs) {
            if (d.id !== user.id) {
              await setDoc(doc(db, 'users', d.id), updateData, { merge: true });
            }
          }
        } catch (e) {
          console.warn('Could not update matching user docs by email:', e);
        }
      }

      // 3. Also update document with sanitized name if present and different from user.id
      if (user.name) {
        const sanitized = user.name.trim().replace(/\//g, '-');
        if (sanitized && sanitized !== user.id) {
          try {
            await setDoc(doc(db, 'users', sanitized), updateData, { merge: true });
          } catch (e) {
            // ignore
          }
        }
      }

      // Optimistically update local users state so UI immediately removes "Pending Authorization"
      setUsers((prev) =>
        prev.map((u) => {
          const matches =
            u.id === user.id ||
            (user.email && u.email && u.email.trim().toLowerCase() === user.email.trim().toLowerCase()) ||
            (user.name && u.name && u.name.trim().toLowerCase() === user.name.trim().toLowerCase());
          if (matches) {
            return {
              ...u,
              approvalStatus: 'approved',
              isActive: true,
              emailVerified: true,
              skipEmailVerification: true,
              approvedAt,
            };
          }
          return u;
        })
      );

      setStatusMessage({
        type: 'success',
        text: `Successfully approved ${user.name} (${user.email || 'No email'}). They can now access the portal.`
      });
    } catch (err: any) {
      console.error('Error approving user:', err);
      setStatusMessage({ type: 'error', text: `Failed to approve user: ${err.message}` });
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleToggleSkipEmailVerification = async (user: AppUser) => {
    if (!db) return;
    setProcessingUserId(user.id);
    setStatusMessage(null);
    try {
      const { doc, setDoc, collection, query, where, getDocs } = await import('firebase/firestore');
      const userRef = doc(db, 'users', user.id);
      const isCurrentlySkippedOrVerified = user.skipEmailVerification || user.emailVerified;
      const newStatus = !isCurrentlySkippedOrVerified;
      
      const updateData: any = {
        emailVerified: newStatus,
        skipEmailVerification: newStatus,
      };

      await setDoc(userRef, updateData, { merge: true });

      if (user.email) {
        try {
          const qEmail = query(collection(db, 'users'), where('email', '==', user.email.trim()));
          const snap = await getDocs(qEmail);
          for (const d of snap.docs) {
            if (d.id !== user.id) {
              await setDoc(doc(db, 'users', d.id), updateData, { merge: true });
            }
          }
        } catch (e) {
          console.warn('Could not update matching docs for skip email verification:', e);
        }
      }

      setUsers((prev) =>
        prev.map((u) => {
          const matches =
            u.id === user.id ||
            (user.email && u.email && u.email.trim().toLowerCase() === user.email.trim().toLowerCase());
          if (matches) {
            return {
              ...u,
              emailVerified: newStatus,
              skipEmailVerification: newStatus,
            };
          }
          return u;
        })
      );

      setStatusMessage({
        type: 'success',
        text: newStatus
          ? `Skipped email verification for ${user.name}. Account is marked as verified.`
          : `Re-enabled email verification requirement for ${user.name}.`
      });
    } catch (err: any) {
      console.error('Error toggling skip email verification:', err);
      setStatusMessage({ type: 'error', text: `Failed to update email verification status: ${err.message}` });
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleDenyUser = async (user: AppUser) => {
    if (!db) return;
    setProcessingUserId(user.id);
    setStatusMessage(null);
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', user.id);
      await setDoc(userRef, {
        approvalStatus: 'denied',
        isActive: false,
        deniedAt: new Date().toISOString()
      }, { merge: true });

      setStatusMessage({
        type: 'success',
        text: `Denied access for ${user.name}. Account added to the block list.`
      });
    } catch (err: any) {
      console.error('Error denying user:', err);
      setStatusMessage({ type: 'error', text: `Failed to deny user: ${err.message}` });
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleRoleChange = async (user: AppUser, newRole: UserRole) => {
    if (!db) return;
    setProcessingUserId(user.id);
    setStatusMessage(null);
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', user.id);
      await setDoc(userRef, {
        role: newRole
      }, { merge: true });

      setStatusMessage({
        type: 'success',
        text: `Updated ${user.name}'s role to ${newRole}.`
      });
    } catch (err: any) {
      console.error('Error changing role:', err);
      setStatusMessage({ type: 'error', text: `Failed to update role: ${err.message}` });
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleMoveToPending = async (user: AppUser) => {
    if (!db) return;
    setProcessingUserId(user.id);
    setStatusMessage(null);
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', user.id);
      await setDoc(userRef, {
        approvalStatus: 'pending',
        isActive: false
      }, { merge: true });

      setStatusMessage({
        type: 'success',
        text: `Moved ${user.name} back to the waiting list.`
      });
    } catch (err: any) {
      console.error('Error moving to pending:', err);
      setStatusMessage({ type: 'error', text: `Failed to update user status: ${err.message}` });
    } finally {
      setProcessingUserId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-4 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 border border-amber-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-amber-300 to-red-600" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-950/50">
              <Crown className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[10px] font-black uppercase tracking-widest rounded-full">
                  Owner Dashboard
                </span>
                <span className="text-zinc-600 font-mono text-xs">•</span>
                <span className="text-zinc-400 text-xs font-semibold">Firebase Verification System</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">
                Admin <span className="text-amber-400">Panel</span>
              </h1>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
                Manage dojo staff registrations, authorize accounts on the secondary verification waiting list, and inspect block lists.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => {
                setSelectedDojoToEdit(null);
                setIsCreateDojoModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-red-950/50 cursor-pointer transition active:scale-95"
            >
              <Layers className="w-4 h-4" />
              <span>+ Create New Program</span>
            </button>
            <div className="px-4 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-right">
              <span className="block text-[10px] font-extrabold uppercase tracking-widest text-zinc-500">
                Total Registrations
              </span>
              <span className="text-lg font-black font-mono text-white">
                {users.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Status Feedback */}
      {statusMessage && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
          statusMessage.type === 'success'
            ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
            : 'bg-red-950/30 border-red-800/60 text-red-200'
        }`}>
          <div className="flex items-center gap-3">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span className="text-xs sm:text-sm font-semibold">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider px-2 py-1 bg-zinc-900 rounded border border-zinc-800 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Category Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Waiting List Stat Card */}
        <button
          onClick={() => setActiveTab('waiting_list')}
          className={`text-left p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden group cursor-pointer ${
            activeTab === 'waiting_list'
              ? 'bg-amber-950/30 border-amber-500 shadow-xl shadow-amber-950/20'
              : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 animate-pulse" />
              Waiting List
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-black ${
              pendingUsers.length > 0
                ? 'bg-amber-500 text-zinc-950 animate-bounce'
                : 'bg-zinc-800 text-zinc-400'
            }`}>
              {pendingUsers.length}
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-white mb-1">
            {pendingUsers.length} <span className="text-xs font-normal font-sans text-zinc-400">Pending</span>
          </div>
          <p className="text-[11px] text-zinc-400 line-clamp-1">
            Accounts awaiting secondary verification approval
          </p>
        </button>

        {/* Approved Users Stat Card */}
        <button
          onClick={() => setActiveTab('approved')}
          className={`text-left p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden group cursor-pointer ${
            activeTab === 'approved'
              ? 'bg-emerald-950/30 border-emerald-500 shadow-xl shadow-emerald-950/20'
              : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Approved Staff
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-black bg-emerald-950 border border-emerald-800 text-emerald-300">
              {approvedUsers.length}
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-white mb-1">
            {approvedUsers.length} <span className="text-xs font-normal font-sans text-zinc-400">Active</span>
          </div>
          <p className="text-[11px] text-zinc-400 line-clamp-1">
            Authorized Front Desk, Instructors, and Owner
          </p>
        </button>

        {/* Block List Stat Card */}
        <button
          onClick={() => setActiveTab('blocked')}
          className={`text-left p-5 rounded-2xl border transition-all duration-200 relative overflow-hidden group cursor-pointer ${
            activeTab === 'blocked'
              ? 'bg-red-950/30 border-red-500 shadow-xl shadow-red-950/20'
              : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
              <UserX className="w-4 h-4" />
              Block List
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-black bg-red-950 border border-red-800 text-red-300">
              {blockedUsers.length}
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-white mb-1">
            {blockedUsers.length} <span className="text-xs font-normal font-sans text-zinc-400">Denied</span>
          </div>
          <p className="text-[11px] text-zinc-400 line-clamp-1">
            Accounts denied entry and blocked from opening app
          </p>
        </button>
      </div>

      {/* Control Bar: Search & Sub-Tabs */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Navigation Subtabs */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800/80 p-1 rounded-xl overflow-x-auto">
          <button
            onClick={() => setActiveTab('waiting_list')}
            className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'waiting_list'
                ? 'bg-amber-600 text-white shadow shadow-amber-900/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Waiting List</span>
            {pendingUsers.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-950 text-amber-200 rounded text-[10px] font-mono">
                {pendingUsers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('approved')}
            className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'approved'
                ? 'bg-emerald-600 text-white shadow shadow-emerald-900/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Approved Staff</span>
            <span className="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded text-[10px] font-mono">
              {approvedUsers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('blocked')}
            className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'blocked'
                ? 'bg-red-600 text-white shadow shadow-red-900/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Block List</span>
            <span className="px-1.5 py-0.2 bg-red-950 text-red-300 rounded text-[10px] font-mono">
              {blockedUsers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-zinc-700 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>All Users</span>
          </button>

          <button
            onClick={() => setActiveTab('dojos')}
            className={`px-3.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'dojos'
                ? 'bg-red-600 text-white shadow shadow-red-900/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Programs</span>
            <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded text-[10px] font-mono font-bold">
              {3 + customDojos.length}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search accounts by name or email..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 transition"
          />
        </div>
      </div>

      {/* Main List Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              {activeTab === 'waiting_list' && <Clock className="w-5 h-5 text-amber-400" />}
              {activeTab === 'approved' && <ShieldCheck className="w-5 h-5 text-emerald-400" />}
              {activeTab === 'blocked' && <UserX className="w-5 h-5 text-red-400" />}
              {activeTab === 'all' && <Users className="w-5 h-5 text-zinc-400" />}
              {activeTab === 'dojos' && <Layers className="w-5 h-5 text-red-500" />}
              {activeTab === 'waiting_list' && 'Waiting List (Pending Verification)'}
              {activeTab === 'approved' && 'Approved Dojo Accounts'}
              {activeTab === 'blocked' && 'Denied & Blocked Accounts'}
              {activeTab === 'all' && 'All Registered System Profiles'}
              {activeTab === 'dojos' && 'Programs & Customizable Profile Fields'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {activeTab === 'waiting_list' && 'Users who completed email verification and are waiting for Owner approval.'}
              {activeTab === 'approved' && 'Active accounts permitted to access and operate the app.'}
              {activeTab === 'blocked' && 'Accounts denied entry. These users are prevented from opening the application.'}
              {activeTab === 'all' && 'Full roster of accounts stored in Firestore.'}
              {activeTab === 'dojos' && 'Manage programs and satellite locations. The 3 primary dojos (West Chester, Monroe, YMCA) appear for all users. Custom programs appear at the bottom of the main page for Front Desk or Admin users with customizable student profile fields.'}
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-zinc-500">
            {activeTab === 'dojos' ? `${3 + customDojos.length} program(s)` : `Showing ${filteredUsers.length} profile(s)`}
          </span>
        </div>

        {/* Tab Body: Programs Management */}
        {activeTab === 'dojos' ? (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="p-4 bg-gradient-to-r from-red-950/30 via-zinc-950 to-zinc-900 border border-red-900/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wide flex items-center gap-2">
                  <Layers className="w-4 h-4 text-red-500" />
                  Programs & Student Profile Fields
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Create custom programs and configure which profile fields (and custom attributes) are active for each program.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenBulkUpload('West Chester')}
                  className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white font-black text-xs uppercase tracking-wider rounded-xl border border-zinc-700 shadow flex items-center gap-2 cursor-pointer transition active:scale-95"
                  title="Bulk upload a comma-separated list of students to the roster"
                >
                  <Upload className="w-4 h-4 text-red-500" />
                  <span>Bulk Upload CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDojoToEdit(null);
                    setIsCreateDojoModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-red-950/50 flex items-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  Create New Program
                </button>
              </div>
            </div>

            {/* Primary Dojos Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                Primary Default Locations (Visible to All Users)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { name: 'West Chester', desc: 'Main headquarters & primary testing dojo' },
                  { name: 'Monroe', desc: 'Branch dojo location with scheduled classes' },
                  { name: 'YMCA', desc: 'Community partnership location with custom schedule' }
                ].map((dojo) => (
                  <div
                    key={dojo.name}
                    className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2 relative overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-white uppercase tracking-wide">
                          {dojo.name}
                        </h4>
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-[9px] font-mono text-zinc-300 font-bold uppercase">
                          Primary • Permanent
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">{dojo.desc}</p>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">Standard Config</span>
                      <button
                        type="button"
                        onClick={() => handleOpenBulkUpload(dojo.name)}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-red-600/50 text-red-400 hover:text-red-300 rounded-lg text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                        title={`Bulk Add Students to ${dojo.name}`}
                      >
                        <Upload className="w-3 h-3" />
                        <span>Bulk Add</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom / Completed Programs Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Custom Programs (Front Desk & Admin Main Page Display)
                </h3>
                <span className="text-[11px] font-mono text-zinc-500">
                  {customDojos.length} custom program(s)
                </span>
              </div>

              {customDojos.length === 0 ? (
                <div className="py-10 px-4 text-center border-2 border-dashed border-zinc-800 rounded-2xl bg-zinc-950/40">
                  <Layers className="w-10 h-10 text-zinc-700 mx-auto mb-2" />
                  <h4 className="text-xs font-black text-zinc-300 uppercase tracking-wider">
                    No custom programs created yet
                  </h4>
                  <p className="text-[11px] text-zinc-500 max-w-sm mx-auto mt-1 mb-4">
                    Create new programs with custom student profile fields. Completed programs will automatically appear at the bottom of the main page for Front Desk and Admin users.
                  </p>
                  <button
                    onClick={() => {
                      setSelectedDojoToEdit(null);
                      setIsCreateDojoModalOpen(true);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
                  >
                    + Create First Program
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customDojos.map((dojo) => {
                    const activeFields = (dojo.customProfileFields || []).filter(f => f.enabled);
                    const customFields = (dojo.customProfileFields || []).filter(f => f.isCustom && f.enabled);

                    return (
                      <div
                        key={dojo.id}
                        className="p-5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-2xl space-y-4 shadow-sm transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-500 shrink-0">
                              <Layers className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-black text-white uppercase tracking-wide">
                                  {dojo.name}
                                </h4>
                                <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-600/40 text-[9px] font-mono text-amber-300 font-bold uppercase">
                                  Active Program
                                </span>
                              </div>
                              {dojo.address && (
                                <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-1">
                                  <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                  <span>{dojo.address}</span>
                                </p>
                              )}
                              {dojo.phone && (
                                <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                                  <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                  <span>{dojo.phone}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenBulkUpload(dojo.name)}
                              className="p-2 hover:bg-zinc-800 text-red-400 hover:text-red-300 rounded-lg transition cursor-pointer"
                              title={`Bulk Add Students to ${dojo.name} (CSV)`}
                            >
                              <Upload className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDojoToEdit(dojo);
                                setIsCreateDojoModalOpen(true);
                              }}
                              className="p-2 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition cursor-pointer"
                              title="Edit Program & Profile Fields"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDojoToDelete(dojo)}
                              className="p-2 hover:bg-red-950/50 text-zinc-500 hover:text-red-400 rounded-lg transition cursor-pointer"
                              title="Delete Program"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Configured Fields Summary */}
                        <div className="space-y-2 pt-2 border-t border-zinc-850">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-zinc-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                              <Layers className="w-3 h-3 text-red-500" />
                              Active Profile Fields ({activeFields.length})
                            </span>
                            {customFields.length > 0 && (
                              <span className="text-[10px] font-mono text-amber-400 font-bold">
                                {customFields.length} Custom Attribute(s)
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                            {activeFields.map((f) => (
                              <span
                                key={f.id}
                                className={`px-2 py-0.5 rounded text-[9.5px] font-medium border ${
                                  f.isCustom
                                    ? 'bg-amber-950/50 border-amber-600/40 text-amber-300'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                                }`}
                              >
                                {f.label}
                                {f.required && <span className="text-red-400 ml-1">*</span>}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-zinc-850 flex items-center justify-between text-[10px] text-zinc-500 gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenBulkUpload(dojo.name)}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-red-600/50 text-red-400 hover:text-red-300 rounded-lg text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                            title={`Bulk Add Students to ${dojo.name} (CSV)`}
                          >
                            <Upload className="w-3 h-3" />
                            <span>Bulk Add (CSV)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDojoToEdit(dojo);
                              setIsCreateDojoModalOpen(true);
                            }}
                            className="text-red-400 hover:text-red-300 font-bold uppercase tracking-wider cursor-pointer"
                          >
                            Customize Profile Fields &rarr;
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
            <span className="text-xs font-black uppercase tracking-wider">Syncing user database...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          /* Empty State */
          <div className="py-12 px-4 text-center border-2 border-dashed border-zinc-800/80 rounded-2xl bg-zinc-950/40">
            <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-500">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-zinc-300 uppercase tracking-wide">
              No matching profiles found
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
              {activeTab === 'waiting_list'
                ? 'There are currently no accounts waiting on the approval list.'
                : 'No accounts fit the current tab or search criteria.'}
            </p>
          </div>
        ) : (
          /* User Card Grid */
          <div className="space-y-3">
            {filteredUsers.map((user) => {
              const isOwner = user.role === 'Owner';
              const isApproved =
                user.approvalStatus === 'approved' ||
                user.approvalStatus === ('accepted' as any) ||
                user.isActive === true ||
                Boolean(user.approvedAt) ||
                isOwner;
              const isDenied = !isApproved && user.approvalStatus === 'denied';
              const isPending = !isApproved && !isDenied;
              const isProcessing = processingUserId === user.id;

              return (
                <div
                  key={user.id}
                  className={`p-4 rounded-xl border transition-all duration-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    isPending
                      ? 'bg-amber-950/10 border-amber-800/40 hover:border-amber-700/60'
                      : isDenied
                      ? 'bg-red-950/10 border-red-900/40 hover:border-red-800/60'
                      : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Left Column: User Profile Details */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-sm border ${
                      isOwner
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : isPending
                        ? 'bg-amber-950/40 text-amber-400 border-amber-800/60'
                        : isDenied
                        ? 'bg-red-950/40 text-red-400 border-red-800/60'
                        : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                    }`}>
                      {isOwner ? (
                        <Crown className="w-5 h-5 text-amber-400" />
                      ) : (
                        user.name.charAt(0).toUpperCase()
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-black text-sm text-white tracking-tight truncate">
                          {user.name}
                        </span>

                        {/* Role Badge */}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                          isOwner
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                            : user.role === 'Front Desk'
                            ? 'bg-red-950/50 border-red-800/60 text-red-300'
                            : 'bg-blue-950/50 border-blue-800/60 text-blue-300'
                        }`}>
                          {user.role}
                        </span>

                        {/* Approval Status Badge */}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border flex items-center gap-1 ${
                          isPending
                            ? 'bg-amber-950/60 text-amber-300 border-amber-700'
                            : isDenied
                            ? 'bg-red-950/60 text-red-300 border-red-700'
                            : 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
                        }`}>
                          {isPending && <Clock className="w-3 h-3 text-amber-400 animate-spin" />}
                          {isDenied && <XCircle className="w-3 h-3 text-red-400" />}
                          {isApproved && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                          <span>
                            {isPending ? 'Pending Authorization' : isDenied ? 'Denied / Blocked' : 'Approved'}
                          </span>
                        </span>

                        {/* Email Verified Indicator */}
                        {user.skipEmailVerification ? (
                          <span className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 text-[10px] font-mono border border-amber-800/60 flex items-center gap-1">
                            <MailCheck className="w-3 h-3 text-amber-400" />
                            Email Skipped
                          </span>
                        ) : user.emailVerified ? (
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-zinc-700 flex items-center gap-1">
                            ✓ Email Verified
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 text-[10px] font-mono border border-zinc-800 flex items-center gap-1">
                            Email Unverified
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                        {user.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-zinc-500" />
                            {user.email}
                          </span>
                        )}
                        {user.createdAt && (
                          <span className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                            <Calendar className="w-3 h-3 text-zinc-600" />
                            Registered: {new Date(user.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex flex-wrap items-center gap-2 self-end lg:self-center shrink-0">
                    {/* Skip Email Verification Toggle Button for non-owners */}
                    {!isOwner && (
                      <button
                        disabled={isProcessing}
                        onClick={() => handleToggleSkipEmailVerification(user)}
                        className={`px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer ${
                          user.skipEmailVerification || user.emailVerified
                            ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
                            : 'bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-700/80 shadow-md shadow-amber-950/40'
                        }`}
                        title={user.skipEmailVerification || user.emailVerified ? "Re-require email verification" : "Skip email verification requirement for this account"}
                      >
                        <MailCheck className="w-3.5 h-3.5 text-amber-400" />
                        <span>{user.skipEmailVerification || user.emailVerified ? 'Verification Skipped' : 'Skip Email Step'}</span>
                      </button>
                    )}
                    {/* Role Modifier Dropdown (Owner can change assigned role) */}
                    {!isOwner && (
                      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
                        <span className="text-[10px] font-extrabold uppercase text-zinc-500 px-1">
                          Role:
                        </span>
                        <select
                          disabled={isProcessing}
                          value={user.role}
                          onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                          className="bg-zinc-950 border border-zinc-800 text-xs font-extrabold text-zinc-200 rounded px-2 py-1 focus:outline-none focus:border-amber-500 cursor-pointer"
                        >
                          <option value="Instructor">Instructor</option>
                          <option value="Front Desk">Front Desk</option>
                          <option value="Owner">Owner</option>
                        </select>
                      </div>
                    )}

                    {/* Accept / Approve Button */}
                    {!isApproved && !isOwner && (
                      <button
                        disabled={isProcessing}
                        onClick={() => handleApproveUser(user)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-lg transition flex items-center gap-1.5 shadow-md shadow-emerald-950/40 active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        {isProcessing ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5" />
                        )}
                        <span>Accept</span>
                      </button>
                    )}

                    {/* Deny / Block Button */}
                    {!isDenied && !isOwner && (
                      <button
                        disabled={isProcessing}
                        onClick={() => handleDenyUser(user)}
                        className="px-3.5 py-2 bg-red-950/60 hover:bg-red-900/80 border border-red-800 text-red-300 hover:text-white font-black text-xs uppercase tracking-wider rounded-lg transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        {isProcessing ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserX className="w-3.5 h-3.5" />
                        )}
                        <span>{isPending ? 'Deny' : 'Block'}</span>
                      </button>
                    )}

                    {/* Move back to waiting list button if denied */}
                    {isDenied && !isOwner && (
                      <button
                        disabled={isProcessing}
                        onClick={() => handleMoveToPending(user)}
                        className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded-lg transition active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        Reset to Waiting List
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Dojo Modal */}
      {isCreateDojoModalOpen && (
        <CreateDojoModal
          isOpen={isCreateDojoModalOpen}
          onClose={() => {
            setIsCreateDojoModalOpen(false);
            setSelectedDojoToEdit(null);
          }}
          onSaveDojo={async (dojo) => {
            if (onSaveDojo) {
              await onSaveDojo(dojo);
            }
            setStatusMessage({
              type: 'success',
              text: `Program "${dojo.name}" profile and custom fields saved successfully!`
            });
            setTimeout(() => setStatusMessage(null), 4000);
          }}
          existingDojo={selectedDojoToEdit}
          existingDojos={customDojos}
          currentUserName={currentUserName}
        />
      )}

      {/* Delete Program Confirmation Dialog */}
      {dojoToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-500">
              <div className="p-3 bg-red-950/60 border border-red-900/60 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wide">
                  Delete Program?
                </h3>
                <p className="text-xs text-zinc-400">
                  {dojoToDelete.name}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to remove <strong className="text-white">{dojoToDelete.name}</strong> from the program registry? Existing students assigned to this program will retain their record, but this program will no longer appear on the main page.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDojoToDelete(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onDeleteDojo && dojoToDelete.id) {
                    await onDeleteDojo(dojoToDelete.id);
                  }
                  setStatusMessage({
                    type: 'success',
                    text: `Program "${dojoToDelete.name}" was removed.`
                  });
                  setTimeout(() => setStatusMessage(null), 4000);
                  setDojoToDelete(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer shadow-lg shadow-red-950/50"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Student Upload Modal */}
      <BulkStudentUploadModal
        isOpen={isBulkUploadModalOpen}
        onClose={() => setIsBulkUploadModalOpen(false)}
        defaultLocation={bulkUploadTargetLocation}
        defaultProgram={bulkUploadTargetLocation}
        availableLocations={['West Chester', 'Monroe', 'YMCA', ...customDojos.map(d => d.name)]}
        customDojos={customDojos}
        onAddStudents={async (newStudents) => {
          if (onAddStudents) {
            await onAddStudents(newStudents);
          }
          setStatusMessage({
            type: 'success',
            text: `Successfully added ${newStudents.length} student(s) to ${bulkUploadTargetLocation}.`
          });
          setTimeout(() => setStatusMessage(null), 5000);
        }}
      />
    </div>
  );
}
