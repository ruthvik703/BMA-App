export function getThirdSaturday(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  let saturdayCount = 0;
  while (saturdayCount < 3) {
    if (d.getDay() === 6) saturdayCount++;
    if (saturdayCount < 3) d.setDate(d.getDate() + 1);
  }
  return d;
}

export function isAfterExamSubmitTime(customDateStr: string) {
  const now = new Date();
  let examSubmitDate: Date | null = null;
  
  if (customDateStr) {
    const dateOnly = customDateStr.split('T')[0];
    // 3:30 PM = 15:30:00 local time
    const parsed = new Date(`${dateOnly}T15:30:00`);
    if (!isNaN(parsed.getTime())) {
      examSubmitDate = parsed;
    }
  }
  
  if (!examSubmitDate) {
    examSubmitDate = getThirdSaturday(now);
    examSubmitDate.setHours(15, 30, 0, 0);
  }
  
  return now >= examSubmitDate;
}

export function isExamDay(customDateStr: string): boolean {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  if (customDateStr) {
    const dateOnly = customDateStr.split('T')[0];
    if (dateOnly === todayStr) return true;
    
    const parsed = new Date(dateOnly + "T00:00:00");
    if (!isNaN(parsed.getTime())) {
      const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return nowMidnight >= parsed;
    }
  } else {
    const thirdSat = getThirdSaturday(now);
    const thirdSatStr = `${thirdSat.getFullYear()}-${String(thirdSat.getMonth() + 1).padStart(2, '0')}-${String(thirdSat.getDate()).padStart(2, '0')}`;
    if (todayStr === thirdSatStr) return true;
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const satMidnight = new Date(thirdSat.getFullYear(), thirdSat.getMonth(), thirdSat.getDate());
    return nowMidnight >= satMidnight;
  }
  return false;
}

export function isAfterExamTime(customDateStr: string) {
  return isExamDay(customDateStr);
}

export function getPrintReminderWednesday(testDateStr: string): string {
  if (!testDateStr) return "";
  try {
    const dateOnly = testDateStr.split("T")[0];
    const exam = new Date(dateOnly + "T00:00:00");
    if (isNaN(exam.getTime())) return "";

    const examDay = exam.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // Sunday of test week:
    const sunTestWeek = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate() - examDay);
    // Wednesday of the week before test week (Sunday minus 4 days):
    const wedPriorWeek = new Date(sunTestWeek.getFullYear(), sunTestWeek.getMonth(), sunTestWeek.getDate() - 4);

    const y = wedPriorWeek.getFullYear();
    const m = String(wedPriorWeek.getMonth() + 1).padStart(2, "0");
    const d = String(wedPriorWeek.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return "";
  }
}

export function isPrintReminderWednesday(testDateStr: string, currentDate = new Date()): boolean {
  const targetWedStr = getPrintReminderWednesday(testDateStr);
  if (!targetWedStr) return false;
  const todayStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
  return todayStr === targetWedStr;
}

export function getPaymentDeadline(testDateStr: string) {
  try {
    const testDate = new Date(testDateStr);
    if (isNaN(testDate.getTime())) return "Thursday Prior";
    
    const deadlineDate = new Date(testDate);
    // Move to the most recent Thursday (or stay if it is Thursday)
    // If it's Saturday (6), subtracting 2 gets us to Thursday (4).
    const day = deadlineDate.getDay();
    const diff = (day <= 4) ? (day + 3) : (day - 4);
    deadlineDate.setDate(deadlineDate.getDate() - diff);
    
    return deadlineDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return "Thursday Prior";
  }
}

export function formatDateForDateInput(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

export function formatDateForDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function getStudentProgramExpiryState(
  student: { 
    enrollmentAgreements?: { [key: string]: string };
    enrollmentExpiries?: { [key: string]: string };
  }, 
  program: string
): 'none' | 'expiring' | 'expired' {
  const agreement = student.enrollmentAgreements?.[program];
  if (!agreement || agreement === 'Monthly' || agreement === 'None') return 'none';
  const expiry = student.enrollmentExpiries?.[program];
  if (!expiry) return 'none';

  const now = new Date();
  
  if (agreement === 'Introductory') {
    // Exact day check: YYYY-MM-DD
    // If it is in YYYY-MM format, treat it as YYYY-MM-01
    const expiryStr = expiry.includes('-') && expiry.split('-').length === 2 ? `${expiry}-01` : expiry;
    
    // Parse expiry date using T00:00:00 to avoid timezone shifts
    const expiryDate = new Date(expiryStr + "T00:00:00");
    if (isNaN(expiryDate.getTime())) return 'none';

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Difference in days
    const diffTime = expiryDate.getTime() - todayStart.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'expired'; // Red (past)
    }
    if (diffDays <= 7) {
      return 'expiring'; // Orange (within one week of expiry)
    }
    return 'none';
  } else {
    // End of month check: YYYY-MM
    // If it contains a day YYYY-MM-DD, convert back to YYYY-MM
    const expiryYM = expiry.includes('-') ? expiry.substring(0, 7) : expiry;
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    if (expiryYM === currentYM) {
      return 'expiring'; // Orange (expires end of this month)
    }
    if (expiryYM < currentYM) {
      return 'expired'; // Red (past)
    }
    return 'none';
  }
}

export function getLastDayOfMonthDate(ymStr: string): string {
  if (!ymStr) return '';
  const parts = ymStr.split('-');
  if (parts.length < 2) return ymStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return ymStr;
  // Get last day of the given month
  const lastDay = new Date(year, month, 0).getDate();
  const dayStr = String(lastDay).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
}

export function calculateDefaultExpiryDate(agreementType: string, startDate: Date = new Date()): string {
  if (!agreementType || agreementType === 'Monthly' || agreementType === 'None') {
    return '';
  }
  const d = new Date(startDate);
  let monthsToAdd = 0;
  if (agreementType === '6 months') monthsToAdd = 6;
  else if (agreementType === '12 months') monthsToAdd = 12;
  else if (agreementType === 'Introductory') monthsToAdd = 1;
  else monthsToAdd = 6; // default for duration agreements

  const targetMonth = d.getMonth() + monthsToAdd;
  const targetYear = d.getFullYear() + Math.floor(targetMonth / 12);
  const m = (targetMonth % 12) + 1;
  const mStr = String(m).padStart(2, '0');
  return getLastDayOfMonthDate(`${targetYear}-${mStr}`);
}


