import pool from './connection.js';

async function cleanupDuplicates() {
  const connection = await pool.getConnection();

  try {
    console.log('🧹 Starting cleanup of duplicate click conversions...\n');

    // First, let's see what duplicates exist
    const [duplicates] = await connection.query(`
      SELECT click_uuid, COUNT(*) as count
      FROM conversions
      WHERE click_uuid IS NOT NULL
      GROUP BY click_uuid
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);

    if (duplicates.length === 0) {
      console.log('✅ No duplicate click conversions found. Cleanup not needed.');
      return;
    }

    console.log(`Found ${duplicates.length} click_uuid values with duplicates:`);
    duplicates.forEach(row => {
      console.log(`  - Click ${row.click_uuid}: ${row.count} conversions`);
    });

    console.log('\n⚠️  WARNING: This will DELETE duplicate conversions, keeping only the FIRST one for each click.');
    console.log('   Make sure you have a backup before proceeding!');

    // Ask for confirmation (in a real scenario, you'd want user input)
    console.log('\n🔄 Proceeding with cleanup...');

    let totalDeleted = 0;

    for (const duplicate of duplicates) {
      // Get all conversions for this click_uuid, ordered by creation time
      const [conversions] = await connection.query(`
        SELECT id, created_at
        FROM conversions
        WHERE click_uuid = ?
        ORDER BY created_at ASC
      `, [duplicate.click_uuid]);

      // Keep the first one (oldest), delete the rest
      const idsToDelete = conversions.slice(1).map(conv => conv.id);

      if (idsToDelete.length > 0) {
        const [deleteResult] = await connection.query(
          'DELETE FROM conversions WHERE id IN (?)',
          [idsToDelete]
        );

        console.log(`  ✅ Cleaned click ${duplicate.click_uuid}: deleted ${deleteResult.affectedRows} duplicates`);
        totalDeleted += deleteResult.affectedRows;
      }
    }

    console.log(`\n🎉 Cleanup completed! Total duplicate conversions removed: ${totalDeleted}`);

    // Verify no duplicates remain
    const [remainingDuplicates] = await connection.query(`
      SELECT click_uuid, COUNT(*) as count
      FROM conversions
      WHERE click_uuid IS NOT NULL
      GROUP BY click_uuid
      HAVING COUNT(*) > 1
    `);

    if (remainingDuplicates.length === 0) {
      console.log('✅ Verification: No duplicate click conversions remain');
    } else {
      console.log('❌ Warning: Some duplicates still exist');
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

// Uncomment to run the cleanup
// cleanupDuplicates().catch(console.error);

console.log('🧹 Duplicate Cleanup Script');
console.log('To run cleanup, uncomment the cleanupDuplicates() call at the bottom of this file');
console.log('⚠️  WARNING: This will permanently delete duplicate conversion records!');
console.log('   Make sure you have a database backup before running this script.');
