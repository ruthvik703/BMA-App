export interface Student {
  id: string;
  name: string;
  programs: ('karate' | 'tots' | 'kobudo')[];
  rankings: { [key: string]: string }; // program -> currentRankId
  attendance: { [key: string]: number }; // program -> classes attended
  location: 'West Chester' | 'Monroe' | 'YMCA' | string;
  notes?: string;
  beltSize?: string;
  cardFormCollected?: boolean;
  stickerPlaced?: boolean;
  testingFeePaid?: boolean;
  testingFeePaidByProgram?: { [key: string]: boolean };
  manualOverride?: 'eligible' | 'ineligible' | null;
  manualOverrides?: { [key: string]: 'eligible' | 'ineligible' | null }; // program -> override
  scheduleDay1?: string;
  scheduleTime1?: string;
  scheduleDay2?: string;
  scheduleTime2?: string;
  enrollmentAgreements?: { [key: string]: string };
  enrollmentExpiries?: { [key: string]: string };
  discontinueAfterExpiry?: { [key: string]: boolean };
  creditCardOnFile?: boolean;
  attendanceCardCreated?: boolean;
  photoReleaseSigned?: boolean;
  barcode?: string;
  barcodePrinted?: boolean;
  barcodePrintedCount?: number;
  passedStickerPending?: boolean;
  lastIncrementDateByProgram?: { [key: string]: string };
  inactive?: boolean;
  lastAttendanceUpdate?: string;
  birthday?: string;
  familyIds?: string[];
  kobudoWeapons?: ('Bo' | 'Sai')[];
  kobudoRankings?: { bo?: string; sai?: string };
  kobudoTestingWeapon?: 'Bo' | 'Sai' | 'Both';
  customFields?: { [key: string]: any };
}

export type StandardFieldKey = 
  | 'birthday'
  | 'beltSize'
  | 'programs'
  | 'rankings'
  | 'attendance'
  | 'schedule'
  | 'notes'
  | 'familyIds'
  | 'enrollmentAgreements'
  | 'creditCardOnFile'
  | 'attendanceCardCreated'
  | 'photoReleaseSigned';

export interface DojoProfileField {
  id: string;
  label: string;
  category?: 'core' | 'schedule' | 'compliance' | 'custom';
  type?: 'text' | 'number' | 'boolean' | 'date' | 'select';
  options?: string[];
  enabled: boolean;
  required?: boolean;
  isCustom?: boolean;
}

export interface Dojo {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  customProfileFields?: DojoProfileField[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export interface BeltRank {
  id: string;
  name: string;
  program: 'karate' | 'tots' | 'kobudo';
  color: string; // CSS color or gradient
  stripe?: {
    color: string;
    style: 'vertical' | 'horizontal' | 'multi';
  };
  kyuText?: string;
  order: number;
  price?: number;
}

export interface AveryTemplate {
  id: string;
  name: string;
  columns: number;
  rows: number;
  width: number; // width in inches
  height: number; // height in inches
  marginTop: number; // inches
  marginBottom: number; // inches
  marginLeft: number; // inches
  marginRight: number; // inches
  columnGap: number; // inches
  rowGap: number; // inches
  paperSize: 'letter' | 'a4';
}

export type UserRole = 'Instructor' | 'Front Desk' | 'Owner';
export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface AppUser {
  id: string; // Firebase Auth uid
  name: string;
  role: UserRole;
  email?: string;
  emailVerified?: boolean;
  skipEmailVerification?: boolean;
  approvalStatus?: ApprovalStatus;
  location?: 'West Chester' | 'Monroe' | 'YMCA' | 'All';
  createdAt?: any;
  lastLogin?: any;
  approvedAt?: any;
  deniedAt?: any;
  isActive?: boolean;
}

export interface SecurityConfig {
  instructorPin: string; // e.g., "1234"
  staffPin: string; // e.g., "5678"
  frontDeskPin?: string; // fallback or new configuration field
  lastUpdated?: any;
}

export interface Suggestion {
  id: string;
  subject: string;
  content: string;
  userName: string;
  userRole: UserRole;
  createdAt: any;
}


