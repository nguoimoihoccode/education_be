import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SchoolClass, Subject, School, TeachingAssignment } from './entities';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../../common/enums/roles.enum';
import { SchoolService } from './school.service';
/** Shared relationship policy; all reads and transactional writes use the same tenant checks. */
@Injectable()
export class SchoolClassSubjectAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly schools: SchoolService,
  ) {}
  async assertAccess(
    userId: number,
    classId: string,
    subjectId: string,
    manager: EntityManager = this.dataSource.manager,
  ) {
    const schoolId = await this.schools.resolveSchoolIdForUser(userId);
    const cls = await manager.findOne(SchoolClass, {
      where: { id: classId, schoolId },
    });
    const subject = await manager.findOne(Subject, {
      where: { id: subjectId, schoolId },
    });
    if (!cls || !subject) throw new NotFoundException('Class not found');
    if (cls.homeroomTeacherId === userId) return { cls, subject, schoolId };
    const school = await manager.findOne(School, { where: { id: schoolId } });
    if (school?.principalId === userId) return { cls, subject, schoolId };
    const assignment = await manager.findOne(TeachingAssignment, {
      where: { schoolId, classId, subjectId, teacherId: userId },
    });
    if (assignment) return { cls, subject, schoolId };
    const actor = await manager.findOne(User, { where: { id: userId } });
    if (actor?.roles?.includes(UserRole.ADMIN))
      return { cls, subject, schoolId };
    throw new NotFoundException('Class not found');
  }
}
