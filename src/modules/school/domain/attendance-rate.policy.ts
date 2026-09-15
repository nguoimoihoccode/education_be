/**
 * Pure attendance-rate policy (docs/SCHOOL_PLATFORM_PLAN.md §3.5, Phase 3).
 *
 * Input: the statuses of one student's (or one class's) records within a date
 * range — the caller filters by schoolId BEFORE calling (rule D1).
 * attendanceRate = (present + late) / totalSessions * 100, 1 decimal —
 * "đi học muộn vẫn được tính là chuyên cần" per common VN school practice;
 * flip by excluding late if a school ever needs that (parameter later).
 * unexcusedAbsences = count of `absent` (a formal `excused` status is its own
 * value, so "nghỉ có phép" never counts against the student).
 */

export interface AttendanceFact {
  status: 'present' | 'absent' | 'late' | 'excused';
}

export interface AttendanceSummary {
  totalSessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** 0..100, 1 decimal; 0 when there are no records yet */
  attendanceRate: number;
  unexcusedAbsences: number;
}

export function summarizeAttendance(
  records: AttendanceFact[],
): AttendanceSummary {
  const summary: AttendanceSummary = {
    totalSessions: records.length,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    attendanceRate: 0,
    unexcusedAbsences: 0,
  };
  for (const r of records) {
    summary[r.status] += 1;
  }
  if (records.length > 0) {
    const attended = summary.present + summary.late;
    summary.attendanceRate =
      Math.round((attended / records.length) * 1000) / 10; // 1 decimal
  }
  summary.unexcusedAbsences = summary.absent;
  return summary;
}
