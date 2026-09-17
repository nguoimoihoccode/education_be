import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SCHOOL_ADMIN_ROLES, UserRole } from '../../common/enums/roles.enum';
import { AttendanceController } from './attendance.controller';
import { ClassController } from './class.controller';
import { GradesController } from './grades.controller';
import { HomeworkController } from './homework.controller';
import { MeController } from './me.controller';
import { SchoolController } from './school.controller';
import { TeacherController } from './teacher.controller';
import { TimetableController } from './timetable.controller';

/**
 * Pins the read/write split of the school module.
 *
 * Reads on the "relationship-gated" controllers carry NO @Roles, so
 * `RolesGuard` lets any signed-in user through and the *service* decides what
 * they may see (per-class checks, all denials 404 — rule D1). Writes keep their
 * roles. The school-wide controllers (`SchoolController`, `ClassController`)
 * keep @Roles at the class level because their services resolve only "which
 * school" and have no per-object check to fall back on — relaxing them would
 * hand out every class, every teacher and rosters with student emails.
 *
 * The metadata assertions are the readable inventory; the guard tests at the
 * end exercise the real mechanism those assertions stand in for.
 */
type ControllerClass = new (...args: never[]) => unknown;

type HandlerCase = readonly [
  route: string,
  controller: ControllerClass,
  method: string,
  expected: readonly UserRole[] | undefined,
];

const STAFF_WRITE = [UserRole.TEACHER, ...SCHOOL_ADMIN_ROLES];
const ADMIN_WRITE = [...SCHOOL_ADMIN_ROLES];
const OPEN = undefined;

const HANDLERS: readonly HandlerCase[] = [
  // Reads: open to any authenticated caller, confined by the service.
  ['GET /attendance/session', AttendanceController, 'session', OPEN],
  ['GET /attendance', AttendanceController, 'history', OPEN],
  ['POST /attendance/take', AttendanceController, 'take', STAFF_WRITE],

  ['GET /school/teaching/classes', TeacherController, 'myClasses', OPEN],
  [
    'GET /school/teaching/classes/:id/students',
    TeacherController,
    'roster',
    OPEN,
  ],
  [
    'GET /school/teaching/classes/:id/parents',
    TeacherController,
    'parents',
    OPEN,
  ],
  [
    'POST /school/teaching/classes/:id/parents/invite',
    TeacherController,
    'invite',
    STAFF_WRITE,
  ],
  [
    'POST /school/teaching/classes/:id/parents/:linkId/approve',
    TeacherController,
    'approve',
    STAFF_WRITE,
  ],
  [
    'POST /school/teaching/classes/:id/parents/:linkId/revoke',
    TeacherController,
    'revoke',
    STAFF_WRITE,
  ],

  ['GET /timetable', TimetableController, 'forClass', OPEN],
  ['GET /timetable/me', TimetableController, 'me', OPEN],
  ['POST /timetable/slots', TimetableController, 'createSlot', ADMIN_WRITE],
  [
    'DELETE /timetable/slots/:id',
    TimetableController,
    'removeSlot',
    ADMIN_WRITE,
  ],
  ['POST /timetable/validate', TimetableController, 'validate', ADMIN_WRITE],

  ['GET /grades', GradesController, 'list', OPEN],
  ['GET /grades/me', GradesController, 'me', OPEN],
  ['POST /grades', GradesController, 'create', STAFF_WRITE],
  ['PATCH /grades/:id', GradesController, 'update', STAFF_WRITE],
  ['DELETE /grades/:id', GradesController, 'remove', STAFF_WRITE],
  ['GET /grades/ranking', GradesController, 'ranking', STAFF_WRITE],
  ['GET /grades/report', GradesController, 'report', STAFF_WRITE],

  ['GET /homework', HomeworkController, 'list', OPEN],
  ['POST /homework', HomeworkController, 'create', STAFF_WRITE],
  ['DELETE /homework/:id', HomeworkController, 'remove', STAFF_WRITE],

  ['GET /me/homework', MeController, 'myHomework', OPEN],
];

const protoOf = (controller: ControllerClass) =>
  controller.prototype as unknown as Record<string, object>;

const handlerRoles = (controller: ControllerClass, method: string) =>
  Reflect.getMetadata(ROLES_KEY, protoOf(controller)[method]);

