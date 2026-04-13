import { UserRole } from '../../../common/enums/roles.enum';

export class UserDto {
  id: number;
  email: string;
  name?: string;
  username?: string;
  avatar?: string;
  roles?: UserRole[];
  isTeacher?: boolean;
  teacherVerified?: boolean;
  lastSeenAt?: Date;
}
