/**
 * Simple script to verify all imports work correctly
 * Run: node scripts/verify-imports.js
 */

console.log('🔍 Verifying imports...\n');

const modules = [
  { name: 'Server', path: '../src/server.js' },
  { name: 'Request Logger', path: '../src/middleware/requestLogger.js' },
  { name: 'Error Handler', path: '../src/middleware/errorHandler.js' },
  { name: 'Auth Middleware', path: '../src/middleware/auth.js' },
  { name: 'Admin Routes', path: '../src/routes/admin.js' },
  { name: 'Tracking Routes', path: '../src/routes/tracking.js' },
  { name: 'Postback Routes', path: '../src/routes/postback.js' },
  { name: 'Report Routes', path: '../src/routes/reports.js' },
  { name: 'Admin Controller', path: '../src/controllers/adminController.js' },
  { name: 'Tracking Controller', path: '../src/controllers/trackingController.js' },
  { name: 'Postback Controller', path: '../src/controllers/postbackController.js' },
  { name: 'Report Controller', path: '../src/controllers/reportController.js' },
  { name: 'Dashboard Controller', path: '../src/controllers/dashboardController.js' },
];

let successCount = 0;
let failCount = 0;

for (const module of modules) {
  try {
    await import(module.path);
    console.log(`✅ ${module.name}`);
    successCount++;
  } catch (error) {
    console.error(`❌ ${module.name}: ${error.message}`);
    failCount++;
  }
}

console.log(`\n📊 Results: ${successCount} passed, ${failCount} failed`);

if (failCount === 0) {
  console.log('✅ All imports verified successfully!\n');
  process.exit(0);
} else {
  console.log('❌ Some imports failed. Please check the errors above.\n');
  process.exit(1);
}