const publicMethods = (controller: ControllerClass) =>
  Object.getOwnPropertyNames(protoOf(controller)).filter(
    (key) =>
      key !== 'constructor' && typeof protoOf(controller)[key] === 'function',
  );

describe('school authorization: reads open, writes gated', () => {
  // A class-level @Roles leaks onto every handler that does not override it,
  // silently re-closing reads. These controllers moved to per-handler gates.
  it.each([
    ['AttendanceController', AttendanceController],
    ['TeacherController', TeacherController],
    ['GradesController', GradesController],
    ['HomeworkController', HomeworkController],
    ['MeController', MeController],
  ] as const)('%s declares no class-level @Roles', (_name, controller) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toBeUndefined();
  });

  it.each(HANDLERS)('%s', (_route, controller, method, expected) => {
    expect(handlerRoles(controller, method)).toEqual(expected);
  });

  it('inventories every public handler of the controllers it covers', () => {
    // Stops a newly added handler from slipping in ungated *and* unlisted: if
    // it is not in the table above, this fails and forces a decision about it.
    const listed = new Map<ControllerClass, Set<string>>();
    for (const [, controller, method] of HANDLERS) {
      const methods = listed.get(controller) ?? new Set<string>();
      methods.add(method);
      listed.set(controller, methods);
    }

    for (const [controller, methods] of listed) {
      const missing = publicMethods(controller).filter(
        (method) => !methods.has(method),
      );
      expect({ controller: controller.name, missing }).toEqual({
        controller: controller.name,
        missing: [],
      });
    }
  });
});

describe('school-wide controllers stay gated', () => {
  // The regression that matters most: these two have no per-object check, so
  // relaxing them exposes every class, teacher, assignment and student email in
  // the school to any member.
  it.each([
    ['SchoolController', SchoolController],
    ['ClassController', ClassController],
  ] as const)('%s keeps SCHOOL_ADMIN_ROLES', (_name, controller) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(
      SCHOOL_ADMIN_ROLES,
    );
  });

  it.each([
    ['SchoolController', SchoolController, 'getStats'],
    ['SchoolController', SchoolController, 'listTeachers'],
    ['ClassController', ClassController, 'list'],
    ['ClassController', ClassController, 'students'],
  ] as const)(
    '%s.%s leaves the class gate in force, so the roster stays staff-only',
    (_name, controller, method) => {
      expect(handlerRoles(controller, method)).toBeUndefined();
    },
  );
});

describe('RolesGuard honours the split through the real metadata', () => {
  const contextFor = (
    controller: ControllerClass,
    method: string,
  ): ExecutionContext => {
    const handler = protoOf(controller)[method];
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 7 } }) }),
    } as unknown as ExecutionContext;
  };

  const guardFor = (roles: UserRole[]) => {
    const findById = jest.fn().mockResolvedValue({ id: 7, roles });
    const guard = new RolesGuard(new Reflector(), { findById } as never);
    return { guard, findById };
  };

  it('lets a plain USER through a read handler', async () => {
    const { guard, findById } = guardFor([UserRole.USER]);
    await expect(
      guard.canActivate(contextFor(AttendanceController, 'session')),
    ).resolves.toBe(true);
    // No role to check, so the user lookup is skipped entirely.
    expect(findById).not.toHaveBeenCalled();
  });

  it('lets a plain USER through GET /grades/me', async () => {
    const { guard } = guardFor([UserRole.USER]);
    await expect(
      guard.canActivate(contextFor(GradesController, 'me')),
    ).resolves.toBe(true);
  });

  it('still refuses a STUDENT on a write handler', async () => {
    const { guard } = guardFor([UserRole.STUDENT]);
    await expect(
      guard.canActivate(contextFor(AttendanceController, 'take')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('still refuses a plain USER on GET /grades/report', async () => {
    const { guard } = guardFor([UserRole.USER]);
    await expect(
      guard.canActivate(contextFor(GradesController, 'report')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('keeps refusing a STUDENT on the school-wide reads', async () => {
    const { guard } = guardFor([UserRole.STUDENT]);
    await expect(
      guard.canActivate(contextFor(ClassController, 'students')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accepts a PRINCIPAL on a write handler', async () => {
    const { guard } = guardFor([UserRole.PRINCIPAL]);
    await expect(
      guard.canActivate(contextFor(TimetableController, 'createSlot')),
    ).resolves.toBe(true);
  });
});
