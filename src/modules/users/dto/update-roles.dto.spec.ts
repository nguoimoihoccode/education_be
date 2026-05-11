import { validate } from 'class-validator';
import { UpdateUserRolesDto } from './update-roles.dto';
import { UserRole } from '../../../common/enums/roles.enum';

describe('UpdateUserRolesDto', () => {
  it('accepts known user roles', async () => {
    const dto = new UpdateUserRolesDto();
    dto.roles = [UserRole.USER, UserRole.STUDENT];

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects unknown roles', async () => {
    const dto = new UpdateUserRolesDto();
    dto.roles = ['super_admin' as UserRole];

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });
});
