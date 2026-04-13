export enum UserRole {
  // General roles
  ADMIN = 'admin',
  USER = 'user',

  // Education-specific roles
  STUDENT = 'student',
  TEACHER = 'teacher',
  EDUCATION_ADMIN = 'education_admin',
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
