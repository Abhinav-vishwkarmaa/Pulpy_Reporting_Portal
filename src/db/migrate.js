import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Check if tables exist to determine if we need initial setup
    const [tables] = await connection.query("SHOW TABLES LIKE 'conversions'");
    const hasTables = tables.length > 0;

    if (!hasTables) {
      // Fresh database - run initial schema
      console.log('Setting up fresh database with final schema...');
    const migrationFile = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');

      // Split SQL by semicolon and execute each statement
      const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
      for (const statement of statements) {
        if (statement.trim()) {
          await connection.query(statement);
        }
      }
      console.log('✅ Initial schema applied');
    } else {
      console.log('Database already exists, applying incremental migrations...');
    }

    // Apply incremental migrations (skip initial schema)
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && file !== '001_initial_schema.sql')
      .sort();

    if (files.length > 0) {
      console.log(`Found ${files.length} incremental migration files: ${files.join(', ')}`);

      for (const file of files) {
        const migrationFile = path.join(migrationsDir, file);
        console.log(`Running migration: ${file}`);

        const sql = fs.readFileSync(migrationFile, 'utf8');

        // Split SQL by semicolon and execute each statement
        const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);

        for (const statement of statements) {
          if (statement.trim()) {
            try {
              await connection.query(statement);
            } catch (err) {
              // Log the error but continue if it's about duplicate columns/keys or missing columns
              // (since initial schema already includes some changes)
              if (err.code === 'ER_DUP_FIELDNAME' ||
                  err.code === 'ER_DUP_KEYNAME' ||
                  err.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
                  err.code === 'ER_BAD_FIELD_ERROR') {
                console.log(`⚠️  Skipping: ${err.message}`);
              } else if (err.code === 'ER_DUP_ENTRY' && err.message && err.message.includes('uniq_click_uuid')) {
                console.log(`⚠️  Warning: Cannot add unique constraint on click_uuid - duplicate values exist in database`);
                console.log(`   This means some clicks already have multiple conversions.`);
                console.log(`   To fix this, you need to clean up duplicate conversions manually.`);
                console.log(`   Skipping constraint addition - please resolve duplicates first.`);
              } else {
                throw err;
              }
            }
          }
        }

        console.log(`✅ Completed migration: ${file}`);
      }
    }

    await connection.commit();
    console.log('\n🎉 All migrations completed successfully!');
  } catch (error) {
    await connection.rollback();
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});

