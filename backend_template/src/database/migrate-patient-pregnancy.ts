import { config as loadEnv } from 'dotenv';
import { DataSource, TableColumn } from 'typeorm';

loadEnv();

async function run() {
  const databaseType = process.env.DATABASE_TYPE ?? 'sqlite';
  const databaseSsl = process.env.DATABASE_SSL === 'true';
  const dataSource = new DataSource(
    databaseType === 'postgres'
      ? {
          type: 'postgres',
          host: process.env.DATABASE_HOST ?? 'localhost',
          port: Number(process.env.DATABASE_PORT ?? 5432),
          username: process.env.DATABASE_USER ?? 'postgres',
          password: process.env.DATABASE_PASSWORD ?? 'postgres',
          database: process.env.DATABASE_NAME ?? 'medcity_connect',
          ssl: databaseSsl
            ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' }
            : undefined,
          synchronize: false,
        }
      : {
          type: 'sqlite',
          database: process.env.SQLITE_DATABASE ?? './data/medcity.sqlite',
          synchronize: false,
        },
  );

  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    if (!(await queryRunner.hasColumn('patients', 'pregnancy_status'))) {
      await queryRunner.addColumn(
        'patients',
        new TableColumn({ name: 'pregnancy_status', type: 'varchar', isNullable: true }),
      );
    }
    if (!(await queryRunner.hasColumn('patients', 'pregnancy_trimester'))) {
      await queryRunner.addColumn(
        'patients',
        new TableColumn({ name: 'pregnancy_trimester', type: 'integer', isNullable: true }),
      );
    }

    const rows = await dataSource.query(
      'SELECT id, gender, flags, pregnancy_status, pregnancy_trimester FROM patients',
    ) as Array<{
      id: string;
      gender: string;
      flags?: string;
      pregnancy_status?: string | null;
      pregnancy_trimester?: number | null;
    }>;

    for (const row of rows) {
      const sourceFlags = parseFlags(row.flags);
      const pregnancyFlag = sourceFlags
        .map((flag) => flag.trim().toLocaleLowerCase().match(/^pregnancy\s*\(?t([123])\)?$/))
        .find(Boolean);
      const pregnancyTrimester = pregnancyFlag?.[1]
        ? Number(pregnancyFlag[1])
        : row.pregnancy_trimester;
      const pregnancyStatus = row.gender === 'female'
        ? pregnancyFlag
          ? 'pregnant'
          : row.pregnancy_status
        : null;
      const flags = sourceFlags.filter((flag) => !isDerivedFlag(flag));

      if (
        JSON.stringify(flags) === JSON.stringify(sourceFlags) &&
        pregnancyStatus === row.pregnancy_status &&
        pregnancyTrimester === row.pregnancy_trimester
      ) {
        continue;
      }

      if (databaseType === 'postgres') {
        await dataSource.query(
          'UPDATE "patients" SET "flags" = $1, "pregnancy_status" = $2, "pregnancy_trimester" = $3 WHERE "id" = $4',
          [JSON.stringify(flags), pregnancyStatus, pregnancyTrimester ?? null, row.id],
        );
      } else {
        await dataSource.query(
          'UPDATE "patients" SET "flags" = ?, "pregnancy_status" = ?, "pregnancy_trimester" = ? WHERE "id" = ?',
          [JSON.stringify(flags), pregnancyStatus, pregnancyTrimester ?? null, row.id],
        );
      }
    }
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

function parseFlags(value?: string) {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((flag): flag is string => typeof flag === 'string')
      : [];
  } catch {
    return [];
  }
}

function isDerivedFlag(flag: string) {
  const normalized = flag.trim().toLocaleLowerCase();
  return [
    'elderly',
    'polypharmacy',
    'renal impairment',
  ].includes(normalized) || /^pregnancy\s*\(?t[123]\)?$/.test(normalized);
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
