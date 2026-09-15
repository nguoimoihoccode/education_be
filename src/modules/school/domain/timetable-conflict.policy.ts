/**
 * Pure timetable conflict policy (docs/SCHOOL_PLATFORM_PLAN.md §3.5, Phase 3).
 *
 * A clash = two slots occupying the same (weekday, periodNumber) while
 * sharing a resource, checked along 3 dimensions:
 *   - teacher : same teacherId  (a teacher can't be in two rooms at once)
 *   - class   : same classId    (belt & braces — DB unique also enforces it)
 *   - room    : same non-empty room (rooms normalize: trim + uppercase)
 * Slots in the same cell that share NO resource (different teacher AND
 * different room AND different class) are legal in this MVP (e.g. two
 * outdoor PE groups). The school's own `periodConfig.days` filters which
 * weekdays the grid renders — the policy does not judge the weekday value.
 */

export type ConflictDimension = 'teacher' | 'class' | 'room';

export interface ConflictSlot {
  /** index into the array passed to findTimetableConflicts (for FE highlight) */
  index: number;
  id?: string; // uuid when the slot already exists in DB
  classId: string;
  teacherId: number;
  room?: string | null;
  weekday: number;
  periodNumber: number;
}

export interface TimetableConflict {
  dimension: ConflictDimension;
  weekday: number;
  periodNumber: number;
  /** positions (input indices) of the slots involved in this clash */
  indices: number[];
  message: string;
}

const cellKey = (weekday: number, periodNumber: number) =>
  `${weekday}:${periodNumber}`;

const normalizeRoom = (room?: string | null): string | null => {
  const trimmed = room?.trim().toUpperCase();
  return trimmed ? trimmed : null;
};

/** Deterministic order: by cell (weekday, period), then dimension, then slots. */
const compareConflicts = (a: TimetableConflict, b: TimetableConflict) =>
  a.weekday - b.weekday ||
  a.periodNumber - b.periodNumber ||
  a.dimension.localeCompare(b.dimension) ||
  a.indices[0] - b.indices[0];

export function findTimetableConflicts(
  slots: ConflictSlot[],
): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];

  // bucket slots per (weekday, periodNumber) cell
  const cells = new Map<string, ConflictSlot[]>();
  for (const slot of slots) {
    const key = cellKey(slot.weekday, slot.periodNumber);
    const bucket = cells.get(key) ?? [];
    bucket.push(slot);
    cells.set(key, bucket);
  }

  for (const bucket of cells.values()) {
    if (bucket.length < 2) continue;

    const groupBy = (
      pick: (s: ConflictSlot) => string | number | null,
    ): ConflictSlot[][] => {
      const groups = new Map<string, ConflictSlot[]>();
      for (const s of bucket) {
        const value = pick(s);
        if (value === null || value === undefined) continue; // no resource → no clash
        const k = String(value);
        const g = groups.get(k) ?? [];
        g.push(s);
        groups.set(k, g);
      }
      return Array.from(groups.values()).filter((g) => g.length >= 2);
    };

    const dims: Array<{
      dimension: ConflictDimension;
      groups: ConflictSlot[][];
      describe: (sample: ConflictSlot, indices: number[]) => string;
    }> = [
      {
        dimension: 'teacher',
        groups: groupBy((s) => s.teacherId),
        describe: (s, indices) =>
          `Teacher ${s.teacherId} double-booked on weekday ${s.weekday} period ${s.periodNumber} (slots ${indices.join(', ')})`,
      },
      {
        dimension: 'class',
        groups: groupBy((s) => s.classId),
        describe: (s, indices) =>
          `Class ${s.classId} has 2 slots on weekday ${s.weekday} period ${s.periodNumber} (slots ${indices.join(', ')})`,
      },
      {
        dimension: 'room',
        groups: groupBy((s) => normalizeRoom(s.room)),
        describe: (s, indices) =>
          `Room "${normalizeRoom(s.room)}" double-booked on weekday ${s.weekday} period ${s.periodNumber} (slots ${indices.join(', ')})`,
      },
    ];

    for (const { dimension, groups, describe } of dims) {
      for (const g of groups) {
        const indices = g.map((s) => s.index).sort((x, y) => x - y);
        conflicts.push({
          dimension,
          weekday: g[0].weekday,
          periodNumber: g[0].periodNumber,
          indices,
          message: describe(g[0], indices),
        });
      }
    }
  }

  return conflicts.sort(compareConflicts);
}
