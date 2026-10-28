import React, { useState, useMemo, useEffect } from 'react';
import { Student } from '../types';
import { 
  Users, Check, X, AlertTriangle, ChevronDown, ChevronUp, User,
  RefreshCw, Trash2, Search, Calendar, Ban, CheckCircle, 
  MapPin, Tag, ArrowRight, ShieldAlert, Sparkles, Clock, Printer,
  ShieldCheck, CreditCard, Camera
} from 'lucide-react';
import { getStudentProgramExpiryState, getLastDayOfMonthDate, calculateDefaultExpiryDate } from '../dateHelpers';
import { DojoLogo } from './DojoLogo';

const monthsList = [
  { value: "01", label: "01 (Jan)" },
  { value: "02", label: "02 (Feb)" },
  { value: "03", label: "03 (Mar)" },
  { value: "04", label: "04 (Apr)" },
  { value: "05", label: "05 (May)" },
  { value: "06", label: "06 (Jun)" },
  { value: "07", label: "07 (Jul)" },
  { value: "08", label: "08 (Aug)" },
  { value: "09", label: "09 (Sep)" },
  { value: "10", label: "10 (Oct)" },
  { value: "11", label: "11 (Nov)" },
  { value: "12", label: "12 (Dec)" }
];

const currentYearNum = new Date().getFullYear();
const yearsList = Array.from({ length: 15 }, (_, i) => String(currentYearNum - 2 + i));

const getParsedMonthYear = (dateStr: string) => {
  if (!dateStr) {
    const d = new Date();
    return {
      month: String(d.getMonth() + 1).padStart(2, '0'),
      year: String(d.getFullYear())
    };
  }
  const parts = dateStr.split('-');
  return {
    year: parts[0] || String(new Date().getFullYear()),
    month: parts[1] ? parts[1].padStart(2, '0') : String(new Date().getMonth() + 1).padStart(2, '0')
  };
};

interface EnrollmentManagerProps {
  students: Student[];
  onUpdateStudent: (student: Student) => Promise<void>;
}

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

