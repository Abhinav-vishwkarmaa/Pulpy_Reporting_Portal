import pool from './src/db/connection.js';

async function checkConstraint() {
  try {
    const connection = await pool.getConnection();

    // Check if the unique constraint exists
    const [indexes] = await connection.query(`
      SHOW INDEX FROM conversions WHERE Key_name = 'uniq_click_uuid'
    `);

    if (indexes.length > 0) {
      console.log('✅ UNIQUE constraint "uniq_click_uuid" exists on conversions.click_uuid');
      console.log('This enforces: One click can only give one conversion');
    } else {
      console.log('❌ UNIQUE constraint "uniq_click_uuid" does not exist');
    }

    // Show the table structure
    const [columns] = await connection.query('DESCRIBE conversions');
    console.log('\nConversions table structure:');
    columns.forEach(col => {
      console.log(`- ${col.Field}: ${col.Type} ${col.Null === 'YES' ? '(NULL)' : '(NOT NULL)'}`);
    });

    connection.release();
    await pool.end();
  } catch (error) {
    console.error('Error checking constraint:', error);
    process.exit(1);
  }
}

checkConstraint();
