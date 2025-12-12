/**
 * Test server startup and capture errors
 */

import('../src/server.js').catch((error) => {
  console.error('\n❌ Server failed to start:');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

// Keep process alive for a few seconds to see startup
setTimeout(() => {
  console.log('\n✅ Server test completed (if no errors above, server started successfully)');
  process.exit(0);
}, 5000);

