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
    const table = await queryRunner.getTable('prescription_medications');
    const medicineForeignKeys = (table?.foreignKeys ?? []).filter(
      (foreignKey) =>
        foreignKey.columnNames.includes('medicine_id') &&
        foreignKey.referencedTableName === 'medicines',
    );
    for (const foreignKey of medicineForeignKeys) {
      await queryRunner.dropForeignKey('prescription_medications', foreignKey);
    }

    if (!(await queryRunner.hasColumn('prescription_medications', 'medicine_dci'))) {
      await queryRunner.addColumn(
        'prescription_medications',
        new TableColumn({ name: 'medicine_dci', type: 'varchar', isNullable: true }),
      );
    }

    if (databaseType === 'postgres') {
      await dataSource.query(
        'UPDATE "prescription_medications" pm SET "medicine_dci" = m."dci" FROM "medicines" m WHERE pm."medicine_id" = m."id" AND pm."medicine_dci" IS NULL',
      );
    } else {
      await dataSource.query(
        'UPDATE prescription_medications SET medicine_dci = (SELECT dci FROM medicines WHERE medicines.id = prescription_medications.medicine_id) WHERE medicine_dci IS NULL AND medicine_id IS NOT NULL',
      );
    }
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
