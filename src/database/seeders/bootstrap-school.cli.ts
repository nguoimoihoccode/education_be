/**
 * Bootstrap the first school (docs/SCHOOL_PLATFORM_PLAN.md Phase 1.4).
 * Solves the chicken-and-egg: POST /school needs a caller and the caller
 * needs a school.
 *
 * Usage (run from education_be/):
 *   npm run bootstrap:school -- \
 *     --email principal@example.com \
 *     --school "Lingua School" --code LINGUA \
 *     --year "2026-2027" --start 2026-09-05 --end 2027-05-31
 *
 * The user must already exist (register via the app first). Idempotent:
 * re-running with the same school code links/updates instead of duplicating.
 */
import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { School, AcademicYear } from '../../modules/school/entities';
import { UserRole, SCHOOL_ADMIN_ROLES } from '../../common/enums/roles.enum';

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      out[argv[i].slice(2)] = argv[++i];
    }
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const required = ['email', 'school', 'code', 'year', 'start', 'end'] as const;
  for (const key of required) {
    if (!args[key]) {
      console.error(`Missing --${key}. See header comment of this script.`);
      process.exit(1);
    }
  }
  if (!DATE_RE.test(args.start) || !DATE_RE.test(args.end)) {
    console.error('--start/--end must be YYYY-MM-DD');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'stock_db',
    ssl: (process.env.DB_HOST || '').includes('supabase')
      ? { rejectUnauthorized: false }
      : false,
    entities: [User, School, AcademicYear],
    synchronize: false,
  });
  await dataSource.initialize();

  try {
    const userRepo = dataSource.getRepository(User);
    const schoolRepo = dataSource.getRepository(School);
    const yearRepo = dataSource.getRepository(AcademicYear);

    const email = args.email.toLowerCase();
    const user = await userRepo.findOne({ where: { email } });
    if (!user) {
      console.error(
        `No user with ${email}. Register in the app first, then re-run.`,
      );
      process.exit(1);
    }
    if (!user.roles?.some((r) => SCHOOL_ADMIN_ROLES.includes(r))) {
      user.roles = [...(user.roles ?? []), UserRole.PRINCIPAL];
      await userRepo.save(user);
      console.log(`Added PRINCIPAL role to ${email}`);
    }

    let school = await schoolRepo.findOne({ where: { code: args.code } });
    if (!school) {
      school = await schoolRepo.save(
        schoolRepo.create({
          code: args.code,
          name: args.school,
          principalId: user.id,
        }),
      );
      console.log(`Created school "${school.name}" (${school.id})`);
    } else if (!school.principalId) {
      school.principalId = user.id;
      await schoolRepo.save(school);
      console.log(
        `Linked ${email} as principal of existing school ${school.code}`,
      );
    } else if (school.principalId !== user.id) {
      console.error(
        `School code ${args.code} already has a different principal. Pick another --code.`,
      );
      process.exit(1);
    } else {
      console.log(`School ${school.code} already bootstrapped for ${email}.`);
    }

    let year = await yearRepo.findOne({
      where: { schoolId: school.id, name: args.year },
    });
    if (!year) {
      year = await yearRepo.save(
        yearRepo.create({
          schoolId: school.id,
          name: args.year,
          startDate: args.start,
          endDate: args.end,
          isActive: !school.currentAcademicYearId,
        }),
      );
      console.log(`Created academic year "${year.name}" (${year.id})`);
    } else {
      console.log(`Academic year "${year.name}" already exists.`);
    }

    if (!school.currentAcademicYearId) {
      school.currentAcademicYearId = year.id;
      await schoolRepo.save(school);
      console.log(`Set ${year.name} as the current academic year.`);
    }

    console.log('\nDone. Sign in as the principal and open /principal.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
