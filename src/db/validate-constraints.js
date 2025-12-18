import pool from './connection.js';

async function validateConstraints() {
  try {
    console.log('🔍 Validating Database Constraints...\n');

    // Check for duplicate click_uuid in conversions table
    console.log('1. Checking for duplicate click_uuid values in conversions table...');
    const [duplicateClicks] = await pool.query(`
      SELECT click_uuid, COUNT(*) as count
      FROM conversions
      WHERE click_uuid IS NOT NULL
      GROUP BY click_uuid
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);

    if (duplicateClicks.length > 0) {
      console.log('❌ FOUND DUPLICATE CLICK CONVERSIONS:');
      duplicateClicks.forEach(row => {
        console.log(`   Click UUID: ${row.click_uuid} - ${row.count} conversions`);
      });
      console.log(`\n⚠️  Total problematic click_uuid entries: ${duplicateClicks.length}`);
      console.log('💡 To fix: Run cleanup script or manually remove duplicate conversions');
    } else {
      console.log('✅ No duplicate click_uuid values found');
    }

    // Check if unique constraint exists
    console.log('\n2. Checking if uniq_click_uuid constraint exists...');
    const [constraints] = await pool.query(`
      SHOW INDEX FROM conversions WHERE Key_name = 'uniq_click_uuid'
    `);

    if (constraints.length > 0) {
      console.log('✅ Unique constraint "uniq_click_uuid" exists');
      console.log('✅ One click = one conversion rule is ENFORCED');
    } else {
      console.log('❌ Unique constraint "uniq_click_uuid" does NOT exist');
      console.log('⚠️  One click = one conversion rule is NOT enforced');
    }

    // Check for duplicate rcid + offer_id combinations
    console.log('\n3. Checking for duplicate rcid + offer_id combinations...');
    const [duplicateRcids] = await pool.query(`
      SELECT rcid, offer_id, COUNT(*) as count
      FROM conversions
      WHERE rcid IS NOT NULL
      GROUP BY rcid, offer_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 5
    `);

    if (duplicateRcids.length > 0) {
      console.log('⚠️  FOUND DUPLICATE RCID + OFFER combinations (this is allowed for deduplication):');
      duplicateRcids.forEach(row => {
        console.log(`   RCID: ${row.rcid}, Offer: ${row.offer_id} - ${row.count} entries`);
      });
    } else {
      console.log('✅ No duplicate rcid + offer_id combinations found');
    }

    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`   - Duplicate click conversions: ${duplicateClicks.length > 0 ? '❌ EXISTS' : '✅ NONE'}`);
    console.log(`   - One-click-one-conversion constraint: ${constraints.length > 0 ? '✅ ENFORCED' : '❌ NOT ENFORCED'}`);

    if (duplicateClicks.length > 0 && constraints.length === 0) {
      console.log('\n🔧 RECOMMENDATION:');
      console.log('   Clean up duplicate conversions before applying the constraint:');
      console.log('   1. Identify which conversions to keep (usually the first one)');
      console.log('   2. Delete duplicate records manually');
      console.log('   3. Run migration to add the constraint');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

validateConstraints();