import {
  findTimetableConflicts,
  ConflictSlot,
} from './timetable-conflict.policy';

const slot = (
  partial: Partial<ConflictSlot> & { index: number },
): ConflictSlot => ({
  classId: `class-${partial.index}`,
  teacherId: partial.index + 1,
  weekday: 2,
  periodNumber: 1,
  ...partial,
});

describe('findTimetableConflicts', () => {
  it('returns no conflicts for an empty or single-slot input', () => {
    expect(findTimetableConflicts([])).toEqual([]);
    expect(findTimetableConflicts([slot({ index: 0 })])).toEqual([]);
  });

  it('detects a teacher double-booked in the same cell', () => {
    const conflicts = findTimetableConflicts([
      slot({ index: 0, classId: 'A', teacherId: 7 }),
      slot({ index: 1, classId: 'B', teacherId: 7 }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dimension).toBe('teacher');
    expect(conflicts[0].indices).toEqual([0, 1]);
    expect(conflicts[0].message).toContain('Teacher 7 double-booked');
  });

  it('detects a class occupying two slots in one cell', () => {
    const conflicts = findTimetableConflicts([
      slot({ index: 0, classId: 'A', teacherId: 1, room: 'R1' }),
      slot({ index: 1, classId: 'A', teacherId: 2, room: 'R2' }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dimension).toBe('class');
    expect(conflicts[0].indices).toEqual([0, 1]);
  });

  it('detects a room clash across classes', () => {
    const conflicts = findTimetableConflicts([
      slot({ index: 0, classId: 'A', teacherId: 1, room: 'lab-1' }),
      slot({ index: 1, classId: 'B', teacherId: 2, room: 'LAB-1 ' }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dimension).toBe('room');
    // normalization: 'lab-1' vs 'LAB-1 ' (case + trim) collide
    expect(conflicts[0].message).toContain('"LAB-1"');
  });

  it('never clashes on null/empty rooms', () => {
    const conflicts = findTimetableConflicts([
      slot({ index: 0, classId: 'A', teacherId: 1, room: null }),
      slot({ index: 1, classId: 'B', teacherId: 2, room: undefined }),
      slot({ index: 2, classId: 'C', teacherId: 3, room: '  ' }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('ignores different cells — weekday and period both matter', () => {
    const conflicts = findTimetableConflicts([
      slot({
        index: 0,
        classId: 'A',
        teacherId: 7,
        weekday: 2,
        periodNumber: 1,
      }),
      slot({
        index: 1,
        classId: 'B',
        teacherId: 7,
        weekday: 3,
        periodNumber: 1,
      }),
      slot({
        index: 2,
        classId: 'C',
        teacherId: 7,
        weekday: 2,
        periodNumber: 2,
      }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('a legal shared cell (different teacher, class, room) passes', () => {
    // same cell but disjoint resources — MVP allows e.g. two outdoor groups
    const conflicts = findTimetableConflicts([
      slot({ index: 0, classId: 'A', teacherId: 1, room: 'yard' }),
      slot({ index: 1, classId: 'B', teacherId: 2, room: 'field' }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('reports every dimension a group of slots violates at once', () => {
    const conflicts = findTimetableConflicts([
      slot({ index: 0, classId: 'A', teacherId: 1, room: 'R' }),
      slot({ index: 1, classId: 'A', teacherId: 1, room: 'R' }),
    ]);
    const dims = conflicts.map((c) => c.dimension).sort();
    expect(dims).toEqual(['class', 'room', 'teacher']);
  });

  it('sorts deterministically by cell, dimension, then slot index', () => {
    const conflicts = findTimetableConflicts([
      slot({
        index: 0,
        classId: 'A',
        teacherId: 9,
        weekday: 3,
        periodNumber: 1,
      }),
      slot({
        index: 1,
        classId: 'A',
        teacherId: 9,
        weekday: 2,
        periodNumber: 5,
      }),
      slot({
        index: 2,
        classId: 'B',
        teacherId: 9,
        weekday: 2,
        periodNumber: 5,
      }),
      slot({
        index: 3,
        classId: 'B',
        teacherId: 9,
        weekday: 3,
        periodNumber: 1,
      }),
    ]);
    expect(
      conflicts.map((c) => `${c.weekday}:${c.periodNumber}:${c.dimension}`),
    ).toEqual(['2:5:teacher', '3:1:teacher']);
    expect(conflicts[0].indices).toEqual([1, 2]);
    expect(conflicts[1].indices).toEqual([0, 3]);
  });
});
