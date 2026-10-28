import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Student, Dojo } from '../types';
import { getLastDayOfMonthDate, calculateDefaultExpiryDate } from '../dateHelpers';
import { KARATE_RANKS, TOTS_RANKS, KOBUDO_RANKS, normalizeKobudoRankId } from '../constants';
import {
  X,
  Search,
  Keyboard,
  HelpCircle,
  CheckSquare,
  Clock,
  Calendar,
  BookOpen,
  UserCheck,
  AlertCircle,
  RotateCcw,
  Cake,
  Plus,
  Save,
  Users,
  User,
  MapPin,
  Award,
  FileText,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';

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

interface UpdateLog {
  id: string;
  studentId: string;
  studentName: string;
  mode: string;
  description: string;
  timestamp: string;
  status: 'reverted' | 'success';
  originalState: Student;
}

interface UpdateDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onUpdateStudent: (student: Student) => void;
  defaultMode?: 'attendance' | 'enrollment' | 'program' | 'schedule' | 'birthday';
  activeProgram: string;
  testingLock?: { date: string; month: string; studentIds: string[] } | null;
  customDojos?: Dojo[];
}

export function UpdateDetailsModal({
  isOpen,
  onClose,
  students,
  onUpdateStudent,
  defaultMode = 'attendance',
  activeProgram,
  testingLock,
  customDojos = [],
}: UpdateDetailsModalProps) {
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [logs, setLogs] = useState<UpdateLog[]>([]);
  const [isConfigured, setIsConfigured] = useState(false);

  // Testing lock state info
  const isStudentLocked = !!(selectedStudent && testingLock && testingLock.studentIds.includes(selectedStudent.id));

  // Dynamic Elements configuration checklist states
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>(() => {
    try {
      const savedStr = localStorage.getItem('update_panel_selected_fields');
      if (savedStr) {
        const savedFields = JSON.parse(savedStr);
        if (savedFields && typeof savedFields === 'object') {
          return {
            name: !!savedFields.name,
            location: !!savedFields.location,
            programs: !!savedFields.programs,
            rankings: !!savedFields.rankings,
            beltSize: !!savedFields.beltSize,
            attendance: !!savedFields.attendance,
            schedule: !!savedFields.schedule,
            birthday: !!savedFields.birthday,
            agreements: !!savedFields.agreements,
            family: !!savedFields.family,
            documents: !!savedFields.documents,
            notes: !!savedFields.notes,
            inactive: !!savedFields.inactive,
          };
        }
      }
    } catch (e) {
      console.error(e);
    }
    return {
      name: true,
      location: true,
      programs: true,
      rankings: false,
      beltSize: false,
      attendance: false,
      schedule: false,
      birthday: false,
      agreements: false,
      family: false,
      documents: false,
      notes: false,
      inactive: false,
    };
  });

  // Detailed student element states
  const [name, setName] = useState('');
  const [location, setLocation] = useState<string>('West Chester');
  const [inactive, setInactive] = useState(false);

  // Compute all available dojo locations
  const allLocations = useMemo(() => {
    const base = ['West Chester', 'Monroe', 'YMCA'];
    if (customDojos && customDojos.length > 0) {
      const extraNames = customDojos.map(d => d.name).filter(n => !base.includes(n));
      return [...base, ...extraNames];
    }
    return base;
  }, [customDojos]);
  const [enrolledPrograms, setEnrolledPrograms] = useState<('karate' | 'tots' | 'kobudo')[]>(['karate']);
  const [rankings, setRankings] = useState<{ [key: string]: string }>({});
  const [beltSize, setBeltSize] = useState('0');
  const [attendance, setAttendance] = useState<{ [key: string]: number }>({});
  const [scheduleDay1, setScheduleDay1] = useState('');
  const [scheduleTime1, setScheduleTime1] = useState('');
  const [scheduleDay2, setScheduleDay2] = useState('');
  const [scheduleTime2, setScheduleTime2] = useState('');
  const [kobudoWeapons, setKobudoWeapons] = useState<('Bo' | 'Sai')[]>([]);
  const [kobudoRankings, setKobudoRankings] = useState<{ bo?: string; sai?: string }>({});
  const [kobudoTestingWeapon, setKobudoTestingWeapon] = useState<'Bo' | 'Sai' | 'Both'>('Both');
  const [birthday, setBirthday] = useState('');
  const [enrollmentAgreements, setEnrollmentAgreements] = useState<{ [key: string]: string }>({});
  const [enrollmentExpiries, setEnrollmentExpiries] = useState<{ [key: string]: string }>({});
  const [familyIds, setFamilyIds] = useState<string[]>([]);
  const [familySearchQuery, setFamilySearchQuery] = useState('');
  const [creditCardOnFile, setCreditCardOnFile] = useState(false);
  const [attendanceCardCreated, setAttendanceCardCreated] = useState(false);
  const [photoReleaseSigned, setPhotoReleaseSigned] = useState(false);
  const [notes, setNotes] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const editFormRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const birthdayInputRef = useRef<HTMLInputElement>(null);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const attendanceInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Save selectedFields changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('update_panel_selected_fields', JSON.stringify(selectedFields));
    } catch (e) {
      console.error(e);
    }
  }, [selectedFields]);

  // Open & field resets
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedStudent(null);
      setLogs([]); // Reset session logs on brand new open
      setHighlightedIndex(0);

      // Setup default configuration check ONLY if we don't already have a saved selection in localStorage
      const savedStr = localStorage.getItem('update_panel_selected_fields');
      let fieldsConfigured = false;
      if (savedStr) {
        try {
          const savedFields = JSON.parse(savedStr);
          if (savedFields && typeof savedFields === 'object') {
            const hasAny = Object.values(savedFields).some(Boolean);
            if (hasAny) {
              setSelectedFields({
                name: !!savedFields.name,
                location: !!savedFields.location,
                programs: !!savedFields.programs,
                rankings: !!savedFields.rankings,
                beltSize: !!savedFields.beltSize,
                attendance: !!savedFields.attendance,
                schedule: !!savedFields.schedule,
                birthday: !!savedFields.birthday,
                agreements: !!savedFields.agreements,
                family: !!savedFields.family,
                documents: !!savedFields.documents,
                notes: !!savedFields.notes,
                inactive: !!savedFields.inactive,
              });
              fieldsConfigured = true;
            }
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (!fieldsConfigured) {
        const nextSelFields: Record<string, boolean> = {
          name: false,
          location: false,
          programs: false,
          attendance: false,
          schedule: false,
          birthday: false,
          agreements: false,
          family: false,
          documents: false,
          notes: false,
          inactive: false,
        };
        if (defaultMode === 'attendance') {
          nextSelFields['attendance'] = true;
        } else if (defaultMode === 'enrollment') {
          nextSelFields['agreements'] = true;
          nextSelFields['documents'] = true;
        } else if (defaultMode === 'program') {
          nextSelFields['programs'] = true;
        } else if (defaultMode === 'schedule') {
          nextSelFields['schedule'] = true;
        } else if (defaultMode === 'birthday') {
          nextSelFields['birthday'] = true;
        } else {
          nextSelFields['attendance'] = true;
        }
        setSelectedFields(nextSelFields);
      }

      // Automatically configure and focus search input
      setIsConfigured(true);
      focusSearch();
    }
  }, [isOpen, defaultMode]);

  // Autofocus search helpers
  const focusSearch = () => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 120);
  };

  useEffect(() => {
    if (isConfigured && !selectedStudent) {
      focusSearch();
    }
  }, [isConfigured, selectedStudent]);

  // Move cursor/typebar immediately to the next pertinent input
  const focusFirstPertinentField = () => {
    // 1. Attendance is the primary pertinent field when attendance tracking is active
    if (selectedFields['attendance']) {
      const activeProgs = selectedStudent?.programs || ['karate'];
      const firstProg = activeProgs[0] || 'karate';
      const input = attendanceInputRefs.current[firstProg] || Object.values(attendanceInputRefs.current)[0];
      if (input) {
        input.focus();
        input.select();
        return;
      }
    }

    // 2. Name
    if (selectedFields['name'] && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
      return;
    }

    // 3. Birthday
    if (selectedFields['birthday'] && birthdayInputRef.current) {
      birthdayInputRef.current.focus();
      return;
    }

    // 4. Notes
    if (selectedFields['notes'] && notesInputRef.current) {
      notesInputRef.current.focus();
      return;
    }

    // 5. Fallback: search for first input/select in the edit form
    if (editFormRef.current) {
      const firstInput = editFormRef.current.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      if (firstInput) {
        firstInput.focus();
        if ('select' in firstInput && typeof (firstInput as any).select === 'function') {
          (firstInput as any).select();
        }
      }
    }
  };

  // When a student is locked-on, move the cursor/typebar to exactly the next pertinent input
  useEffect(() => {
    if (selectedStudent) {
      const timer = setTimeout(() => {
        focusFirstPertinentField();
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [selectedStudent?.id]);

  // Sync state variables initially when a student is locked-on
  useEffect(() => {
    if (selectedStudent) {
      setName(selectedStudent.name || '');
      setLocation(selectedStudent.location || 'West Chester');
      setInactive(!!selectedStudent.inactive);
      setEnrolledPrograms([...(selectedStudent.programs || ['karate'])]);
      const rawRankings = { ...(selectedStudent.rankings || {}) };
      if (rawRankings.kobudo) {
        rawRankings.kobudo = normalizeKobudoRankId(rawRankings.kobudo);
      }
      setRankings(rawRankings);
      setBeltSize(selectedStudent.beltSize || '0');
      setAttendance({ ...(selectedStudent.attendance || {}) });
      setScheduleDay1(selectedStudent.scheduleDay1 || '');
      setScheduleTime1(selectedStudent.scheduleTime1 || '');
      setScheduleDay2(selectedStudent.scheduleDay2 || '');
      setScheduleTime2(selectedStudent.scheduleTime2 || '');
      setBirthday(selectedStudent.birthday || '');
      setKobudoWeapons(selectedStudent.kobudoWeapons || []);
      setKobudoTestingWeapon(selectedStudent.kobudoTestingWeapon || 'Both');
      const rawKobudoRankings = selectedStudent.kobudoRankings || {};
      setKobudoRankings({
        bo: normalizeKobudoRankId(rawKobudoRankings.bo),
        sai: normalizeKobudoRankId(rawKobudoRankings.sai),
      });
      setEnrollmentAgreements({ ...(selectedStudent.enrollmentAgreements || {}) });
      setEnrollmentExpiries({ ...(selectedStudent.enrollmentExpiries || {}) });
      setFamilyIds(selectedStudent.familyIds || []);
      setCreditCardOnFile(!!selectedStudent.creditCardOnFile);
      setAttendanceCardCreated(!!selectedStudent.attendanceCardCreated);
      setPhotoReleaseSigned(!!selectedStudent.photoReleaseSigned);
      setNotes(selectedStudent.notes || '');
    }
  }, [selectedStudent]);

  // Clear schedule if location is YMCA
  useEffect(() => {
    if (location === 'YMCA') {
      setScheduleDay1('');
      setScheduleTime1('');
      setScheduleDay2('');
      setScheduleTime2('');
    }
  }, [location]);

  // Auto-fill minutes checker (classes attended autofill helper)
  const handleAutoFillMins = () => {
    const nextAttendance = { ...attendance };
    enrolledPrograms.forEach(p => {
      nextAttendance[p] = (p === 'karate' && rankings[p] === 'white') ? 8 : 16;
    });
    setAttendance(nextAttendance);
    playChime(523.25, 0.08);
  };

  // Helper lists/configs
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // suggested standard schedule times
  const suggestedTimes = [
    '5:00 PM', '5:30 PM', '5:45 PM', '6:00 PM', '6:05 PM',
    '6:20 PM', '6:30 PM', '6:40 PM', '7:30 PM'
  ];

  // Search input and candidate logic
  const getMatchingStudents = (term: string) => {
    const query = term.trim().toLowerCase();
    if (!query) return [];
    return students.filter(s => s.name.toLowerCase().includes(query));
  };

  const matchingStudents = getMatchingStudents(searchTerm);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setHighlightedIndex(0);

    const matches = getMatchingStudents(value);
    if (matches.length === 1) {
      handleManualLockOn(matches[0]);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (matchingStudents.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % Math.min(matchingStudents.length, 5));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (matchingStudents.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + Math.min(matchingStudents.length, 5)) % Math.min(matchingStudents.length, 5));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matchingStudents.length > 0) {
        const target = matchingStudents[highlightedIndex] || matchingStudents[0];
        handleManualLockOn(target);
      }
    }
  };

  const handleManualLockOn = (student: Student) => {
    setSelectedStudent(student);
    setSearchTerm('');
    setHighlightedIndex(0);
    playChime(659.25, 0.08);
  };

  const handleAttendanceKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    prog: string,
    index: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // If there is another enrolled program attendance input, advance to it
      const nextProg = enrolledPrograms[index + 1];
      if (nextProg && attendanceInputRefs.current[nextProg]) {
        const nextInput = attendanceInputRefs.current[nextProg];
        nextInput?.focus();
        nextInput?.select();
        return;
      }

      // If notes is active, move to notes
      if (selectedFields['notes'] && notesInputRef.current) {
        notesInputRef.current.focus();
        return;
      }

      // Otherwise, save immediately!
      handleSaveAll();
    }
  };

  // Sound play helper
  const playChime = (freq: number, dur: number) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // safe bypass
    }
  };

  // Single dynamic updates feed undo
  const handleUndoLog = (log: UpdateLog) => {
    if (log.status === 'reverted') return;

    onUpdateStudent(log.originalState);

    setLogs(prev => prev.map(l => {
      if (l.id === log.id) {
        return {
          ...l,
          status: 'reverted',
          description: `Undone & Reverted details back to original profile state.`
        };
      }
      return l;
    }));

    playChime(329.63, 0.15);
  };

  // Unified save function that updates ANY elements selected in the options
  const handleSaveAll = () => {
    if (!selectedStudent) return;
    const originalState = { ...selectedStudent };

    // Construct saved student payloads
    const updated: Student = {
      ...selectedStudent,
    };

    // Apply Name if selected
    if (selectedFields['name']) {
      if (name.trim()) updated.name = name.trim();
    }
    // Apply Location if selected
    if (selectedFields['location']) {
      updated.location = location;
    }
    // Apply Inactive list status
    if (selectedFields['inactive']) {
      updated.inactive = inactive;
    }
    // Apply Programs & ranks
    if (selectedFields['programs']) {
      updated.programs = enrolledPrograms;
      updated.kobudoWeapons = enrolledPrograms.includes('kobudo') ? kobudoWeapons : [];
      if (enrolledPrograms.includes('kobudo')) {
        updated.kobudoTestingWeapon = kobudoTestingWeapon;
      } else {
        delete updated.kobudoTestingWeapon;
      }
    }
    if (selectedFields['rankings']) {
      // Ensure rankings exist for active programs
      const nextRankings: { [key: string]: string } = { ...(updated.rankings || {}) };
      enrolledPrograms.forEach(prog => {
        if (prog === 'kobudo') {
          const boRank = kobudoRankings?.bo;
          const saiRank = kobudoRankings?.sai;
          const chosen = boRank || saiRank || rankings['kobudo'] || 'k_white';
          nextRankings['kobudo'] = chosen === 'kobudo_white' || chosen === 'white' ? 'k_white' : chosen;
        } else if (!nextRankings[prog]) {
          const defaultRank = prog === 'karate' ? 'white' : (prog === 'tots' ? 't_white' : 'k_white');
          nextRankings[prog] = rankings[prog] || defaultRank;
        } else if (rankings[prog]) {
          nextRankings[prog] = rankings[prog];
        }
      });
      // Delete any non-active program rankings
      Object.keys(nextRankings).forEach(k => {
        if (!enrolledPrograms.includes(k as any)) {
          delete nextRankings[k];
        }
      });
      updated.rankings = nextRankings;
      updated.kobudoRankings = enrolledPrograms.includes('kobudo') ? kobudoRankings : {};
    }
    if (selectedFields['beltSize']) {
      updated.beltSize = beltSize;
    }
    // Apply Attendance
    if (selectedFields['attendance']) {
      const cleanAttendance: { [key: string]: number } = {};
      Object.entries(attendance).forEach(([k, v]) => {
        cleanAttendance[k] = Math.max(0, parseInt(String(v), 10) || 0);
      });
      updated.attendance = cleanAttendance;
      updated.lastAttendanceUpdate = new Date().toLocaleDateString('en-CA');
    }
    // Apply Schedule (conditional on not YMCA)
    if (selectedFields['schedule']) {
      if (location !== 'YMCA') {
        updated.scheduleDay1 = scheduleDay1 || undefined;
        updated.scheduleTime1 = scheduleTime1 || undefined;
        updated.scheduleDay2 = scheduleDay2 || undefined;
        updated.scheduleTime2 = scheduleTime2 || undefined;
      } else {
        delete updated.scheduleDay1;
        delete updated.scheduleTime1;
        delete updated.scheduleDay2;
        delete updated.scheduleTime2;
      }
    }
    // Apply Birthday
    if (selectedFields['birthday']) {
      if (birthday) updated.birthday = birthday;
      else delete updated.birthday;
    }
    // Apply Agreements
    if (selectedFields['agreements'] || selectedFields['programs']) {
      const finalAgreements = { ...enrollmentAgreements };
      const finalExpiries = { ...enrollmentExpiries };
      if (enrolledPrograms.includes('kobudo') || finalAgreements['kobudo']) {
        if (!finalAgreements['kobudo']) {
          finalAgreements['kobudo'] = '6 months';
        }
        if (!finalExpiries['kobudo'] && finalAgreements['kobudo'] !== 'Monthly' && finalAgreements['kobudo'] !== 'None') {
          finalExpiries['kobudo'] = calculateDefaultExpiryDate(finalAgreements['kobudo']);
        }
      }
      if (selectedFields['agreements']) {
        updated.enrollmentAgreements = finalAgreements;
        updated.enrollmentExpiries = finalExpiries;
      }
    }
    // Apply Family connections
    if (selectedFields['family']) {
      updated.familyIds = familyIds;
    }
    // Apply Status/Documents checkboxes
    if (selectedFields['documents']) {
      updated.creditCardOnFile = creditCardOnFile;
      updated.attendanceCardCreated = attendanceCardCreated;
      updated.photoReleaseSigned = photoReleaseSigned;
    }
    // Apply internal memo notes
    if (selectedFields['notes']) {
      updated.notes = notes.trim() || undefined;
    }

    onUpdateStudent(updated);

    // Save to Log
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logVal: UpdateLog = {
      id: Math.random().toString(),
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      mode: 'terminal_edit',
      description: `Terminal Update: Saved custom selected details. Click to Undo.`,
      timestamp: stamp,
      status: 'success',
      originalState
    };
    setLogs(prev => [logVal, ...prev]);

    // Go back to search
    setSelectedStudent(null);
    focusSearch();
    playChime(587.33, 0.15);
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const selectAllFields = () => {
    setSelectedFields({
      name: true,
      location: true,
      programs: true,
      rankings: true,
      beltSize: true,
      attendance: true,
      schedule: true,
      birthday: true,
      agreements: true,
      family: true,
      documents: true,
      notes: true,
      inactive: true,
    });
  };

  const clearAllFields = () => {
    setSelectedFields({
      name: false,
      location: false,
      programs: false,
      rankings: false,
      beltSize: false,
      attendance: false,
      schedule: false,
      birthday: false,
      agreements: false,
      family: false,
      documents: false,
      notes: false,
      inactive: false,
    });
  };

  // Class target schedule available times populating helpers
  const getAvailableTimes = (day: string) => {
    if (!day) return [];
    const times = new Set<string>();

    if (location === 'Monroe') {
      if (enrolledPrograms.includes('tots')) {
        if (day === 'Monday' || day === 'Wednesday') times.add('6:05 PM');
        else if (day === 'Tuesday' || day === 'Thursday') times.add('5:45 PM');
      }
      if (enrolledPrograms.includes('karate')) {
        if (day === 'Monday' || day === 'Wednesday') {
          times.add('5:00 PM');
          times.add('6:40 PM');
        } else if (day === 'Tuesday' || day === 'Thursday') {
          times.add('6:20 PM');
        }
      }
    } else {
      if (enrolledPrograms.includes('tots')) {
        if (day === 'Monday' || day === 'Wednesday') times.add('5:00 PM');
        else if (day === 'Tuesday' || day === 'Thursday') times.add('6:00 PM');
      }
      if (enrolledPrograms.includes('karate')) {
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
    return Array.from(times).sort();
  };

  const availableTimes1 = getAvailableTimes(scheduleDay1);
  const availableTimes2 = getAvailableTimes(scheduleDay2);

  // Auto set class times if only one is available for a given day
  const enrolledProgramsKey = enrolledPrograms.join(',');
  useEffect(() => {
    if (scheduleDay1) {
      const times = getAvailableTimes(scheduleDay1);
      if (times.length === 1) {
        setScheduleTime1(times[0]);
      } else if (scheduleTime1 && !times.includes(scheduleTime1)) {
        setScheduleTime1('');
      }
    }
  }, [scheduleDay1, enrolledProgramsKey, location]);

  useEffect(() => {
    if (scheduleDay2) {
      const times = getAvailableTimes(scheduleDay2);
      if (times.length === 1) {
        setScheduleTime2(times[0]);
      } else if (scheduleTime2 && !times.includes(scheduleTime2)) {
        setScheduleTime2('');
      }
    }
  }, [scheduleDay2, enrolledProgramsKey, location]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/95 select-none animate-in fade-in duration-200">

      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            if (selectedStudent) {
              setSelectedStudent(null);
              focusSearch();
            } else {
              onClose();
            }
          }
        }}
      >

        {/* Dynamic Header */}
        <div className="bg-black p-3 sm:p-4 border-b border-zinc-800 space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-red-500" />
              <div>
                <h3 className="text-xs sm:text-sm font-black text-zinc-100 uppercase tracking-widest leading-none">Update Details Terminal</h3>
                <p className="text-[9px] text-zinc-500 uppercase tracking-wide font-semibold mt-1">Multi-Category Student Administration</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer select-none"
            >
              Close
            </button>
          </div>
        </div>

        {/* Modal body contents */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {!isConfigured ? (
            <div
              className="space-y-4 animate-in fade-in duration-200"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const hasSelection = Object.values(selectedFields).some(Boolean);
                  if (hasSelection) {
                    setIsConfigured(true);
                    focusSearch();
                  }
                }
              }}
            >
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1">
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block font-mono">STEP 1 OF 2</span>
                <p className="text-[11px] font-black uppercase tracking-wider text-zinc-100">Select Elements to Edit</p>
                <p className="text-[9px] text-zinc-500 font-semibold uppercase leading-relaxed">
                  Choose which specific sections of student records you want to access or update in this batch session.
                </p>
              </div>

              {/* SELECT FIELDS CHECKBOX PANEL */}
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-[9.5px] font-black text-zinc-300 uppercase tracking-widest">
                    Select Exact Elements to Edit:
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllFields}
                      className="text-[8.5px] font-black text-red-500 hover:text-red-400 uppercase tracking-wider"
                    >
                      All
                    </button>
                    <span className="text-zinc-700 text-[8.5px]">|</span>
                    <button
                      type="button"
                      onClick={clearAllFields}
                      className="text-[8.5px] font-black text-zinc-500 hover:text-zinc-400 uppercase tracking-wider"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Grid of Checkboxes */}
                <div className="grid grid-cols-2 xs:grid-cols-3 gap-1.5 pt-1">
                  {[
                    { key: 'name', label: '👤 Name' },
                    { key: 'location', label: '📍 Location' },
                    { key: 'programs', label: '🥋 Programs List' },
                    { key: 'rankings', label: '⭐ Belt Ranks' },
                    { key: 'beltSize', label: '🥋 Belt Sizes' },
                    { key: 'attendance', label: '📝 Attendance' },
                    { key: 'schedule', label: '🗓 Schedule' },
                    { key: 'birthday', label: '🎂 Birthday' },
                    { key: 'agreements', label: '📄 Agreements' },
                    { key: 'family', label: '👥 Family Links' },
                    { key: 'documents', label: '📁 Documents CC' },
                    { key: 'notes', label: '📒 Remarks Notes' },
                    { key: 'inactive', label: '🚫 Inactive Status' },
                  ].map((field) => (
                    <button
                      key={field.key}
                      type="button"
                      onClick={() => toggleField(field.key)}
                      className={`p-1.5 text-left rounded-lg text-[9.5px] font-extrabold uppercase border transition flex items-center justify-between ${
                        selectedFields[field.key]
                          ? 'bg-red-950/20 border-red-900/60 text-red-400 font-bold'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                      }`}
                    >
                      <span>{field.label}</span>
                      <input
                        type="checkbox"
                        checked={!!selectedFields[field.key]}
                        onChange={() => {}} // Controlled by button
                        className="w-3 h-3 rounded bg-zinc-950 border-zinc-700 text-red-650 pointer-events-none"
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* CONFIRM BUTTON */}
              <button
                type="button"
                onClick={() => {
                  const hasSelection = Object.values(selectedFields).some(v => v);
                  if (!hasSelection) {
                    alert("Please select at least one element to edit.");
                    return;
                  }
                  setIsConfigured(true);
                  focusSearch();
                }}
                className="w-full py-3 bg-red-600 hover:bg-red-600 active:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition duration-155 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-red-950/20"
              >
                <span>Confirm Selection & Proceed <span className="font-mono text-[10px] opacity-80">(↵ Enter)</span></span>
                <span className="text-xs font-bold font-mono">→</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* ACTIVE FIELDS SET PREVIEW BADGES */}
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono font-black text-red-500 uppercase tracking-widest leading-none">STEP 2 OF 2</span>
                    <span className="text-[9px] font-black text-zinc-400 uppercase tracking-wider mt-0.5">Batch Category Editing Active</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfigured(false);
                      setSelectedStudent(null);
                    }}
                    className="text-[8.5px] font-black text-white bg-zinc-90 w-full bg-zinc-900 hover:text-red-400 uppercase tracking-widest border border-zinc-800 hover:border-red-900/60 transition px-2 py-1 rounded"
                  >
                    Modify Selection
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {Object.entries(selectedFields)
                    .filter(([_, active]) => active)
                    .map(([key]) => {
                      const labelMap: Record<string, string> = {
                        name: '👤 Name',
                        location: '📍 Location',
                        programs: '🥋 Programs List',
                        rankings: '⭐ Belt Ranks',
                        beltSize: '🥋 Belt Sizes',
                        attendance: '📝 Attendance',
                        schedule: '🗓 Schedule',
                        birthday: '🎂 Birthday',
                        agreements: '📄 Agreements',
                        family: '👥 Family Links',
                        documents: '📁 Documents CC',
                        notes: '📒 Remarks Notes',
                        inactive: '🚫 Inactive Status',
                      };
                      return (
                        <span key={key} className="text-[8.5px] bg-red-950/45 border border-red-900/40 text-red-400 font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wider">
                          {labelMap[key] || key}
                        </span>
                      );
                    })}
                </div>
              </div>

              {/* SEARCH FOR CANDIDATE STUDENT */}
              {!selectedStudent ? (
            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 flex flex-col select-none">
              <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                <Keyboard className="w-4 h-4 text-red-500" />
                <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">
                  Search & Lock-On Student to Update Details
                </span>
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Enter student's exact or partial name..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full bg-zinc-900 text-zinc-100 text-xs px-3 py-2 pl-9 pr-9 rounded-lg border border-zinc-800 focus:outline-none focus:border-red-700/80 transition font-black tracking-wide uppercase placeholder:text-zinc-500 placeholder:normal-case placeholder:font-normal focus:ring-1 focus:ring-red-600"
                />
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300 transition cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 flex items-center justify-center h-4 w-4"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Suggestions candidates matches feed */}
              {searchTerm.trim().length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden max-h-[180px] overflow-y-auto divide-y divide-zinc-800">
                  {matchingStudents.slice(0, 5).map((s, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleManualLockOn(s)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`p-2.5 flex items-center justify-between transition gap-2 cursor-pointer group ${
                          isHighlighted ? 'bg-zinc-800 border-l-2 border-red-500' : 'hover:bg-zinc-800/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className={`text-[11px] font-black transition truncate uppercase tracking-tight ${
                            isHighlighted ? 'text-red-400' : 'text-zinc-100 group-hover:text-red-400'
                          }`}>
                            {s.name}
                          </p>
                          <p className="text-[8.5px] font-mono text-zinc-500 mt-0.5 uppercase">
                            Location: {s.location || 'West Chester'}
                          </p>
                        </div>
                        <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider transition ${
                          isHighlighted
                            ? 'bg-red-600 text-white border-red-500'
                            : 'text-red-500 border-zinc-800 group-hover:border-red-900/30 bg-zinc-950'
                        }`}>
                          Lock On {isHighlighted && <span className="font-mono text-[8px] opacity-90">(↵)</span>}
                        </span>
                      </div>
                    );
                  })}
                  {matchingStudents.length === 0 && (
                    <p className="p-3.5 text-[10px] font-bold text-zinc-500 text-center uppercase tracking-wide">
                      No matched candidates found
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (

            /* EDIT PORTAL ACTIVE COMPONENT */
            <div ref={editFormRef} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">

              {/* SELECTED STUDENT BANNER HEADER */}
              <div className="p-3 bg-red-950/20 border border-red-900/30 rounded-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1 px-2 bg-red-600 rounded text-center text-white shrink-0 text-[10.5px] font-black">
                    LOCKED
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-zinc-100 truncate uppercase tracking-tight leading-none">{selectedStudent.name}</p>
                    <p className="text-[9px] text-zinc-500 mt-1 font-mono uppercase font-semibold leading-none">{selectedStudent.location} • Programs ({selectedStudent.programs.join(', ')})</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudent(null);
                    focusSearch();
                  }}
                  className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 text-[9px] border border-zinc-800 hover:border-zinc-700 text-zinc-400 transition font-black uppercase rounded tracking-wider shrink-0"
                >
                  Change Student
                </button>
              </div>

              {/* Informative Testing Lock Banner */}
              {isStudentLocked && (
                <div className="p-3 bg-red-950/45 border border-red-900/40 text-red-200 text-xs font-bold rounded-xl flex items-center gap-2 select-none">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <div>
                    <p className="font-black uppercase tracking-wide text-[10.5px]">Student Locked for Testing</p>
                    <p className="text-[9.5px] text-zinc-400 font-medium normal-case leading-tight mt-0.5">
                      This student is on the locked testing roster, but you can still edit and save all details safely.
                    </p>
                  </div>
                </div>
              )}

              {/* RENDER DYNAMIC ACTIVE ELEMENT INPUT FIELDS */}

              {/* 1. NAME */}
              {selectedFields['name'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                    <User className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Student Full Name</span>
                  </div>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (selectedFields['attendance']) {
                          const firstProg = enrolledPrograms[0] || 'karate';
                          attendanceInputRefs.current[firstProg]?.focus();
                          attendanceInputRefs.current[firstProg]?.select();
                        } else if (selectedFields['birthday']) {
                          birthdayInputRef.current?.focus();
                        } else if (selectedFields['notes']) {
                          notesInputRef.current?.focus();
                        } else {
                          handleSaveAll();
                        }
                      }
                    }}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-100 focus:border-red-650 rounded-lg text-xs outline-none focus:outline-none transition uppercase font-black focus:ring-1 focus:ring-red-600"
                  />
                </div>
              )}

              {/* 2. LOCATION */}
              {selectedFields['location'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                    <MapPin className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Location / Program</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allLocations.map((loc) => {
                      const isCustom = customDojos?.some(d => d.name === loc);
                      return (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => setLocation(loc)}
                          className={`py-2 px-3 rounded-lg font-bold text-[10px] tracking-wide transition border cursor-pointer flex items-center gap-1.5 ${
                            location === loc
                              ? 'bg-red-950/65 border-red-500 text-red-200 shadow-md'
                              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400'
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
              )}

              {/* 3. ACTIVE PROGRAMS LIST */}
              {selectedFields['programs'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                    <Award className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Enrolled Programs</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['karate', 'tots', 'kobudo'] as const).map((prog) => {
                      const active = enrolledPrograms.includes(prog);
                      return (
                        <button
                          key={prog}
                          type="button"
                          onClick={() => {
                            if (prog === 'tots') {
                              setEnrolledPrograms(['tots']);
                              setRankings({ tots: 't_white' });
                            } else {
                              let nextProg = enrolledPrograms.includes(prog)
                                ? enrolledPrograms.filter(p => p !== prog)
                                : [...enrolledPrograms.filter(p => p !== 'tots'), prog];

                              nextProg = nextProg.filter(p => p === 'karate' || p === 'kobudo');
                              if (nextProg.length === 0) nextProg = [prog];

                              setEnrolledPrograms(nextProg);
                              if (!rankings[prog]) {
                                setRankings(prev => ({ ...prev, [prog]: prog === 'karate' ? 'white' : 'k_white' }));
                              }
                            }
                          }}
                          className={`py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg border text-center transition ${
                            active
                              ? 'bg-red-600 border-red-600 text-white font-extrabold shadow-md shadow-red-950/25'
                              : 'bg-zinc-90 w-full bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                          }`}
                        >
                          {prog}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. BELT RANKINGS */}
              {selectedFields['rankings'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3.5 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                    <Award className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Belt Ranks</span>
                  </div>

                  {/* Render Rank selects for active programs */}
                  <div className="space-y-3">
                    {enrolledPrograms.map((prog) => {
                      if (prog === 'kobudo') {
                        return (
                          <div key={prog} className="space-y-3 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block border-b border-zinc-800 pb-1">
                              Kobudo Weapons
                            </span>
                            <div className="flex items-center gap-4 text-xs py-1">
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
                              <div className="flex items-center gap-3 p-1.5 bg-zinc-950 rounded border border-zinc-800">
                                <span className="text-[9px] font-black text-zinc-400 uppercase w-16 shrink-0">Bo Rank:</span>
                                <select
                                  value={kobudoRankings.bo || 'k_white'}
                                  onChange={(e) => setKobudoRankings(prev => ({ ...prev, bo: e.target.value }))}
                                  className="flex-1 bg-zinc-900 text-zinc-200 border border-zinc-800 rounded p-1 text-xs uppercase font-extrabold"
                                >
                                  {KOBUDO_RANKS.map(rank => (
                                    <option key={rank.id} value={rank.id}>
                                      {rank.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {kobudoWeapons.includes('Sai') && (
                              <div className="flex items-center gap-3 p-1.5 bg-zinc-950 rounded border border-zinc-800">
                                <span className="text-[9px] font-black text-zinc-400 uppercase w-16 shrink-0">Sai Rank:</span>
                                <select
                                  value={kobudoRankings.sai || 'k_white'}
                                  onChange={(e) => setKobudoRankings(prev => ({ ...prev, sai: e.target.value }))}
                                  className="flex-1 bg-zinc-900 text-zinc-200 border border-zinc-800 rounded p-1 text-xs uppercase font-extrabold"
                                >
                                  {KOBUDO_RANKS.map(rank => (
                                    <option key={rank.id} value={rank.id}>
                                      {rank.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {/* Testing Weapon Selection to determine test rank */}
                            <div className="flex items-center gap-3 p-1.5 bg-zinc-950 rounded border border-zinc-800">
                              <span className="text-[9px] font-black text-amber-400 uppercase w-24 shrink-0">Testing Weapon:</span>
                              <select
                                value={kobudoTestingWeapon || 'Both'}
                                onChange={(e) => setKobudoTestingWeapon(e.target.value as 'Bo' | 'Sai' | 'Both')}
                                className="flex-1 bg-zinc-900 text-zinc-200 border border-zinc-800 rounded p-1 text-xs uppercase font-extrabold"
                              >
                                <option value="Bo">Bo (Tests for next Bo rank)</option>
                                <option value="Sai">Sai (Tests for next Sai rank)</option>
                                <option value="Both">Both (Bo & Sai)</option>
                              </select>
                            </div>
                          </div>
                        );
                      }

                      const ranksList = prog === 'karate' ? KARATE_RANKS : TOTS_RANKS;
                      const currentRank = rankings[prog] || ranksList[0].id;

                      return (
                        <div key={prog} className="flex items-center gap-3 p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                          <span className="text-[10px] font-black text-zinc-400 uppercase w-16 shrink-0 truncate">
                            {prog === 'karate' ? 'Karate' : 'Tots'}:
                          </span>

                          <select
                            value={currentRank}
                            onChange={(e) => setRankings(prev => ({ ...prev, [prog]: e.target.value }))}
                            className="flex-1 bg-zinc-950 text-zinc-200 border border-zinc-800 focus:border-red-600 rounded p-1.5 text-xs focus:outline-none uppercase font-extrabold"
                          >
                            {ranksList.map(rank => (
                              <option key={rank.id} value={rank.id}>
                                {rank.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4.5. BELT SIZES */}
              {selectedFields['beltSize'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3.5 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                    <Award className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Belt Size</span>
                  </div>

                  {/* Belt Size */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Belt Size</label>
                    <select
                      value={beltSize}
                      onChange={(e) => setBeltSize(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 text-zinc-200 border border-zinc-800 focus:border-red-600 rounded text-xs focus:outline-none"
                    >
                      {['0', '1', '2', '3', '4', '5', '6', '7'].map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 5. ATTENDANCE TRACKER */}
              {selectedFields['attendance'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Attendance Counts</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoFillMins}
                      className="text-[9px] font-extrabold text-red-500 hover:text-red-400 bg-zinc-900 px-2 py-0.5 border border-zinc-800 rounded uppercase tracking-wide flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-2.5 h-2.5" /> Auto-Meet
                    </button>
                  </div>

                  <div className="space-y-3.5">
                    {enrolledPrograms.map((prog, index) => (
                      <div key={prog} className="space-y-1.5">
                        <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest flex justify-between">
                          <span>Classes Attended ({prog})</span>
                          <span className="text-[8.5px] text-zinc-500 font-mono">
                            Currently: {attendance[prog] !== undefined ? attendance[prog] : 0} • <span className="text-red-400 font-bold">↵ Enter to Save</span>
                          </span>
                        </label>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const curr = Math.max(0, parseInt(String(attendance[prog]), 10) || 0);
                              setAttendance(prev => ({ ...prev, [prog]: Math.max(0, curr - 1) }));
                            }}
                            className="px-3.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded font-black text-sm cursor-pointer"
                          >
                            -1
                          </button>
                          <input
                            ref={(el) => {
                              attendanceInputRefs.current[prog] = el;
                            }}
                            type="number"
                            min="0"
                            value={attendance[prog] !== undefined ? attendance[prog] : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
                              setAttendance((prev) => ({ ...prev, [prog]: val as any }));
                            }}
                            onKeyDown={(e) => handleAttendanceKeyDown(e, prog, index)}
                            className="flex-1 bg-zinc-950 text-center text-zinc-100 font-extrabold text-xs px-3 py-1.5 border border-zinc-800 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/40 rounded transition"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const curr = Math.max(0, parseInt(String(attendance[prog]), 10) || 0);
                              setAttendance(prev => ({ ...prev, [prog]: curr + 1 }));
                            }}
                            className="px-3.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded font-black text-sm cursor-pointer"
                          >
                            +1
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. CLASS SCHEDULE */}
              {selectedFields['schedule'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                    <Calendar className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Class Schedule (Days & Times)</span>
                  </div>

                  {location === 'YMCA' ? (
                    <p className="text-[10px] text-zinc-500 italic uppercase">Schedule is disabled for YMCA students</p>
                  ) : enrolledPrograms.length === 1 && enrolledPrograms[0] === 'kobudo' ? (
                    <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg text-xs text-zinc-400 flex flex-col gap-0.5 select-none">
                      <span className="font-extrabold text-amber-500 uppercase flex items-center gap-1 text-[10px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        Saturday 9:00 AM Class (Kobudo)
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Class 1 */}
                      <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 space-y-2">
                        <span className="block text-[8.5px] font-black text-zinc-500 uppercase tracking-widest">Class 1</span>
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
                          className="w-full bg-zinc-950 text-zinc-200 border border-zinc-800 focus:border-red-600 rounded p-1.5 text-xs focus:outline-none"
                        >
                          <option value="">No Day Selected</option>
                          {daysOfWeek.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <select
                          value={scheduleTime1}
                          onChange={(e) => setScheduleTime1(e.target.value)}
                          disabled={!scheduleDay1 || availableTimes1.length === 0}
                          className="w-full bg-zinc-950 text-zinc-200 border border-zinc-800 focus:border-red-650 rounded p-1.5 text-xs focus:outline-none disabled:opacity-30"
                        >
                          <option value="">No Time Selected</option>
                          {availableTimes1.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      {/* Class 2 */}
                      <div className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 space-y-2">
                        <span className="block text-[8.5px] font-black text-zinc-500 uppercase tracking-widest">Class 2</span>
                        <select
                          value={scheduleDay2}
                          onChange={(e) => setScheduleDay2(e.target.value)}
                          className="w-full bg-zinc-950 text-zinc-200 border border-zinc-800 focus:border-red-600 rounded p-1.5 text-xs focus:outline-none"
                        >
                          <option value="">No Day Selected</option>
                          {daysOfWeek.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <select
                          value={scheduleTime2}
                          onChange={(e) => setScheduleTime2(e.target.value)}
                          disabled={!scheduleDay2 || availableTimes2.length === 0}
                          className="w-full bg-zinc-950 text-zinc-200 border border-zinc-800 focus:border-red-650 rounded p-1.5 text-xs focus:outline-none disabled:opacity-30"
                        >
                          <option value="">No Time Selected</option>
                          {availableTimes2.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 7. BIRTHDAY */}
              {selectedFields['birthday'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                    <Cake className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Student Birthday</span>
                  </div>
                  <input
                    ref={birthdayInputRef}
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (selectedFields['attendance']) {
                          const firstProg = enrolledPrograms[0] || 'karate';
                          attendanceInputRefs.current[firstProg]?.focus();
                          attendanceInputRefs.current[firstProg]?.select();
                        } else if (selectedFields['notes']) {
                          notesInputRef.current?.focus();
                        } else {
                          handleSaveAll();
                        }
                      }
                    }}
                    className="w-full bg-zinc-900 text-zinc-250 border border-zinc-800 focus:border-red-600 rounded p-2 text-xs focus:outline-none focus:ring-1 focus:ring-red-600"
                  />
                </div>
              )}

              {/* 8. ENROLLMENT AGREEMENTS MULTIPLE */}
              {selectedFields['agreements'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-855 pb-1.5">
                    <FileText className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Multiple Agreements & Expiries</span>
                  </div>

                  {(() => {
                    const extraAgg_1a = { key: 'competition_team', name: 'Competition Team', options: ['Monthly'] };
                    const extraAgg_1b = { key: 'tiny_tigers', name: 'Tiny Tigers', options: ['Monthly'] };
                    const extraAgg_2 = { key: 'fitness', name: 'Fitness', options: ['Monthly'] };
                    const extraAgg_3 = { key: 'kojin', name: 'Kojin', options: ['Monthly', '6 months', '12 months'] };

                    const allAgreementFields = [
                      ...enrolledPrograms.map(prog => {
                        let opts: string[] = [];
                        if (prog === 'tots') opts = ['Introductory', 'Monthly'];
                        else if (prog === 'karate') opts = ['Introductory', 'Monthly', '6 months', '12 months'];
                        else if (prog === 'kobudo') opts = ['Introductory', '6 months', '12 months'];
                        const displayName = prog === 'kobudo' ? 'Kobudo' : prog === 'karate' ? 'Karate' : prog === 'tots' ? 'Tots' : prog;
                        return { key: prog, name: displayName, options: opts };
                      }),
                      ...(!enrolledPrograms.includes('kobudo') ? [{ key: 'kobudo', name: 'Kobudo', options: ['Introductory', '6 months', '12 months'] }] : []),
                      extraAgg_1a,
                      extraAgg_1b,
                      extraAgg_2,
                      extraAgg_3
                    ];

                    const visibleKeys = new Set([...enrolledPrograms, ...Object.keys(enrollmentAgreements).filter(k => enrollmentAgreements[k])]);
                    const visibleFields = allAgreementFields.filter(f => visibleKeys.has(f.key));
                    const addableFields = allAgreementFields.filter(f => !visibleKeys.has(f.key));

                    return (
                      <div className="space-y-3.5">
                        {visibleFields.map(({ key: prog, name: progName, options }) => {
                          const selectedAgreement = enrollmentAgreements[prog] || '';
                          const hasExpiry = selectedAgreement && selectedAgreement !== 'Monthly';

                          return (
                            <div key={prog} className="space-y-2 p-2.5 bg-zinc-900 rounded-xl border border-zinc-800">
                              <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider capitalize">
                                  {progName} Agreement Type
                                </label>
                                {!enrolledPrograms.includes(prog as any) && (
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
                                    className="text-[9px] text-zinc-500 hover:text-red-400 font-extrabold uppercase"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>

                              <select
                                value={selectedAgreement}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEnrollmentAgreements(prev => ({ ...prev, [prog]: val }));
                                  if (val && val !== 'Monthly' && val !== 'None') {
                                    setEnrollmentExpiries(prev => ({
                                      ...prev,
                                      [prog]: prev[prog] || calculateDefaultExpiryDate(val)
                                    }));
                                  }
                                }}
                                className="w-full bg-zinc-950 text-zinc-200 border border-zinc-800 focus:border-red-600 rounded p-1.5 text-xs focus:outline-none"
                              >
                                <option value="">No Contract Configured</option>
                                {options.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>

                              {hasExpiry && (
                                <div className="space-y-1.5 block animate-in fade-in duration-200 pt-1">
                                  {selectedAgreement === 'Introductory' ? (
                                    <>
                                      <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                                        {progName} Expiry Date (Specific Date)
                                      </label>
                                      <input
                                        type="date"
                                        value={enrollmentExpiries[prog] || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setEnrollmentExpiries(prev => ({ ...prev, [prog]: val }));
                                        }}
                                        className="w-full bg-zinc-950 text-zinc-100 border border-zinc-800 focus:border-red-500/60 rounded p-1.5 text-xs focus:outline-none transition font-sans animate-in fade-in duration-200"
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                                        {progName} Expiry Date (Month & Year)
                                      </label>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <select
                                            value={getParsedMonthYear(enrollmentExpiries[prog]).month}
                                            onChange={(e) => {
                                              const m = e.target.value;
                                              const y = getParsedMonthYear(enrollmentExpiries[prog]).year;
                                              setEnrollmentExpiries(prev => ({ ...prev, [prog]: getLastDayOfMonthDate(`${y}-${m}`) }));
                                            }}
                                            className="w-full bg-zinc-950 text-zinc-100 border border-zinc-800 focus:border-red-500/60 rounded p-1.5 text-xs focus:outline-none transition font-sans"
                                          >
                                            {monthsList.map(m => (
                                              <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <select
                                            value={getParsedMonthYear(enrollmentExpiries[prog]).year}
                                            onChange={(e) => {
                                              const y = e.target.value;
                                              const m = getParsedMonthYear(enrollmentExpiries[prog]).month;
                                              setEnrollmentExpiries(prev => ({ ...prev, [prog]: getLastDayOfMonthDate(`${y}-${m}`) }));
                                            }}
                                            className="w-full bg-zinc-950 text-zinc-100 border border-zinc-800 focus:border-red-500/60 rounded p-1.5 text-xs focus:outline-none transition font-sans"
                                          >
                                            {yearsList.map(y => (
                                              <option key={y} value={y}>{y}</option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                  {enrollmentExpiries[prog] && (
                                    <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1 font-sans">
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                      Expires: <span className="font-black text-red-400">{enrollmentExpiries[prog]}</span>
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {addableFields.length > 0 && (
                          <div className="pt-1">
                            <select
                              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-lg text-xs outline-none focus:border-red-500/50 font-bold uppercase tracking-wider cursor-pointer"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  const f = addableFields.find(x => x.key === e.target.value);
                                  setEnrollmentAgreements(prev => ({ ...prev, [e.target.value]: f?.options[0] || 'Monthly' }));
                                }
                              }}
                            >
                              <option value="">+ Add Additional Agreement / Contract...</option>
                              {addableFields.map(f => (
                                <option key={f.key} value={f.key}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 9. FAMILY CONNECTIONS LINKED */}
              {selectedFields['family'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                    <Users className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Linked Family Members</span>
                  </div>

                  {/* currently linked members */}
                  <div className="space-y-1.5">
                    {familyIds.length === 0 ? (
                      <p className="text-[9.5px] text-zinc-500 italic uppercase">No family members linked</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {familyIds.map(fId => {
                          const sibling = students.find(s => s.id === fId);
                          if (!sibling) return null;
                          return (
                            <div key={fId} className="flex items-center justify-between p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                              <span className="text-[10.5px] font-bold text-zinc-300">{sibling.name}</span>
                              <button
                                type="button"
                                onClick={() => setFamilyIds(prev => prev.filter(x => x !== fId))}
                                className="p-0.5 text-zinc-500 hover:text-red-400 font-bold text-xs"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Sibling live search container */}
                  <div className="pt-1 space-y-1.5">
                    <label className="block text-[8.5px] font-black text-zinc-500 uppercase tracking-widest">Link New Sibling/Parent Family Connection</label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Type student name to search..."
                        value={familySearchQuery}
                        onChange={(e) => setFamilySearchQuery(e.target.value)}
                        className="w-full bg-zinc-950 pl-8 pr-8 py-1.5 border border-zinc-800 focus:border-red-650 rounded-lg text-zinc-200 text-xs focus:outline-none transition font-sans"
                      />
                      {familySearchQuery && (
                        <button
                          type="button"
                          onClick={() => setFamilySearchQuery("")}
                          className="absolute right-2.5 top-1.5 text-zinc-500 hover:text-zinc-330 transition cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 flex items-center justify-center h-4 w-4"
                          title="Clear search"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>

                    {familySearchQuery.trim() && (() => {
                      const query = familySearchQuery.toLowerCase();
                      const filtered = students.filter(s =>
                        s.id !== selectedStudent.id &&
                        !familyIds.includes(s.id) &&
                        s.name.toLowerCase().includes(query)
                      ).slice(0, 5);

                      if (filtered.length === 0) {
                        return <p className="text-[9.5px] text-zinc-500 italic px-1 pt-1">No other students match "{familySearchQuery}"</p>;
                      }

                      return (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden mt-1 divide-y divide-zinc-800">
                          {filtered.map(s => (
                            <button
                              type="button"
                              key={s.id}
                              onClick={() => {
                                setFamilyIds(prev => [...prev, s.id]);
                                setFamilySearchQuery('');
                              }}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center justify-between cursor-pointer select-none"
                            >
                              <span className="font-extrabold uppercase">{s.name}</span>
                              <span className="text-[8.5px] text-zinc-500 uppercase">{s.location}</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* 10. DOCUMENTS/STATUS CHECKBOXES */}
              {selectedFields['documents'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-855 pb-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Required Documents & Status Checks</span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        id="terminal_cc"
                        type="checkbox"
                        checked={creditCardOnFile}
                        onChange={(e) => setCreditCardOnFile(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-red-650 focus:ring-red-600"
                      />
                      <label htmlFor="terminal_cc" className="text-[9.5px] font-extrabold uppercase text-zinc-300 tracking-wider cursor-pointer">
                        Credit Card On File (Verified)
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="terminal_card"
                        type="checkbox"
                        checked={attendanceCardCreated}
                        onChange={(e) => setAttendanceCardCreated(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-red-650 focus:ring-red-600"
                      />
                      <label htmlFor="terminal_card" className="text-[9.5px] font-extrabold uppercase text-zinc-300 tracking-wider cursor-pointer">
                        Attendance Physical Roster Card Created
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="terminal_photo"
                        type="checkbox"
                        checked={photoReleaseSigned}
                        onChange={(e) => setPhotoReleaseSigned(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-red-650 focus:ring-red-600"
                      />
                      <label htmlFor="terminal_photo" className="text-[9.5px] font-extrabold uppercase text-zinc-300 tracking-wider cursor-pointer">
                        Photo/Video Media Consent Form Signed
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 11. REMARKS/MEMOS/INTERNAL NOTES */}
              {selectedFields['notes'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-855 pb-1.5">
                    <FileText className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Internal memo & Notes remarks</span>
                  </div>
                  <textarea
                    ref={notesInputRef}
                    placeholder="Remarks, sparring notes, medical checks, belt sizes info..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveAll();
                      }
                    }}
                    rows={2}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 focus:border-red-500/60 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none text-xs font-semibold focus:ring-1 focus:ring-red-600"
                  />
                </div>
              )}

              {/* 12. INACTIVE STATUS LIST */}
              {selectedFields['inactive'] && (
                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 border-b border-zinc-855 pb-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Inactive Status Toggle</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <span className="text-[9.5px] font-black text-zinc-300 uppercase">Set Student as Inactive Profile:</span>
                    <button
                      type="button"
                      onClick={() => setInactive(!inactive)}
                      className={`px-3 py-1.5 text-[9.5px] font-extrabold uppercase rounded-lg border tracking-wide transition ${
                        inactive
                          ? 'bg-amber-950/45 border-amber-800 text-amber-500'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      {inactive ? '🚫 Inactive' : '🟢 Active student'}
                    </button>
                  </div>
                </div>
              )}

              {/* SAVE ACTION BUTTON */}
              <div className="pt-2 border-t border-zinc-900">
                <button
                  ref={saveButtonRef}
                  type="button"
                  onClick={handleSaveAll}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-[10.5px] tracking-widest rounded-xl transition border border-red-700 shadow-md shadow-red-950/25 flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Selected Custom Details <span className="font-mono text-[9px] opacity-90">(↵ Enter)</span></span>
                </button>
              </div>

            </div>
          )}

          {/* ACTIVE CHANGE LOG FEED AT BASE */}
          <div className="flex flex-col pt-2 border-t border-zinc-800 min-h-[140px] select-none">
            <span className="text-[8.5px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
              Updates Feed (This Session • Click item to Revert changes)
            </span>

            <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-2.5 space-y-1.5 max-h-[160px] overflow-y-auto">
              {logs.map(log => (
                <div
                  key={log.id}
                  onClick={() => handleUndoLog(log)}
                  title="Click to revert this detail update"
                  className={`p-2 rounded-lg border text-xs flex justify-between items-center gap-4 cursor-pointer hover:bg-zinc-900 transition ${
                    log.status === 'success'
                      ? 'bg-zinc-90 w-full border-zinc-900 hover:border-red-900/35 text-zinc-300'
                      : 'bg-zinc-950 border-zinc-950/40 text-zinc-600 line-through cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start gap-1.5 min-w-0">
                    <span className="text-[10px] font-mono mt-0.5 shrink-0 block">
                      {log.status === 'reverted' ? '↩️' : '📝'}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-[10.5px] font-black tracking-tight uppercase truncate leading-none ${log.status === 'reverted' ? 'text-zinc-500' : 'text-zinc-200'}`}>
                        {log.studentName}
                      </p>
                      <p className="text-[9.5px] text-zinc-450 mt-1 font-semibold leading-relaxed">
                        {log.status === 'reverted' ? log.description : `[UPDATE] ${log.description}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {log.status === 'success' && (
                      <RotateCcw className="w-3.5 h-3.5 text-red-500 hover:text-red-400" />
                    )}
                    <span className="text-[8.5px] font-mono font-bold text-zinc-600">{log.timestamp}</span>
                  </div>
                </div>
              ))}

              {logs.length === 0 && (
                <div className="flex flex-col items-center justify-center p-6 text-zinc-700 text-center select-none font-mono">
                  <HelpCircle className="w-6 h-6 text-zinc-800 mb-1" />
                  <p className="text-[10.5px] font-bold text-zinc-500">Log terminal idle</p>
                  <p className="text-[8.5px] text-zinc-500 mt-0.5">Committed details modifications can be instantly reverted here.</p>
                </div>
              )}
            </div>
          </div>

            </div>
          )}

        </div>

        {/* Modal footer credits bar */}
        <div className="bg-black/95 px-4 py-2 border-t border-zinc-800 text-[8.5px] font-semibold text-zinc-500 flex justify-between items-center select-none font-mono">
          <span>Single lock-on smart detail updating</span>
          <span>BMA PORTAL</span>
        </div>

      </div>

    </div>
  );
}
