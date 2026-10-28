import React, { useState, useEffect, useMemo } from 'react';
import { Student, BeltRank, UserRole, Dojo } from '../types';
import { KARATE_RANKS, TOTS_RANKS, KOBUDO_RANKS } from '../constants';
import { X, Plus, Save, RotateCcw, User, Users, Search, MapPin, Award, Calendar, TrendingUp, FileText, ShieldCheck, Layers, AlertCircle, Sparkles } from 'lucide-react';
import { getLastDayOfMonthDate, calculateDefaultExpiryDate } from '../dateHelpers';

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


interface StudentFormProps {
  student?: Student | null; // If null, we are ADDING. If provided, we are EDITING.
  onSave: (student: Student) => void;
  onClose: () => void;
  userRole?: UserRole;
  initialTab?: 'general' | 'enrollment';
  testingLock?: { date: string; month: string; studentIds: string[] } | null;
  students?: Student[];
  customDojos?: Dojo[];
  initialLocation?: string;
  initialProgram?: string;
}

export function StudentForm({
  student,
  onSave,
  onClose,
  userRole,
  initialTab,
  testingLock,
  students = [],
  customDojos = [],
  initialLocation,
  initialProgram
}: StudentFormProps) {
  const isStudentLocked = !!(student && testingLock && testingLock.studentIds.includes(student.id));
  const [name, setName] = useState('');
  const initialProgKey: ('karate' | 'tots' | 'kobudo') = (initialProgram as any) || 'karate';
  const [programs, setPrograms] = useState<('karate' | 'tots' | 'kobudo')[]>([initialProgKey]);
  const [rankings, setRankings] = useState<{ [key: string]: string }>({ [initialProgKey]: initialProgKey === 'tots' ? 't_white' : initialProgKey === 'kobudo' ? 'k_white' : 'white' });
  const [attendance, setAttendance] = useState<{ [key: string]: number }>({ [initialProgKey]: 0 });
  const [notes, setNotes] = useState('');
  const [beltSize, setBeltSize] = useState('0');
  const [manualOverrides, setManualOverrides] = useState<{ [key: string]: 'eligible' | 'ineligible' | null }>({});
  const [location, setLocation] = useState<string>(initialLocation || 'West Chester');
  const [customFields, setCustomFields] = useState<{ [key: string]: any }>({});
  const [scheduleDay1, setScheduleDay1] = useState('');
  const [scheduleTime1, setScheduleTime1] = useState('');
  const [scheduleDay2, setScheduleDay2] = useState('');
  const [scheduleTime2, setScheduleTime2] = useState('');
  const [kobudoWeapons, setKobudoWeapons] = useState<('Bo' | 'Sai')[]>([]);
  const [kobudoRankings, setKobudoRankings] = useState<{ bo?: string; sai?: string }>({});
  const [kobudoTestingWeapon, setKobudoTestingWeapon] = useState<'Bo' | 'Sai' | 'Both'>('Both');

  const [enrollmentAgreements, setEnrollmentAgreements] = useState<{ [key: string]: string }>({});
  const [enrollmentExpiries, setEnrollmentExpiries] = useState<{ [key: string]: string }>({});
  const [creditCardOnFile, setCreditCardOnFile] = useState(false);
  const [attendanceCardCreated, setAttendanceCardCreated] = useState(false);
  const [photoReleaseSigned, setPhotoReleaseSigned] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [lastAttendanceUpdate, setLastAttendanceUpdate] = useState('');
  const [birthday, setBirthday] = useState('');
  const [familyIds, setFamilyIds] = useState<string[]>([]);
  const [familySearchQuery, setFamilySearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'general' | 'enrollment'>(initialTab || 'general');

  // Compute all available dojo locations
  const allLocations = useMemo(() => {
    const base = ['West Chester', 'Monroe', 'YMCA'];
    if (customDojos && customDojos.length > 0) {
      const extraNames = customDojos.map(d => d.name).filter(n => !base.includes(n));
      return [...base, ...extraNames];
    }
    return base;
  }, [customDojos]);

  // Find active dojo configuration for the currently selected location
  const activeDojoConfig = useMemo(() => {
    if (!customDojos || customDojos.length === 0) return null;
    return customDojos.find(d => d.name === location) || null;
  }, [customDojos, location]);

  // Dynamic field helper: determines if standard profile field is enabled for current dojo
  const isFieldEnabled = (fieldId: string) => {
    if (!activeDojoConfig) return true;
    const field = activeDojoConfig.customProfileFields?.find(f => f.id === fieldId);
    return field ? field.enabled : true;
  };

  // Custom user-defined attributes configured specifically for this dojo
  const extraCustomFields = useMemo(() => {
    if (!activeDojoConfig?.customProfileFields) return [];
    return activeDojoConfig.customProfileFields.filter(f => f.isCustom && f.enabled);
  }, [activeDojoConfig]);

  // Sync initialTab when modal gets opened or values change
  useEffect(() => {
    setActiveTab(initialTab || 'general');
  }, [initialTab, student]);

  // Clear schedule if location changes to YMCA
  useEffect(() => {
    if (location === 'YMCA') {
      setScheduleDay1('');
      setScheduleTime1('');
      setScheduleDay2('');
      setScheduleTime2('');
    }
  }, [location]);

  // Load student values if editing
  useEffect(() => {
    if (student) {
      setName(student.name);
      setPrograms(student.programs);
      setRankings(student.rankings);
      setAttendance(student.attendance || { [student.programs[0]]: 0 });
      setLocation(student.location || 'West Chester');
      setCustomFields(student.customFields || {});
      setNotes(student.notes || '');
      setBeltSize(student.beltSize || '0');
      setManualOverrides(student.manualOverrides || {});
      setScheduleDay1(student.scheduleDay1 || '');
      setScheduleTime1(student.scheduleTime1 || '');
      setScheduleDay2(student.scheduleDay2 || '');
      setScheduleTime2(student.scheduleTime2 || '');
      setEnrollmentAgreements(student.enrollmentAgreements || {});
      setEnrollmentExpiries(student.enrollmentExpiries || {});
      setCreditCardOnFile(!!student.creditCardOnFile);
      setAttendanceCardCreated(!!student.attendanceCardCreated);
      setPhotoReleaseSigned(!!student.photoReleaseSigned);
      setInactive(!!student.inactive);
      setLastAttendanceUpdate(student.lastAttendanceUpdate || '');
      setBirthday(student.birthday || '');
      setFamilyIds(student.familyIds || []);
      setKobudoWeapons(student.kobudoWeapons || []);
      setKobudoTestingWeapon(student.kobudoTestingWeapon || 'Both');
      setKobudoRankings(student.kobudoRankings || {});
    } else {
      // Set defaults for new student
      setName('');
      const defaultProg: ('karate' | 'tots' | 'kobudo') = (initialProgram as any) || 'karate';
      setPrograms([defaultProg]);
      const defaultRank = defaultProg === 'tots' ? 't_white' : defaultProg === 'kobudo' ? 'k_white' : 'white';
      setRankings({ [defaultProg]: defaultRank });
      setAttendance({ [defaultProg]: 0 });
      setLocation(initialLocation || 'West Chester');
      setCustomFields({});
      setNotes('');
      setBeltSize('0');
      setManualOverrides({});
      setScheduleDay1('');
      setScheduleTime1('');
      setScheduleDay2('');
      setScheduleTime2('');
      setEnrollmentAgreements({});
      setEnrollmentExpiries({});
      setCreditCardOnFile(false);
      setAttendanceCardCreated(false);
      setPhotoReleaseSigned(false);
      setInactive(false);
      setLastAttendanceUpdate(new Date().toLocaleDateString('en-CA'));
      setBirthday('');
      setFamilyIds([]);
      setKobudoWeapons([]);
      setKobudoRankings({});
    }
    setFamilySearchQuery('');
  }, [student, initialLocation, initialProgram]);

  // Removed obsolete useEffect


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const studentId = student?.id || name.trim();
    
    const hasAttendanceChanged = !student || programs.some(p => (student.attendance?.[p] ?? 0) !== (attendance[p] ?? 0));

    const finalAgreements = { ...enrollmentAgreements };
    const finalExpiries = { ...enrollmentExpiries };

    if (programs.includes('kobudo') || finalAgreements['kobudo']) {
      if (!finalAgreements['kobudo']) {
        finalAgreements['kobudo'] = '6 months';
      }
      if (!finalExpiries['kobudo'] && finalAgreements['kobudo'] !== 'Monthly' && finalAgreements['kobudo'] !== 'None') {
        finalExpiries['kobudo'] = calculateDefaultExpiryDate(finalAgreements['kobudo']);
      }
    }

    const finalRankings = { ...rankings };
    if (programs.includes('kobudo')) {
      const boRank = kobudoRankings?.bo;
      const saiRank = kobudoRankings?.sai;
      const chosen = boRank || saiRank || finalRankings['kobudo'] || 'k_white';
      finalRankings['kobudo'] = chosen === 'kobudo_white' || chosen === 'white' ? 'k_white' : chosen;
    }

    const savedStudent: Student = {
      id: studentId,
      name: name.trim(),
      programs,
      rankings: finalRankings,
      attendance,
      location,
      beltSize: beltSize,
      cardFormCollected: student?.cardFormCollected || false,
      stickerPlaced: student?.stickerPlaced || false,
      testingFeePaid: student?.testingFeePaid || false,
      testingFeePaidByProgram: student?.testingFeePaidByProgram || {},
      manualOverrides,
      enrollmentAgreements: finalAgreements,
      enrollmentExpiries: finalExpiries,
      creditCardOnFile,
      attendanceCardCreated,
      photoReleaseSigned,
      inactive: hasAttendanceChanged ? false : inactive,
      lastAttendanceUpdate: hasAttendanceChanged ? new Date().toLocaleDateString('en-CA') : lastAttendanceUpdate,
      familyIds,
      kobudoWeapons,
      kobudoRankings,
      kobudoTestingWeapon: programs.includes('kobudo') ? kobudoTestingWeapon : undefined,
    };

    if (birthday) savedStudent.birthday = birthday;
    if (notes.trim()) savedStudent.notes = notes.trim();
    if (scheduleDay1) savedStudent.scheduleDay1 = scheduleDay1;
    if (scheduleTime1) savedStudent.scheduleTime1 = scheduleTime1;
    if (scheduleDay2) savedStudent.scheduleDay2 = scheduleDay2;
    if (scheduleTime2) savedStudent.scheduleTime2 = scheduleTime2;
    if (customFields && Object.keys(customFields).length > 0) {
      savedStudent.customFields = customFields;
    }

    onSave(savedStudent);
  };

  // Set default hours helper based on rank rules
  const handleAutoFillMins = () => {
    const nextAttendance = { ...attendance };
    programs.forEach(p => {
      nextAttendance[p] = (p === 'karate' && rankings[p] === 'white') ? 8 : 16;
    });
    setAttendance(nextAttendance);
  };

  // Helper to determine available times based on day and programs
  const getAvailableTimes = (day: string) => {
    if (!day) return [];
    const times = new Set<string>();

    if (location === 'Monroe') {
      if (programs.includes('tots')) {
        if (day === 'Monday' || day === 'Wednesday') {
          times.add('6:05 PM');
        } else if (day === 'Tuesday' || day === 'Thursday') {
          times.add('5:45 PM');
        }
      }
      if (programs.includes('karate')) {
        if (day === 'Monday' || day === 'Wednesday') {
          times.add('5:00 PM');
          times.add('6:40 PM');
        } else if (day === 'Tuesday' || day === 'Thursday') {
          times.add('6:20 PM');
        }
      }
    } else {
      // West Chester logic
      if (programs.includes('tots')) {
        if (day === 'Monday' || day === 'Wednesday') {
          times.add('5:00 PM');
        } else if (day === 'Tuesday' || day === 'Thursday') {
          times.add('6:00 PM');
        }
      }
      if (programs.includes('karate')) {
        if (day === 'Monday' || day === 'Wednesday') {
          times.add('5:30 PM');
          times.add('6:30 PM');
          times.add('7:30 PM');
        } else if (day === 'Tuesday' || day === 'Thursday') {
          times.add('5:00 PM');
          times.add('6:30 PM');
        }
      }
    }
    // Convert to array and sort conceptually (5:00 passes string sort, but 6:xx works too)
    return Array.from(times).sort();
  };

  const availableTimes1 = getAvailableTimes(scheduleDay1);
  const availableTimes2 = getAvailableTimes(scheduleDay2);

  // Auto set class times if only one is available for a given day
  const programsKey = programs.join(',');
  useEffect(() => {
    if (scheduleDay1) {
      const times = getAvailableTimes(scheduleDay1);
      if (times.length === 1) {
        setScheduleTime1(times[0]);
      }
    }
  }, [scheduleDay1, programsKey, location]);

  useEffect(() => {
    if (scheduleDay2) {
      const times = getAvailableTimes(scheduleDay2);
      if (times.length === 1) {
        setScheduleTime2(times[0]);
      }
    }
  }, [scheduleDay2, programsKey, location]);

  // Clear time if it's no longer valid for the newly selected day
  useEffect(() => {
    if (scheduleDay1 && scheduleTime1 && !availableTimes1.includes(scheduleTime1)) {
      setScheduleTime1('');
    }
  }, [scheduleDay1, programs, scheduleTime1]); // availableTimes1 changes dynamically

  useEffect(() => {
    if (scheduleDay2 && scheduleTime2 && !availableTimes2.includes(scheduleTime2)) {
      setScheduleTime2('');
    }
  }, [scheduleDay2, programs, scheduleTime2]);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950 flex-shrink-0">
          <h2 className="text-xl font-bold text-red-500 uppercase tracking-wide flex items-center gap-2">
            <span>{student ? 'Edit Student Details' : 'Add New Student'}</span>
          </h2>
          <button 
            onClick={onClose}
            className="p-1 px-2.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-zinc-800 bg-zinc-950 px-6 flex-shrink-0 select-none">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'general'
                ? 'border-red-600 text-red-500'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('enrollment')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              activeTab === 'enrollment'
                ? 'border-red-650 text-red-500'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Enrollment
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 font-sans">
          {isStudentLocked && (
            <div className="p-3 bg-red-950/40 border border-red-900/40 text-red-100 text-xs font-bold rounded-xl flex items-center gap-2 select-none mb-4">
              <AlertCircle className="w-5.5 h-5.5 text-red-500 shrink-0" />
              <div>
                <p className="font-black uppercase tracking-wide text-[10.5px]">Student Locked for Testing</p>
                <p className="text-[9.5px] text-zinc-400 font-medium normal-case leading-tight mt-0.5">
                  This student is on the locked testing list, but you can still edit and save all of their details safely.
                </p>
              </div>
            </div>
          )}
          
          {activeTab === 'general' && (
            <div className="space-y-6">
              
              {/* Section 1: Name & Location */}
              <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
                  <User className="w-4 h-4 text-red-500" />
                  <h3 className="text-xs font-black uppercase text-zinc-300 tracking-wider">Identity & Location</h3>
                </div>
                
                {/* Student Name */}
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                    <span>Student Full Name</span>
                    <span className="text-[9px] text-red-500/80 font-black tracking-widest uppercase bg-red-955/20 px-1.5 py-0.5 rounded border border-red-900/30">Required</span>
                  </label>
                  <input 
                    type="text" 
                    required
                    placeholder="Enter student's full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-red-600 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none transition font-sans text-sm"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed font-sans">
                    Student name is the only required field. All other details are optional and can be managed later.
                  </p>
                </div>

                {/* Dojo / Program Location */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Location / Program</label>
                    {activeDojoConfig && (
                      <span className="text-[9.5px] font-mono font-bold text-amber-400 uppercase bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Custom Program Profile Active
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allLocations.map((loc) => {
                      const isCustom = customDojos?.some(d => d.name === loc);
                      return (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => setLocation(loc)}
                          className={`py-2 px-3.5 rounded-lg font-bold text-xs tracking-wide transition border flex items-center gap-1.5 cursor-pointer ${
                            location === loc 
                            ? 'bg-red-950/70 border-red-500 text-red-200 shadow-md shadow-red-900/20' 
                            : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span>{loc}</span>
                          {isCustom && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Custom Program" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

          {/* Section 2: Program Enrollment & Ranks */}
          {isFieldEnabled('programs') && (
          <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
              <Award className="w-4 h-4 text-red-500" />
              <h3 className="text-xs font-black uppercase text-zinc-300 tracking-wider">Programs & Rankings</h3>
            </div>

            {/* Program Toggle */}
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Enrolled Programs</label>
              <div className="flex flex-wrap gap-2">
                {(['karate', 'tots', 'kobudo'] as const).map((prog) => (
                  <button
                    key={prog}
                    type="button"
                    onClick={() => {
                      if (prog === 'tots') {
                        setPrograms(['tots']);
                        setRankings({ tots: 't_white' });
                      } else {
                        let nextPrograms = programs.includes(prog) 
                          ? programs.filter(p => p !== prog) 
                          : [...programs.filter(p => p !== 'tots'), prog];
                        
                        nextPrograms = nextPrograms.filter(p => p === 'karate' || p === 'kobudo');
                        if (nextPrograms.length === 0) nextPrograms = [prog];
                        
                        setPrograms(nextPrograms);
                        if (!rankings[prog]) {
                          setRankings(prev => ({ ...prev, [prog]: prog === 'karate' ? 'white' : 'k_white' }));
                        }
                      }
                    }}
                    className={`py-2 px-4 rounded-lg font-bold text-xs transition text-center border uppercase tracking-wider ${
                      programs.includes(prog)
                      ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-900/20' 
                      : 'bg-zinc-955 border-zinc-800 hover:border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {prog}
                  </button>
                ))}
              </div>
            </div>

            {/* Current Belt Ranks mappings */}
            {programs.map(prog => {
              if (prog === 'kobudo') {
                return (
                  <div key={prog} className="space-y-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                    <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
                      <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">Kobudo Weapons</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-zinc-300 font-bold">
                        <input
                          type="checkbox"
                          checked={kobudoWeapons.includes('Bo')}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const nextWeapons = (checked
                              ? [...kobudoWeapons, 'Bo']
                              : kobudoWeapons.filter(w => w !== 'Bo')) as ('Bo' | 'Sai')[];
                            setKobudoWeapons(nextWeapons);
                            if (checked && !kobudoRankings.bo) {
                              setKobudoRankings(prev => ({ ...prev, bo: 'k_white' }));
                            }
                          }}
                          className="w-4 h-4 rounded bg-zinc-950 border-zinc-800 text-red-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Bo</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-zinc-300 font-bold">
                        <input
                          type="checkbox"
                          checked={kobudoWeapons.includes('Sai')}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const nextWeapons = (checked
                              ? [...kobudoWeapons, 'Sai']
                              : kobudoWeapons.filter(w => w !== 'Sai')) as ('Bo' | 'Sai')[];
                            setKobudoWeapons(nextWeapons);
                            if (checked && !kobudoRankings.sai) {
                              setKobudoRankings(prev => ({ ...prev, sai: 'k_white' }));
                            }
                          }}
                          className="w-4 h-4 rounded bg-zinc-950 border-zinc-800 text-red-600 focus:ring-0 cursor-pointer"
                        />
                        <span>Sai</span>
                      </label>
                    </div>

                    {kobudoWeapons.includes('Bo') && (
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Bo Belt Rank</label>
                        <select
                          value={kobudoRankings.bo || 'k_white'}
                          onChange={(e) => setKobudoRankings(prev => ({ ...prev, bo: e.target.value }))}
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
                        >
                          {KOBUDO_RANKS.map((rank) => (
                            <option key={rank.id} value={rank.id} className="bg-zinc-900 text-zinc-100">
                              {rank.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {kobudoWeapons.includes('Sai') && (
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Sai Belt Rank</label>
                        <select
                          value={kobudoRankings.sai || 'k_white'}
                          onChange={(e) => setKobudoRankings(prev => ({ ...prev, sai: e.target.value }))}
                          className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
                        >
                          {KOBUDO_RANKS.map((rank) => (
                            <option key={rank.id} value={rank.id} className="bg-zinc-900 text-zinc-100">
                              {rank.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={prog} className="space-y-1">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Current Belt Rank ({prog})</label>
                  <select
                    value={rankings[prog] || ''}
                    onChange={(e) => setRankings(prev => ({ ...prev, [prog]: e.target.value }))}
                    className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
                  >
                    {(prog === 'karate' ? KARATE_RANKS : TOTS_RANKS).map((rank) => (
                      <option key={rank.id} value={rank.id} className="bg-zinc-900 text-zinc-100">
                        {rank.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          )}

          {/* Belt Size */}
          {isFieldEnabled('beltSize') && (
            <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-2">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Belt Size</label>
              <select
                value={beltSize}
                onChange={(e) => setBeltSize(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
              >
                <option value="0" className="bg-zinc-900 text-zinc-100">0</option>
                <option value="1" className="bg-zinc-900 text-zinc-100">1</option>
                <option value="2" className="bg-zinc-900 text-zinc-100">2</option>
                <option value="3" className="bg-zinc-900 text-zinc-100">3</option>
                <option value="4" className="bg-zinc-900 text-zinc-100">4</option>
                <option value="5" className="bg-zinc-900 text-zinc-100">5</option>
                <option value="6" className="bg-zinc-900 text-zinc-100">6</option>
                <option value="7" className="bg-zinc-900 text-zinc-100">7</option>
              </select>
            </div>
          )}

          {/* Section 3: Class target schedule */}
          {isFieldEnabled('schedule') && location !== 'YMCA' && (
            <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
                <Calendar className="w-4 h-4 text-red-500" />
                <h3 className="text-xs font-black uppercase text-zinc-300 tracking-wider font-sans">Class Schedule</h3>
              </div>
              
              <div>
                {programs.length === 1 && programs[0] === 'kobudo' ? (
                  <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-xs text-zinc-400 flex flex-col gap-1 items-start select-none">
                    <span className="font-extrabold text-amber-500 uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      Saturday 9:00 AM Class
                    </span>
                    <span>Kobudo has only one standard class time. This is set automatically on the roster.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block">Class 1</span>
                      <select
                        value={scheduleDay1}
                        onChange={(e) => {
                          const val = e.target.value;
                          setScheduleDay1(val);
                          if (val === 'Monday') {
                            setScheduleDay2('Wednesday');
                          } else if (val === 'Tuesday') {
                            setScheduleDay2('Thursday');
                          } else if (val === 'Wednesday') {
                            setScheduleDay2('Monday');
                          } else if (val === 'Thursday') {
                            setScheduleDay2('Tuesday');
                          }
                        }}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500 rounded text-xs text-zinc-100 focus:outline-none transition"
                      >
                        <option value="">Select Day</option>
                        <option value="Monday">Monday</option>
                        <option value="Tuesday">Tuesday</option>
                        <option value="Wednesday">Wednesday</option>
                        <option value="Thursday">Thursday</option>
                      </select>
                      <select
                        value={scheduleTime1}
                        onChange={(e) => setScheduleTime1(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-855 focus:border-red-500 rounded text-xs text-zinc-100 focus:outline-none transition"
                        disabled={!scheduleDay1 || availableTimes1.length === 0}
                      >
                        <option value="">Select Time</option>
                        {availableTimes1.map((time) => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block">Class 2</span>
                      <select
                        value={scheduleDay2}
                        onChange={(e) => setScheduleDay2(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500 rounded text-xs text-zinc-100 focus:outline-none transition"
                      >
                        <option value="">Select Day</option>
                        <option value="Monday">Monday</option>
                        <option value="Tuesday">Tuesday</option>
                        <option value="Wednesday">Wednesday</option>
                        <option value="Thursday">Thursday</option>
                      </select>
                      <select
                        value={scheduleTime2}
                        onChange={(e) => setScheduleTime2(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-855 focus:border-red-500 rounded text-xs text-zinc-100 focus:outline-none transition"
                        disabled={!scheduleDay2 || availableTimes2.length === 0}
                      >
                        <option value="">Select Time</option>
                        {availableTimes2.map((time) => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
  
          {/* Section 4: Training progress tracker */}
          {isFieldEnabled('attendance') && (
            <div className="bg-zinc-950/40 border border-zinc-855 p-4 rounded-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800/50">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-red-500" />
                  <h3 className="text-xs font-black uppercase text-zinc-300 tracking-wider">Attendance Tracker</h3>
                </div>
                <button
                  type="button"
                  onClick={handleAutoFillMins}
                  className="text-[10px] font-bold text-zinc-400 hover:text-red-400 flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-lg transition"
                  title="Autofill requirements for quick testing"
                >
                  <Plus className="w-3 h-3" /> Auto-Meet Roster Requirements
                </button>
              </div>

              <div className="space-y-4">
                {programs.map(prog => (
                  <div key={prog} className="space-y-1">
                    <label className="block text-[10px] font-bold text-zinc-400 tracking-wide uppercase flex justify-between">
                      <span>Classes Attended ({prog})</span>
                      <span className="text-[10px] text-zinc-500 font-mono">Req: {(prog === 'karate' && rankings[prog] === 'white') ? 8 : 16} classes</span>
                    </label>
                    <input 
                      type="number" 
                      min="0"
                      value={attendance[prog] || 0}
                      onChange={(e) => setAttendance(prev => ({ 
                        ...prev, 
                        [prog]: Math.max(0, parseInt(e.target.value) || 0) 
                      }))}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 5: Notes & memos */}
          {isFieldEnabled('notes') && (
            <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-3">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Internal memo & Notes</label>
              <textarea
                placeholder="Instructor remarks, special instructions, physical constraints, sparring notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none transition font-sans text-xs"
              />
            </div>
          )}

          {/* Section 5b: Custom Dojo Attributes */}
          {extraCustomFields.length > 0 && (
            <div className="bg-zinc-950/40 border border-amber-900/40 p-4 rounded-2xl space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-amber-900/30">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-black uppercase text-amber-300 tracking-wider font-sans">
                    {location} Specific Attributes
                  </h3>
                </div>
                <span className="text-[9.5px] font-mono font-bold text-amber-400 uppercase bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                  {extraCustomFields.length} Custom Field(s)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {extraCustomFields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex justify-between items-center">
                      <span>{field.label}</span>
                      {field.required ? (
                        <span className="text-[9px] text-red-400 font-mono font-bold">Required</span>
                      ) : (
                        <span className="text-[9px] text-zinc-600 font-mono">Optional</span>
                      )}
                    </label>

                    {field.type === 'select' ? (
                      <select
                        value={customFields[field.id] || ''}
                        onChange={(e) => setCustomFields(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded text-xs text-zinc-100 focus:outline-none transition"
                      >
                        <option value="">Select option...</option>
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt} className="bg-zinc-900 text-zinc-100">{opt}</option>
                        ))}
                      </select>
                    ) : field.type === 'boolean' ? (
                      <label className="flex items-center gap-2.5 p-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-700 transition">
                        <input
                          type="checkbox"
                          checked={!!customFields[field.id]}
                          onChange={(e) => setCustomFields(prev => ({ ...prev, [field.id]: e.target.checked }))}
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="text-xs text-zinc-300 font-semibold">{field.label}</span>
                      </label>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        value={customFields[field.id] ?? ''}
                        onChange={(e) => setCustomFields(prev => ({ ...prev, [field.id]: e.target.value }))}
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none transition"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
            </div>
          )}

          {activeTab === 'enrollment' && (
            <div className="space-y-6">
              
              {/* Birthday */}
              {isFieldEnabled('birthday') && (
                <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
                    <User className="w-4 h-4 text-red-500" />
                    <h3 className="text-xs font-black uppercase text-zinc-300 tracking-wider">Student Birthday</h3>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Birthday Date</label>
                    <input
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-600 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none transition font-sans text-sm"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed font-sans">
                      Used perfectly for monthly happy birthday announcements.
                    </p>
                  </div>
                </div>
              )}

              {/* Section 6: Enrollment Agreements */}
              {isFieldEnabled('enrollmentAgreements') && (
              <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
                  <FileText className="w-4 h-4 text-red-500" />
                  <h3 className="text-xs font-black uppercase text-zinc-300 tracking-wider">Enrollment Agreements</h3>
                </div>
                
                {(() => {
                  const extraAgg_1a = { key: 'competition_team', name: 'Competition Team', options: ['Monthly'] };
                  const extraAgg_1b = { key: 'tiny_tigers', name: 'Tiny Tigers', options: ['Monthly'] };
                  const extraAgg_2 = { key: 'fitness', name: 'Fitness', options: ['Monthly'] };
                  const extraAgg_3 = { key: 'kojin', name: 'Kojin', options: ['Monthly', '6 months', '12 months'] };
                  
                  const allAgreementFields = [
                    ...programs.map(prog => {
                      let opts: string[] = [];
                      if (prog === 'tots') opts = ['Introductory', 'Monthly'];
                      else if (prog === 'karate') opts = ['Introductory', 'Monthly', '6 months', '12 months'];
                      else if (prog === 'kobudo') opts = ['Introductory', '6 months', '12 months'];
                      const displayName = prog === 'kobudo' ? 'Kobudo' : prog === 'karate' ? 'Karate' : prog === 'tots' ? 'Tots' : prog;
                      return { key: prog, name: displayName, options: opts };
                    }),
                    ...(!programs.includes('kobudo') ? [{ key: 'kobudo', name: 'Kobudo', options: ['Introductory', '6 months', '12 months'] }] : []),
                    extraAgg_1a,
                    extraAgg_1b,
                    extraAgg_2,
                    extraAgg_3
                  ];

                  const visibleKeys = new Set([...programs, ...Object.keys(enrollmentAgreements).filter(k => enrollmentAgreements[k])]);

                  const visibleFields = allAgreementFields.filter(f => visibleKeys.has(f.key));
                  const addableFields = allAgreementFields.filter(f => !visibleKeys.has(f.key));

                  return (
                    <div className="space-y-4">
                      {visibleFields.map(({ key: prog, name: progName, options }) => {
                        const selectedAgreement = enrollmentAgreements[prog] || '';
                        const hasExpiry = selectedAgreement && selectedAgreement !== 'Monthly';

                        return (
                          <div key={prog} className="space-y-1.5 p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50 transition">
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[10px] font-bold text-zinc-400 capitalize">
                                {progName} Agreement Type
                              </label>
                              {!programs.includes(prog as any) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEnrollmentAgreements(prev => {
                                      const next = { ...prev };
                                      delete next[prog];
                                      return next;
                                    });
                                    setEnrollmentExpiries(prev => {
                                      const next = { ...prev };
                                      delete next[prog];
                                      return next;
                                    });
                                  }}
                                  className="text-[10px] text-zinc-500 hover:text-red-400 font-bold uppercase tracking-wide"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <select
                              value={selectedAgreement}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEnrollmentAgreements(prev => {
                                  const newAgreements = { ...prev, [prog]: val };
                                  if (val) {
                                    if (prog === 'competition_team') {
                                      newAgreements['tiny_tigers'] = '';
                                    } else if (prog === 'tiny_tigers') {
                                      newAgreements['competition_team'] = '';
                                    }
                                  }
                                  return newAgreements;
                                });
                                if (val && val !== 'Monthly' && val !== 'None') {
                                  setEnrollmentExpiries(prev => ({
                                    ...prev,
                                    [prog]: prev[prog] || calculateDefaultExpiryDate(val)
                                  }));
                                }
                              }}
                              className="w-full px-4 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
                            >
                              <option value="">No Agreement Specified</option>
                              {options.map((opt) => (
                                <option key={opt} value={opt} className="bg-zinc-900 text-zinc-100">
                                  {opt}
                                </option>
                              ))}
                            </select>

                            {hasExpiry && (
                              <div className="mt-2 space-y-1.5 block animate-in fade-in duration-200">
                                {selectedAgreement === 'Introductory' ? (
                                  <>
                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      {progName} Expiry (Specific Date)
                                    </label>
                                    <input
                                      type="date"
                                      value={enrollmentExpiries[prog] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEnrollmentExpiries(prev => ({ ...prev, [prog]: val }));
                                      }}
                                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
                                    />
                                  </>
                                ) : (
                                  <>
                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                      {progName} Expiry (Month & Year)
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="block text-[8px] font-black text-zinc-500 uppercase tracking-wider mb-0.5">Month</label>
                                        <select
                                          value={getParsedMonthYear(enrollmentExpiries[prog]).month}
                                          onChange={(e) => {
                                            const m = e.target.value;
                                            const y = getParsedMonthYear(enrollmentExpiries[prog]).year;
                                            setEnrollmentExpiries(prev => ({ ...prev, [prog]: getLastDayOfMonthDate(`${y}-${m}`) }));
                                          }}
                                          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
                                        >
                                          {monthsList.map(m => (
                                            <option key={m.value} value={m.value} className="bg-zinc-900 text-zinc-100 font-sans">
                                              {m.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-[8px] font-black text-zinc-500 uppercase tracking-wider mb-0.5">Year</label>
                                        <select
                                          value={getParsedMonthYear(enrollmentExpiries[prog]).year}
                                          onChange={(e) => {
                                            const y = e.target.value;
                                            const m = getParsedMonthYear(enrollmentExpiries[prog]).month;
                                            setEnrollmentExpiries(prev => ({ ...prev, [prog]: getLastDayOfMonthDate(`${y}-${m}`) }));
                                          }}
                                          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 focus:outline-none transition font-sans text-xs"
                                        >
                                          {yearsList.map(y => (
                                            <option key={y} value={y} className="bg-zinc-900 text-zinc-100 font-sans">
                                              {y}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  </>
                                )}
                                {enrollmentExpiries[prog] && (
                                  <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1 font-sans">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                    Expires on: <span className="font-extrabold">{enrollmentExpiries[prog]}</span>
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {addableFields.length > 0 && (
                        <div className="pt-2">
                           <select
                             className="w-full px-4 py-2.5 bg-zinc-900/50 border border-zinc-800 text-zinc-400 rounded-lg text-xs outline-none focus:border-red-500/50 font-bold uppercase tracking-wider cursor-pointer"
                             value=""
                             onChange={(e) => {
                               if (e.target.value) {
                                 const f = addableFields.find(x => x.key === e.target.value);
                                 setEnrollmentAgreements(prev => ({ ...prev, [e.target.value]: f?.options[0] || 'Monthly' }));
                               }
                             }}
                           >
                             <option value="">+ Add Additional Agreement...</option>
                             {addableFields.map(f => (
                               <option key={f.key} value={f.key}>{f.name}</option>
                             ))}
                           </select>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {programs.length === 0 && (
                  <p className="text-xs text-zinc-500 italic">Please select at least one program in the General tab to assign agreements.</p>
                )}
              </div>
              )}

              {/* Section 6b: Family Connections */}
              {isFieldEnabled('familyIds') && (
              <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
                  <Users className="w-4 h-4 text-red-500" />
                  <h3 className="text-xs font-black uppercase text-zinc-300 tracking-wider">Family Members (Linked Students)</h3>
                </div>

                {/* Show currently linked family members */}
                <div className="space-y-2">
                  {familyIds.length === 0 ? (
                    <p className="text-[10px] text-zinc-500 italic">No family members linked yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {familyIds.map(fId => {
                        const sibling = students.find(s => s.id === fId);
                        if (!sibling) return null;
                        return (
                          <div key={fId} className="flex items-center justify-between p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl">
                            <span className="text-xs font-semibold text-zinc-200">{sibling.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setFamilyIds(prev => prev.filter(id => id !== fId));
                              }}
                              className="p-1 text-zinc-500 hover:text-red-400 font-bold text-xs select-none cursor-pointer transition"
                              title="Unlink family member"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Search bar to add a new family member */}
                <div className="space-y-1.5 pt-2">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    Link Sibling / Family Member
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search other student name..."
                      value={familySearchQuery}
                      onChange={(e) => setFamilySearchQuery(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 bg-zinc-950 border border-zinc-800 focus:border-red-650 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none transition font-sans text-xs"
                    />
                    {familySearchQuery && (
                      <button
                        type="button"
                        onClick={() => setFamilySearchQuery("")}
                        className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-300 transition cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 flex items-center justify-center h-4 w-4"
                        title="Clear search"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>

                  {familySearchQuery.trim() && (() => {
                    const query = familySearchQuery.toLowerCase();
                    const filtered = students.filter(s => 
                      s.id !== student?.id && 
                      !familyIds.includes(s.id) &&
                      s.name.toLowerCase().includes(query)
                    ).slice(0, 5);

                    if (filtered.length === 0) {
                      return <p className="text-[10px] text-zinc-500 italic px-1 pt-1">No other students found matching "{familySearchQuery}"</p>;
                    }

                    return (
                      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden mt-1 divide-y divide-zinc-900">
                        {filtered.map(s => (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() => {
                              setFamilyIds(prev => [...prev, s.id]);
                              setFamilySearchQuery('');
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition flex items-center justify-between cursor-pointer select-none"
                          >
                            <span>{s.name}</span>
                            <span className="text-[9px] text-zinc-500 uppercase font-black">{s.location}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              )}

              {/* Section 7: Required Documents & Status */}
              <div className="bg-zinc-950/40 border border-zinc-800 p-4 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/50">
                  <ShieldCheck className="w-4 h-4 text-red-500" />
                  <h3 className="text-xs font-black uppercase text-zinc-300 tracking-wider">Required Documents & Status</h3>
                </div>
                
                {/* Credit Card checkbox */}
                {isFieldEnabled('creditCardOnFile') && (
                <label className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition select-none">
                  <input
                    type="checkbox"
                    checked={creditCardOnFile}
                    onChange={(e) => setCreditCardOnFile(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-red-650 focus:ring-red-500 focus:ring-offset-zinc-900"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-zinc-200">Credit Card on File</span>
                    <span className="text-[10px] text-zinc-500">Billing details collected for auto-tuition</span>
                  </div>
                </label>
                )}

                {/* Attendance Card - ONLY for karate enrollees */}
                {isFieldEnabled('attendanceCardCreated') && programs.includes('karate') && (
                  <label className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition select-none">
                    <input
                      type="checkbox"
                      checked={attendanceCardCreated}
                      onChange={(e) => setAttendanceCardCreated(e.target.checked)}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-red-650 focus:ring-red-500 focus:ring-offset-zinc-900"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-zinc-200">Attendance Card</span>
                      <span className="text-[10px] text-zinc-500">Physical attendance card created</span>
                    </div>
                  </label>
                )}

                {/* Photo Release checkbox */}
                {isFieldEnabled('photoReleaseSigned') && (
                <label className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition select-none">
                  <input
                    type="checkbox"
                    checked={photoReleaseSigned}
                    onChange={(e) => setPhotoReleaseSigned(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-red-650 focus:ring-red-500 focus:ring-offset-zinc-900"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-zinc-200">Photo Release</span>
                    <span className="text-[10px] text-zinc-500">Permission to use training photos/videos</span>
                  </div>
                </label>
                )}

                {/* Inactive Student checkbox */}
                <label className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition select-none">
                  <input
                    type="checkbox"
                    checked={inactive}
                    onChange={(e) => setInactive(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-red-650 focus:ring-red-500 focus:ring-offset-zinc-900"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-red-400">Mark as Inactive</span>
                    <span className="text-[10px] text-zinc-500">Student is currently inactive or paused</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-zinc-800 bg-zinc-900/50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-semibold text-sm transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg bg-red-660 hover:bg-red-500 text-white font-bold text-sm tracking-wide transition shadow-lg shadow-red-900/30 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{student ? 'Save Changes' : 'Add Student'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