export function EnrollmentManager({ students, onUpdateStudent }: EnrollmentManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLocation, setFilterLocation] = useState<'all' | 'West Chester' | 'Monroe' | 'YMCA'>('all');
  const [filterProgram, setFilterProgram] = useState<'all' | 'karate' | 'tots' | 'kobudo'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'expiring' | 'expired' | 'active' | 'discontinued'>('all');
  const [filterAgreement, setFilterAgreement] = useState<string>('all');
  const [viewFilter, setViewFilter] = useState<'expiring' | 'all'>('expiring');

  // Renewal Modal state
  const [renewStudent, setRenewStudent] = useState<Student | null>(null);
  const [renewProgram, setRenewProgram] = useState<string>('');
  const [newAgreement, setNewAgreement] = useState<string>('');
  const [newExpiry, setNewExpiry] = useState<string>('');
  const [renewFromMode, setRenewFromMode] = useState<'today' | 'expiry'>('today');
  const [renewCreditCardOnFile, setRenewCreditCardOnFile] = useState<boolean>(false);
  const [renewPhotoReleaseSigned, setRenewPhotoReleaseSigned] = useState<boolean>(false);

  const [printMode, setPrintMode] = useState<'none' | 'expirations' | 'birthdays' | 'enrollment_sheet'>('none');
  const [printMonth, setPrintMonth] = useState<string>(
    new Date().toISOString().substring(0, 7)
  );

  // Print Enrollments with family
  const [printFamilyModalStudent, setPrintFamilyModalStudent] = useState<Student | null>(null);
  const [selectedFamilyStudents, setSelectedFamilyStudents] = useState<Student[]>([]);
  const [familySearchQuery, setFamilySearchQuery] = useState('');
  const [enrollmentNotes, setEnrollmentNotes] = useState('');
  const [enrollmentPrintStudents, setEnrollmentPrintStudents] = useState<Student[]>([]);
  const [enrollmentPrintNotes, setEnrollmentPrintNotes] = useState<string>('');

  useEffect(() => {
    if (printMode !== 'none') {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      const cleanupTimer = setTimeout(() => {
        setPrintMode('none');
      }, 120000);
      return () => {
        clearTimeout(timer);
        clearTimeout(cleanupTimer);
      };
    }
  }, [printMode]);

  // Get current Year-Month string (YYYY-MM)
  const currentYM = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Matching search results for "Print with Family" modal
  const matchingStudents = useMemo(() => {
    if (!familySearchQuery.trim()) return [];
    const q = familySearchQuery.toLowerCase();
    return students.filter(s => {
      if (printFamilyModalStudent && s.id === printFamilyModalStudent.id) return false;
      if (selectedFamilyStudents.some(sel => sel.id === s.id)) return false;
      return s.name.toLowerCase().includes(q) || (s.notes && s.notes.toLowerCase().includes(q));
    }).slice(0, 5);
  }, [students, familySearchQuery, printFamilyModalStudent, selectedFamilyStudents]);

  // Compute stats for expired/expiring agreements
  const stats = useMemo(() => {
    let expiredCount = 0;
    let expiringCount = 0;
    let totalAgreements = 0;
    let discontOnExpiryCount = 0;

    students.forEach(student => {
      if (student.inactive) return;
      const activeProgs = student.programs || [];
      const agreementsKeys = Object.keys(student.enrollmentAgreements || {});
      const allProgs = Array.from(new Set([...activeProgs, ...agreementsKeys]));

      allProgs.forEach(prog => {
        const agreement = student.enrollmentAgreements?.[prog] || (activeProgs.includes(prog as any) ? (prog === 'kobudo' ? '6 months' : 'Monthly') : undefined);
        if (agreement && agreement !== 'Monthly' && agreement !== 'None') {
          const state = getStudentProgramExpiryState(student, prog);
          const isDiscontinued = !!student.discontinueAfterExpiry?.[prog];

          // Discontinued programs past their expiry date are removed off the enrollments page
          if (isDiscontinued && state === 'expired') return;

          totalAgreements++;
          if (isDiscontinued) {
            discontOnExpiryCount++;
          }
          if (state === 'expiring') {
            expiringCount++;
          } else if (state === 'expired') {
            expiredCount++;
          }
        }
      });
    });

    return { expiredCount, expiringCount, totalAgreements, discontOnExpiryCount };
  }, [students]);

  // Expand helper
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  // Expiry status calculator
  const getExpiryState = (student: Student, program: string): 'none' | 'expiring' | 'expired' => {
    return getStudentProgramExpiryState(student, program);
  };

  // List of student programs that are expiries
  const expiringStudentsList = useMemo(() => {
    const list: { 
      student: Student; 
      program: string; 
      status: 'expiring' | 'expired' | 'active';
      expiryDate: string;
      agreement: string;
      discontinued: boolean;
    }[] = [];

    students.forEach(student => {
      if (student.inactive) return;
      const activeProgs = student.programs || [];
      const agreementsKeys = Object.keys(student.enrollmentAgreements || {});
      const allProgs = Array.from(new Set([...activeProgs, ...agreementsKeys]));

      allProgs.forEach(prog => {
        const agreement = student.enrollmentAgreements?.[prog] || (activeProgs.includes(prog as any) ? (prog === 'kobudo' ? '6 months' : 'Monthly') : undefined);
        if (agreement && agreement !== 'None') {
          const state = getExpiryState(student, prog);
          
          if (viewFilter === 'expiring' && state !== 'expiring' && state !== 'expired') {
            return;
          }

          // Discontinued programs past their expiry date are removed off the enrollments page
          if (student.discontinueAfterExpiry?.[prog] && state === 'expired') {
            return;
          }

          list.push({
            student,
            program: prog,
            status: state === 'none' ? 'active' : state,
            expiryDate: student.enrollmentExpiries?.[prog] || '',
            agreement,
            discontinued: !!student.discontinueAfterExpiry?.[prog]
          });
        }
      });
    });

    return list.filter(item => {
      // Apply filters
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = q === '' || 
        item.student.name.toLowerCase().includes(q) ||
        (item.student.notes && item.student.notes.toLowerCase().includes(q));

      const matchesLocation = filterLocation === 'all' || (item.student.location || 'West Chester') === filterLocation;
      const matchesProgram = filterProgram === 'all' || item.program === filterProgram;

      let matchesStatus = true;
      if (filterStatus === 'expiring') matchesStatus = item.status === 'expiring';
      else if (filterStatus === 'expired') matchesStatus = item.status === 'expired';
      else if (filterStatus === 'active') matchesStatus = item.status === 'active';
      else if (filterStatus === 'discontinued') matchesStatus = item.discontinued;

      const matchesAgreement = filterAgreement === 'all' || item.agreement === filterAgreement;

      return matchesSearch && matchesLocation && matchesProgram && matchesStatus && matchesAgreement;
    }).sort((a, b) => {
      if (!a.expiryDate && b.expiryDate) return 1;
      if (a.expiryDate && !b.expiryDate) return -1;
      return a.expiryDate.localeCompare(b.expiryDate) || a.student.name.localeCompare(b.student.name);
    });
  }, [students, searchQuery, filterLocation, filterProgram, filterStatus, filterAgreement, viewFilter]);

  // Fast renewal offsets helper
  const applyPresetMonths = (months: number) => {
    let baseDate = new Date();
    if (renewFromMode === 'expiry' && renewStudent && renewStudent.enrollmentExpiries?.[renewProgram]) {
      const parts = renewStudent.enrollmentExpiries[renewProgram].split('-');
      if (parts.length >= 2) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // 0-based
        const day = parts.length === 3 ? parseInt(parts[2], 10) : 15;
        baseDate = new Date(year, month, day);
      }
    }
    
    // Add months
    const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + months, baseDate.getDate());
    
     if (newAgreement === 'Introductory') {
      const targetYMD = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
      setNewExpiry(targetYMD);
    } else {
      const targetYM = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
      setNewExpiry(getLastDayOfMonthDate(targetYM));
    }

    // Auto set agreement type
    if (months === 1) setNewAgreement('Monthly');
    else if (months === 6) setNewAgreement('6 months');
    else if (months === 12) setNewAgreement('12 months');
  };

  // Open renewal modal
  const openRenewal = (item: typeof expiringStudentsList[number]) => {
    setRenewStudent(item.student);
    setRenewProgram(item.program);
    setNewAgreement(item.agreement || '6 months');
    setNewExpiry(item.expiryDate || getLastDayOfMonthDate(currentYM));
    setRenewCreditCardOnFile(!!item.student.creditCardOnFile);
    setRenewPhotoReleaseSigned(!!item.student.photoReleaseSigned);
    
    // Decide initial renewFromMode
    if (item.status === 'expired') {
      setRenewFromMode('today');
    } else {
      setRenewFromMode('expiry');
    }
  };

  // Handle renewal submission
  const saveRenewal = async () => {
    if (!renewStudent) return;
    
    const agreements = { ...(renewStudent.enrollmentAgreements || {}) };
    const expiries = { ...(renewStudent.enrollmentExpiries || {}) };
    const discontinueFlags = { ...(renewStudent.discontinueAfterExpiry || {}) };

    agreements[renewProgram] = newAgreement || 'Monthly';
    if (renewProgram === 'competition_team') {
      delete agreements['tiny_tigers'];
      delete expiries['tiny_tigers'];
      delete discontinueFlags['tiny_tigers'];
    }
    if (renewProgram === 'tiny_tigers') {
      delete agreements['competition_team'];
      delete expiries['competition_team'];
      delete discontinueFlags['competition_team'];
    }

    if (newAgreement === 'Monthly') {
      // Monthly doesn't typically expire, or we can clear expiry
      delete expiries[renewProgram];
    } else {
      expiries[renewProgram] = newExpiry;
    }

    // Since we are updating or renewing, we remove the discontinue flag so they stay active!
    discontinueFlags[renewProgram] = false;

    const updatedStudent: Student = {
      ...renewStudent,
      enrollmentAgreements: agreements,
      enrollmentExpiries: expiries,
      discontinueAfterExpiry: discontinueFlags,
      creditCardOnFile: renewCreditCardOnFile,
      photoReleaseSigned: renewPhotoReleaseSigned
    };

    await onUpdateStudent(updatedStudent);
    setRenewStudent(null);
  };

  // Handle toggle discontinuation flag
  const toggleDiscontinue = async (student: Student, program: string) => {
    const discontinueFlags = { ...(student.discontinueAfterExpiry || {}) };
    const current = !!discontinueFlags[program];
    const newDiscontinueState = !current;
    discontinueFlags[program] = newDiscontinueState;

    const state = getStudentProgramExpiryState(student, program);
    let updatedStudent: Student = {
      ...student,
      discontinueAfterExpiry: discontinueFlags
    };

    // If marking for discontinuation and agreement is ALREADY expired,
    // mark student inactive in roster and remove program off enrollments page immediately
    if (newDiscontinueState && state === 'expired') {
      const remainingProgs = (student.programs || []).filter(p => p !== program);
      const agreements = { ...(student.enrollmentAgreements || {}) };
      const expiries = { ...(student.enrollmentExpiries || {}) };
      delete agreements[program];
      delete expiries[program];
      delete discontinueFlags[program];

      updatedStudent = {
        ...updatedStudent,
        programs: remainingProgs,
        enrollmentAgreements: agreements,
        enrollmentExpiries: expiries,
        discontinueAfterExpiry: discontinueFlags,
        inactive: remainingProgs.length === 0 ? true : student.inactive
      };
    }

    await onUpdateStudent(updatedStudent);
  };

  return (
    <>
    <div className="space-y-6 print:hidden">
      {/* 1. Page Header with Stats Grid */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black uppercase text-zinc-100 tracking-wider">
            Enrollment Expirations
          </h2>
          <p className="text-xs text-zinc-400 font-medium font-sans mt-0.5 leading-relaxed">
            Monitor and renew student agreements expiries here. All agreements conclude at the end of their set month.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {stats.expiredCount > 0 && (
            <div className="px-3.5 py-1.5 bg-red-950/40 border border-red-900/40 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
              <span>{stats.expiredCount} Already Expired</span>
            </div>
          )}
          {stats.expiringCount > 0 && (
            <div className="px-3.5 py-1.5 bg-amber-950/40 border border-amber-900/40 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>{stats.expiringCount} Expiring This Month ({getLastDayOfMonthDate(currentYM)})</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 my-2 w-full">
        <button
          onClick={() => setPrintMode('expirations')}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] sm:text-xs tracking-wider sm:tracking-widest transition shadow-xl shadow-red-900/40 cursor-pointer font-sans uppercase active:scale-95"
          title="Print all expirations up to the selected date, including past ones"
        >
          <Printer className="w-3.5 h-3.5 text-white shrink-0" />
          <span>Print Expirations up to {getLastDayOfMonthDate(printMonth).substring(0, 7)}</span>
        </button>
        <button
          onClick={() => setPrintMode('birthdays')}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[10px] sm:text-xs tracking-wider sm:tracking-widest transition shadow-xl shadow-red-900/40 cursor-pointer font-sans uppercase active:scale-95"
        >
          <Printer className="w-3.5 h-3.5 text-white shrink-0" />
          <span>Print {getLastDayOfMonthDate(printMonth).substring(0, 7)} Birthdays</span>
        </button>
        <input 
          type="month"
          value={printMonth}
          onChange={(e) => setPrintMonth(e.target.value)}
          className="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 outline-none focus:border-red-500 w-full sm:w-auto"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Expired Alerts</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono ${stats.expiredCount > 0 ? 'text-red-500' : 'text-zinc-500'}`}>
              {stats.expiredCount}
            </span>
          </div>
          <p className="text-[9px] text-zinc-500 font-medium mt-1">Past scheduled renewal month</p>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Expiring This Month</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono ${stats.expiringCount > 0 ? 'text-amber-500' : 'text-zinc-500'}`}>
              {stats.expiringCount}
            </span>
          </div>
          <p className="text-[9px] text-zinc-500 font-medium mt-1">Expires on {getLastDayOfMonthDate(currentYM)}</p>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Discontinue Pending</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-2xl sm:text-3xl font-black font-mono ${stats.discontOnExpiryCount > 0 ? 'text-orange-400' : 'text-zinc-500'}`}>
              {stats.discontOnExpiryCount}
            </span>
          </div>
          <p className="text-[9px] text-zinc-500 font-medium mt-1">Scheduled to drop off after expiry</p>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total Managed</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl sm:text-3xl font-black font-mono text-zinc-200">
              {stats.totalAgreements}
            </span>
          </div>
          <p className="text-[9px] text-zinc-500 font-medium mt-1">Total trackable commitments</p>
        </div>
      </div>

      {/* 2. Search & Controls Filter Bar */}
      <div className="p-4 bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-xl space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Toggle Button Group */}
          <div className="flex p-0.5 bg-zinc-950 border border-zinc-800/80 rounded-xl shrink-0 h-11 select-none w-full lg:w-auto">
            <button
              type="button"
              onClick={() => {
                setViewFilter("expiring");
                setFilterStatus("all"); // Reset status filter when switching view Filters
              }}
              className={`flex-1 lg:flex-initial px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center ${
                viewFilter === "expiring"
                  ? "bg-amber-600 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Show only expiring or expired enrollments"
            >
              Expiring Enrollments
            </button>
            <button
              type="button"
              onClick={() => {
                setViewFilter("all");
                setFilterStatus("all");
              }}
              className={`flex-1 lg:flex-initial px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center ${
                viewFilter === "all"
                  ? "bg-red-600 text-white shadow"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Show all active student enrollments"
            >
              All Enrollments
            </button>
          </div>

          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder={viewFilter === "expiring" ? "Search expiring students by name or notes..." : "Search students by name or notes..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-red-650 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none transition font-sans text-sm shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 flex items-center justify-center h-5 w-5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filters grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Location filter */}
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value as any)}
              className="px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 focus:outline-none focus:border-red-650 text-xs font-black uppercase tracking-widest transition"
            >
              <option value="all">All Locations</option>
              <option value="West Chester">West Chester</option>
              <option value="Monroe">Monroe</option>
              <option value="YMCA">YMCA</option>
            </select>

            {/* Program filter */}
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value as any)}
              className="px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 focus:outline-none focus:border-red-650 text-xs font-black uppercase tracking-widest transition"
            >
              <option value="all">All Programs</option>
              <option value="karate">Karate</option>
              <option value="tots">Tots</option>
              <option value="kobudo">Kobudo</option>
            </select>

            {/* Status filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 focus:outline-none focus:border-red-650 text-xs font-black uppercase tracking-widest transition"
            >
              <option value="all">All States</option>
              <option value="expiring">Expiring This Month</option>
              <option value="expired">Expired Past Month</option>
              {viewFilter === 'all' && <option value="active">Active (No Alerts)</option>}
              <option value="discontinued">Discontinue Scheduled</option>
            </select>

            {/* Agreement type filter */}
            <select
              value={filterAgreement}
              onChange={(e) => setFilterAgreement(e.target.value)}
              className="px-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 focus:outline-none focus:border-red-650 text-xs font-black uppercase tracking-widest transition"
            >
              <option value="all">All Agreements</option>
              <option value="6 months">6 Months</option>
              <option value="12 months">12 Months</option>
              <option value="Introductory">Introductory</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Main Data Table */}
      {expiringStudentsList.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-20 text-center text-zinc-500 select-none">
          <CheckCircle className="w-12 h-12 text-emerald-950 mx-auto mb-2" />
          <p className="font-bold text-zinc-400 text-xs uppercase tracking-widest">
            {viewFilter === 'expiring' ? 'No Expiring or Expired Student Records Found.' : 'No Student Enrollment Records Found.'}
          </p>
          <p className="text-zinc-500 mt-1 max-w-sm mx-auto text-[10.5px]">
            {viewFilter === 'expiring' 
              ? 'Every registered student appears fully paid up and integrated, or they do not match the current search filters.'
              : 'No student matches the current search and filter settings.'}
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-950 p-4 border-b border-zinc-800 select-none text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                  <th className="px-6 py-4">Student & Location</th>
                  <th className="px-6 py-4 shrink-0">Program</th>
                  <th className="px-6 py-4">Agreement</th>
                  <th className="px-6 py-4">Expiry</th>
                  <th className="px-6 py-4">Discontinue Post Expiry</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/65 bg-zinc-900 bg-gradient-to-b from-zinc-900/60 to-zinc-950/30">
                {expiringStudentsList.map((item) => {
                  const key = `${item.student.id}_${item.program}`;
                  const isExpanded = expandedRowKey === key;
                  
                  // Row background matching requirement:
                  // Expiring (this month) -> turning ORANGE
                  // Past expiry -> turning RED
                  const rowColorClass = item.status === 'expiring'
                    ? 'bg-amber-950/15 text-amber-100 border-l-4 border-l-amber-500 hover:bg-amber-950/25'
                    : item.status === 'expired'
                      ? 'bg-red-950/15 text-red-100 border-l-4 border-l-red-500 hover:bg-red-950/25'
                      : 'hover:bg-zinc-800/40 border-l-4 border-l-transparent';

                  return (
                    <React.Fragment key={key}>
                      <tr 
                        onClick={() => setExpandedRowKey(isExpanded ? null : key)}
                        className={`transition table-row-hover text-zinc-300 border-b border-zinc-800/40 cursor-default ${rowColorClass}`}
                      >
                        {/* Student Name & Location */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-black text-zinc-100 text-sm">{item.student.name}</span>
                            <span className="text-[10px] text-zinc-500 font-mono mt-0.5 flex items-center gap-1 uppercase tracking-wider font-extrabold select-none">
                              <MapPin className="w-3 h-3 text-zinc-500" />
                              {item.student.location || 'West Chester'}
                            </span>
                          </div>
                        </td>

                        {/* Program */}
                        <td className="px-6 py-4">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                            item.program === 'karate' ? 'bg-zinc-950 border border-zinc-800 text-zinc-300' :
                            item.program === 'tots' ? 'bg-amber-950/80 border border-amber-900/30 text-amber-400' :
                            item.program === 'kobudo' ? 'bg-purple-950/80 border border-purple-900/30 text-purple-300' :
                            'bg-red-950/80 border border-red-900/30 text-red-400'
                          }`}>
                            {formatProgramName(item.program)}
                          </span>
                        </td>

                        {/* Agreement type */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="text-[11px] font-mono uppercase font-black text-zinc-300">
                              {item.agreement}
                            </span>
                          </div>
                        </td>

                        {/* Expiry */}
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono font-bold tracking-tight">
                            {item.expiryDate}
                          </span>
                        </td>

                        {/* Discontinue after expiry checker */}
                        <td className="px-6 py-4">
                          {item.discontinued ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-950/40 border border-orange-900/40 text-[10px] font-black text-orange-400 uppercase tracking-wider leading-none">
                              <Ban className="w-3 h-3" /> Discontinuation Slated
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-950/30 border border-zinc-800 text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">
                              No
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                const fIds = item.student.familyIds || [];
                                const familyStudents = students.filter(s => fIds.includes(s.id));
                                setEnrollmentPrintStudents([item.student, ...familyStudents]);
                                setEnrollmentPrintNotes(item.student.notes || '');
                                setPrintMode('enrollment_sheet');
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white transition rounded text-[8.5px] font-black uppercase tracking-wider select-none cursor-pointer shadow-md duration-150 active:scale-95"
                              title="Print student's enrollment agreements (with optional family members)"
                            >
                              <Printer className="w-3 h-3 text-white shrink-0" />
                              <span>Print Enrollments</span>
                            </button>

                            <button
                              onClick={() => openRenewal(item)}
                              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition shadow-md hover:shadow-red-900/40 flex items-center gap-1 cursor-pointer"
                              title="Update Agreement Expiry"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Update</span>
                            </button>

                            <button
                              onClick={() => toggleDiscontinue(item.student, item.program)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition border flex items-center gap-1 cursor-pointer ${
                                item.discontinued 
                                  ? 'bg-amber-900/20 border-amber-800 text-amber-400 hover:bg-amber-900/30' 
                                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
                              }`}
                              title={item.discontinued ? "Undo scheduled disappearance" : "Disappear student off roster AFTER expiry"}
                            >
                              <Ban className="w-3 h-3" />
                              <span>{item.discontinued ? 'Resume Roster' : 'Discontinue'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Mobile View Details */}
                      {isExpanded && (
                        <tr className="bg-zinc-950/50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
                              <h4 className="text-xs font-black text-zinc-100 uppercase tracking-widest">
                                Contact & Enrollment Details
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                                <div>
                                  <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider block mb-1">Credit Card Form:</span>
                                  <label className="inline-flex items-center gap-2 cursor-pointer select-none bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-lg transition" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={!!item.student.creditCardOnFile}
                                      onChange={async (e) => {
                                        await onUpdateStudent({
                                          ...item.student,
                                          creditCardOnFile: e.target.checked
                                        });
                                      }}
                                      className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-500"
                                    />
                                    <span className="text-xs font-semibold text-zinc-200">
                                      {item.student.creditCardOnFile ? 'Form Filled / On File' : 'Not filled'}
                                    </span>
                                  </label>
                                </div>
                                <div>
                                  <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider block mb-1">Photo Release:</span>
                                  <label className="inline-flex items-center gap-2 cursor-pointer select-none bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-lg transition" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={!!item.student.photoReleaseSigned}
                                      onChange={async (e) => {
                                        await onUpdateStudent({
                                          ...item.student,
                                          photoReleaseSigned: e.target.checked
                                        });
                                      }}
                                      className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-500"
                                    />
                                    <span className="text-xs font-semibold text-zinc-200">
                                      {item.student.photoReleaseSigned ? 'Signed' : 'Not signed'}
                                    </span>
                                  </label>
                                </div>
                                <div>
                                  <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider block">Program Location:</span>
                                  <span className="font-semibold text-zinc-300">{item.student.location || 'West Chester Dojo'}</span>
                                </div>
                                {item.student.notes && (
                                  <div className="col-span-1 sm:col-span-3">
                                    <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider block">Student Notes:</span>
                                    <p className="text-zinc-400 mt-1 italic font-sans max-w-2xl text-[11px] leading-relaxed">
                                      "{item.student.notes}"
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Renewal dialog overlay UI */}
      {renewStudent && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 select-none">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-red-500 shrink-0" />
                <h3 className="font-extrabold text-sm sm:text-base text-zinc-100 uppercase tracking-widest">
                  Update Enrollment Agreement
                </h3>
              </div>
              <button
                onClick={() => setRenewStudent(null)}
                className="p-1 px-2.5 bg-zinc-800 hover:bg-red-955/20 text-zinc-400 hover:text-red-500 rounded-lg text-xs font-bold transition font-mono"
              >
                ESC
              </button>
            </div>

            {/* Student & Program details card */}
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center gap-3">
              <div className="bg-red-500/10 p-2 text-red-400 rounded-lg border border-red-500/20">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="font-black text-sm text-zinc-100 leading-tight">{renewStudent.name}</p>
                <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px] font-extrabold uppercase select-none text-zinc-500">
                  <span>{formatProgramName(renewProgram)}</span>
                  <span>•</span>
                  <span>CURRENT: {renewStudent.enrollmentAgreements?.[renewProgram] || 'No style'} ({renewStudent.enrollmentExpiries?.[renewProgram] || 'None'})</span>
                </div>
              </div>
            </div>

            {/* Base Option: Renew starting from today or starting from current expiry */}
            {renewStudent.enrollmentExpiries?.[renewProgram] && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                  Calculate Renewal Starting From
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRenewFromMode('expiry');
                      // Add preset buffer of 6 months using new base date
                      const parts = (renewStudent.enrollmentExpiries?.[renewProgram] || '').split('-');
                      if (parts.length >= 2) {
                        const yr = parseInt(parts[0], 10);
                        const mn = parseInt(parts[1], 10) - 1;
                        const targetD = new Date(yr, mn + 6, 15);
                        setNewExpiry(getLastDayOfMonthDate(`${targetD.getFullYear()}-${String(targetD.getMonth() + 1).padStart(2, '0')}`));
                      }
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition text-center ${
                      renewFromMode === 'expiry' 
                        ? 'bg-red-600/15 border-red-600/30 text-red-400' 
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    Current Expiry ({renewStudent.enrollmentExpiries[renewProgram]})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenewFromMode('today');
                      const now = new Date();
                      const targetD = new Date(now.getFullYear(), now.getMonth() + 6, 15);
                      setNewExpiry(getLastDayOfMonthDate(`${targetD.getFullYear()}-${String(targetD.getMonth() + 1).padStart(2, '0')}`));
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition text-center ${
                      renewFromMode === 'today' 
                        ? 'bg-red-600/15 border-red-600/30 text-red-400' 
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    Today ({getLastDayOfMonthDate(currentYM)})
                  </button>
                </div>
              </div>
            )}

            {/* Fast Preset Presets Buttons */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                Quick Preset Calculators
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPresetMonths(1)}
                  className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800/80 rounded-lg text-[10px] font-black uppercase text-zinc-300 transition tracking-wide"
                >
                  +1 Month
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetMonths(6)}
                  className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800/80 rounded-lg text-[10px] font-black uppercase text-zinc-300 transition tracking-wide"
                >
                  6 Months (Standard style)
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetMonths(12)}
                  className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800/80 rounded-lg text-[10px] font-black uppercase text-zinc-300 transition tracking-wide"
                >
                  12 Months (Standard style)
                </button>
              </div>
            </div>

            {/* Form Fields container */}
            <div className="space-y-4 pt-2 border-t border-zinc-800">
              {/* Type selector */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                  New Agreement Type
                </label>
                <select
                  value={newAgreement}
                  onChange={(e) => {
                    const selectedAg = e.target.value;
                    setNewAgreement(selectedAg);
                    const autoExpiry = calculateDefaultExpiryDate(selectedAg);
                    if (autoExpiry) {
                      setNewExpiry(autoExpiry);
                    }
                  }}
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-red-600 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none transition text-sm"
                >
                    {(() => {
                      let opts: string[] = [];
                      if (renewProgram === 'tots') opts = ['Introductory', 'Monthly'];
                      else if (renewProgram === 'karate') opts = ['Introductory', 'Monthly', '6 months', '12 months'];
                      else if (renewProgram === 'kobudo') opts = ['Introductory', '6 months', '12 months'];
                      else if (renewProgram === 'competition_team') opts = ['Monthly'];
                      else if (renewProgram === 'tiny_tigers') opts = ['Monthly'];
                      else if (renewProgram === 'fitness') opts = ['Monthly'];
                      else if (renewProgram === 'kojin') opts = ['Monthly', '6 months', '12 months'];
                      else opts = ['Introductory', 'Monthly', '6 months', '12 months'];

                      return opts.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ));
                    })()}
                </select>
              </div>

              {/* Month Selector */}
              {newAgreement !== 'Monthly' && (
                <div className="space-y-1.5 animate-in fade-in duration-250">
                  {newAgreement === 'Introductory' ? (
                    <>
                      <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                        New Expiry (Specific Date)
                      </label>
                      <input
                        type="date"
                        value={newExpiry}
                        onChange={(e) => setNewExpiry(e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-600 rounded-xl text-zinc-100 focus:outline-none transition font-sans text-xs"
                      />
                    </>
                  ) : (
                    <>
                      <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                        New Expiry (Month & Year)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[8px] font-black text-zinc-500 uppercase tracking-wider mb-0.5">Month</label>
                          <select
                            value={getParsedMonthYear(newExpiry).month}
                            onChange={(e) => {
                              const m = e.target.value;
                              const y = getParsedMonthYear(newExpiry).year;
                              setNewExpiry(getLastDayOfMonthDate(`${y}-${m}`));
                            }}
                            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-600 rounded-xl text-zinc-100 focus:outline-none transition font-sans text-xs"
                          >
                            {monthsList.map(m => (
                              <option key={m.value} value={m.value} className="bg-zinc-900 text-zinc-100">
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[8px] font-black text-zinc-500 uppercase tracking-wider mb-0.5">Year</label>
                          <select
                            value={getParsedMonthYear(newExpiry).year}
                            onChange={(e) => {
                              const y = e.target.value;
                              const m = getParsedMonthYear(newExpiry).month;
                              setNewExpiry(getLastDayOfMonthDate(`${y}-${m}`));
                            }}
                            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-600 rounded-xl text-zinc-100 focus:outline-none transition font-sans text-xs"
                          >
                            {yearsList.map(y => (
                              <option key={y} value={y} className="bg-zinc-900 text-zinc-100">
                                {y}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                  {newExpiry && (
                    <p className="text-[10px] text-red-200/50 mt-1 flex items-center gap-1 font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                      Expires on: <span className="font-extrabold text-red-400">{newExpiry}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Required Documents & Compliance Checkboxes */}
            <div className="space-y-2.5 pt-2 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-red-500" />
                <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                  Required Documents & Status
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Photo Release checkbox */}
                <label className="flex items-start gap-2.5 bg-zinc-950 p-3 rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition select-none">
                  <input
                    id="enrollment_modal_photo_release"
                    type="checkbox"
                    checked={renewPhotoReleaseSigned}
                    onChange={(e) => setRenewPhotoReleaseSigned(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-zinc-700 bg-zinc-900 text-red-600 focus:ring-red-500 focus:ring-offset-zinc-950"
                  />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-xs font-bold text-zinc-200">Photo Release</span>
                    </div>
                    <span className="text-[9.5px] text-zinc-500 mt-0.5">Media & photo consent</span>
                  </div>
                </label>

                {/* Credit Card Form Filled checkbox */}
                <label className="flex items-start gap-2.5 bg-zinc-950 p-3 rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition select-none">
                  <input
                    id="enrollment_modal_credit_card_filled"
                    type="checkbox"
                    checked={renewCreditCardOnFile}
                    onChange={(e) => setRenewCreditCardOnFile(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-zinc-700 bg-zinc-900 text-red-600 focus:ring-red-500 focus:ring-offset-zinc-950"
                  />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-xs font-bold text-zinc-200">Credit Card Form</span>
                    </div>
                    <span className="text-[9.5px] text-zinc-500 mt-0.5">Billing card on file</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Save controls */}
            <div className="flex items-center gap-3 pt-3 border-t border-zinc-800 select-none">
              <button
                type="button"
                onClick={() => setRenewStudent(null)}
                className="flex-1 py-3 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 text-xs font-black uppercase tracking-widest rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveRenewal}
                className="flex-1 py-3 bg-red-600 hover:bg-red-600 text-white text-xs font-black uppercase tracking-widest rounded-xl transition shadow-lg shadow-red-900/40 cursor-pointer"
              >
                Confirm Renewal
              </button>
            </div>
          </div>
        </div>
      )}


    </div>

    {/* Printable Zones */}
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
          body, html, #root, main {
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            display: block !important;
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

    {printMode === 'birthdays' && (() => {
      const monthStr = printMonth.split('-')[1];
      const yearStr = printMonth.split('-')[0];
      const bdays = students
        .filter(s => s.birthday && parseInt(s.birthday.split('-')[1], 10) === parseInt(monthStr, 10))
        .sort((a, b) => parseInt(a.birthday!.split('-')[2], 10) - parseInt(b.birthday!.split('-')[2], 10));

      const groupedSheets = [];
      for (let i = 0; i < bdays.length; i += 2) {
        groupedSheets.push(bdays.slice(i, i + 2));
      }

      return (
        <div className="hidden print:block font-sans text-black bg-white">
          {groupedSheets.length === 0 && (
            <div className="p-8">No birthdays found for this month.</div>
          )}
          {groupedSheets.map((sheetItems, sheetIndex) => (
            <div key={sheetIndex} className="print-sheet-portrait mx-auto" style={{ width: '8.5in', height: '11.0in', boxSizing: 'border-box', padding: '0.4in' }}>
              <div className="h-full flex flex-col justify-between" style={{ height: '10.2in' }}>
                {sheetItems.map((student, itemIndex) => (
                  <div key={student.id} className={`flex flex-col p-4 border-[6px] border-double border-zinc-900 bg-white relative ${itemIndex === 0 ? 'mb-6' : ''}`} style={{ height: '4.6in', boxSizing: 'border-box' }}>
                    
                    {/* Header */}
                    <div className="flex flex-col items-center mb-2 text-center">
                      <div className="flex items-center gap-2 mb-1">
                        <DojoLogo size={36} />
                        <h2 className="text-2xl font-black text-zinc-950 uppercase tracking-tight">Buckner Martial Arts</h2>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                      <h2 className="text-3xl font-black uppercase tracking-widest text-zinc-900">Happy Birthday!</h2>
                      <p className="text-5xl font-bold text-red-650 tracking-tight pb-4">{student.name}</p>
                      <div className="text-zinc-600 font-bold uppercase tracking-widest text-lg">
                        Birthday Month: {new Date(parseInt(yearStr), parseInt(monthStr) - 1).toLocaleString('default', { month: 'long' })}
                      </div>
                    </div>

                  </div>
                ))}

                {sheetItems.length === 1 && (
                  <div style={{ height: '4.6in' }} />
                )}
              </div>
            </div>
          ))}
        </div>
      );
    })()}

    {printMode === 'expirations' && (
      <div className="hidden print:block w-full font-sans text-black bg-white p-8">
        <div className="flex items-center gap-4 mb-6 border-b-4 border-black pb-4">
          <DojoLogo size={48} />
          <div>
            <h2 className="text-2xl font-black text-zinc-950 uppercase tracking-tight leading-none mb-1">Buckner Martial Arts</h2>
            <h1 className="text-xl font-bold text-zinc-600 uppercase tracking-widest">
              Expirations (Up To {new Date(parseInt(printMonth.split('-')[0]), parseInt(printMonth.split('-')[1]) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })})
            </h1>
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-2 font-bold uppercase tracking-wider text-xs">Student Name</th>
              <th className="py-2 font-bold uppercase tracking-wider text-xs">Program</th>
              <th className="py-2 font-bold uppercase tracking-wider text-xs">Agreement Type</th>
              <th className="py-2 font-bold uppercase tracking-wider text-xs">Date of Expiration</th>
              <th className="py-2 font-bold uppercase tracking-wider text-xs">Location</th>
              <th className="py-2 font-bold uppercase tracking-wider text-xs">Class Time</th>
            </tr>
          </thead>
          <tbody>
            {students
              .filter(s => !s.inactive)
              .flatMap(s => {
                const activeProgs = s.programs || [];
                const agreementProgs = Object.keys(s.enrollmentAgreements || {});
                const allProgs = Array.from(new Set([...activeProgs, ...agreementProgs]));
                return allProgs.map(prog => ({
                  student: s,
                  prog,
                  agreement: s.enrollmentAgreements?.[prog] || (activeProgs.includes(prog as any) ? (prog === 'kobudo' ? '6 months' : 'Monthly') : undefined),
                  expiry: s.enrollmentExpiries?.[prog]
                }));
              })
              .filter(item => item.agreement && item.agreement !== 'None' && item.agreement !== 'Monthly' && item.expiry && item.expiry.substring(0, 7) <= printMonth)
              .sort((a, b) => {
                if (a.student.location !== b.student.location) return a.student.location.localeCompare(b.student.location);
                const aTime = `${a.student.scheduleDay1 || ''} ${a.student.scheduleTime1 || ''}`.trim();
                const bTime = `${b.student.scheduleDay1 || ''} ${b.student.scheduleTime1 || ''}`.trim();
                if (aTime !== bTime) return aTime.localeCompare(bTime);
                return a.student.name.localeCompare(b.student.name);
              })
              .map((item, i) => (
              <tr key={i} className="border-b border-zinc-300 text-sm">
                <td className="py-2 font-bold">{item.student.name}</td>
                <td className="py-2 capitalize">{formatProgramName(item.prog)}</td>
                <td className="py-2 font-medium">{item.agreement}</td>
                <td className="py-2 font-mono font-medium">{item.expiry}</td>
                <td className="py-2 font-medium">{item.student.location}</td>
                <td className="py-2 text-xs font-semibold uppercase tracking-wider text-zinc-700">
                  {item.student.scheduleDay1 || ''} {item.student.scheduleTime1 || ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {printMode === 'enrollment_sheet' && (
      <div className="hidden print:block font-sans text-black bg-white">
        <div 
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
                  {(() => {
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

                    const printRows: { name: string; membership: string; expiration: string }[] = [];
                    enrollmentPrintStudents.forEach(student => {
                      const activeProgs = student.programs || [];
                      const agreementProgs = Object.keys(student.enrollmentAgreements || {}).filter(
                        k => student.enrollmentAgreements?.[k] && student.enrollmentAgreements?.[k] !== "None"
                      );
                      const allProgs = Array.from(new Set([...activeProgs, ...agreementProgs]));

                      if (allProgs.length === 0) {
                        printRows.push({
                          name: student.name,
                          membership: "None",
                          expiration: ""
                        });
                      } else {
                        allProgs.forEach(prog => {
                          const agreement = student.enrollmentAgreements?.[prog] || "None";
                          const expiry = student.enrollmentExpiries?.[prog] || "";
                          
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
                            name: student.name,
                            membership: membershipVal,
                            expiration: expirationVal
                          });
                        });
                      }
                    });

                    // Pad to exactly 12 rows as shown in PDF
                    while (printRows.length < 12) {
                      printRows.push({
                        name: "",
                        membership: "",
                        expiration: ""
                      });
                    }

                    return printRows.map((row, i) => (
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
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {/* Notes Section matching PDF */}
            <div className="mt-8">
              <span className="text-sm font-black text-black uppercase tracking-wider block">Notes:</span>
              <div className="mt-3 space-y-6">
                <div className="border-b border-black w-full min-h-[1.5rem] pb-1 flex items-end">
                  {enrollmentPrintNotes && (
                    <span className="text-sm text-black tracking-wide font-medium font-sans pl-1">
                      {enrollmentPrintNotes}
                    </span>
                  )}
                </div>
                <div className="border-b border-black w-full h-8"></div>
                <div className="border-b border-black w-full h-8"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
