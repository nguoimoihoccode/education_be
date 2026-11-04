import { SchoolClassSubjectAccessService } from './school-class-subject-access.service';
import { SchoolClass, Subject, School, TeachingAssignment } from './entities';
import { User } from '../users/entities/user.entity';
describe('class-subject assessment authorization', () => {
  const setup = (data: any) => {
    const manager = {
      findOne: jest.fn(
        async (entity: any, options: any) => data[entity.name] ?? null,
      ),
    };
    return {
      manager,
      service: new SchoolClassSubjectAccessService(
        { manager } as any,
        { resolveSchoolIdForUser: async () => 'school' } as any,
      ),
    };
  };
  it('requires tenant-scoped class and subject lookups', async () => {
    const { service, manager } = setup({
      SchoolClass: { id: 'class', schoolId: 'school', homeroomTeacherId: 1 },
      Subject: { id: 'subject' },
    });
    await service.assertAccess(1, 'class', 'subject');
    expect(manager.findOne).toHaveBeenCalledWith(SchoolClass, {
      where: { id: 'class', schoolId: 'school' },
    });
    expect(manager.findOne).toHaveBeenCalledWith(Subject, {
      where: { id: 'subject', schoolId: 'school' },
    });
  });
  it('denies a teacher with no exact subject assignment', async () => {
    const { service } = setup({
      SchoolClass: { id: 'class' },
      Subject: { id: 'subject' },
      User: { roles: ['TEACHER'] },
    });
    await expect(service.assertAccess(1, 'class', 'subject')).rejects.toThrow();
  });
  it('uses transaction manager for permission recheck', async () => {
    const { service } = setup({});
    const tx = {
      findOne: jest.fn(async (e: any) =>
        e === SchoolClass
          ? { id: 'class', homeroomTeacherId: 1 }
          : { id: 'subject' },
      ),
    };
    await service.assertAccess(1, 'class', 'subject', tx as any);
    expect(tx.findOne).toHaveBeenCalledTimes(2);
  });
});
