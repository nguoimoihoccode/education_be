export enum UserRole {
  // General roles
  ADMIN = 'admin',
  USER = 'user',

  // Education-specific roles
  STUDENT = 'student',
  TEACHER = 'teacher',
  EDUCATION_ADMIN = 'education_admin',

  // School platform roles (see docs/SCHOOL_PLATFORM_PLAN.md)
  PRINCIPAL = 'principal',
  PARENT = 'parent',
}

export const EDUCATION_ROLES = [
  UserRole.STUDENT,
  UserRole.TEACHER,
  UserRole.EDUCATION_ADMIN,
];

export const TEACHER_ROLES = [
  UserRole.TEACHER,
  UserRole.EDUCATION_ADMIN,
  UserRole.ADMIN,
];

// Users allowed to administer a school (subjects, classes, assignments, roster)
export const SCHOOL_ADMIN_ROLES = [UserRole.PRINCIPAL, UserRole.ADMIN];
