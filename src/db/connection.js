import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'pulpy_reporting',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ? '***' : '***', // Hide password in logs
  timezone: '+00:00', // UTC ENFORCEMENT: Force UTC timezone for all connections
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true, // needed for running migration files with multiple SQL statements
};

// Log database configuration (without password)

console.log('\n' + '='.repeat(80));
console.log('🗄️  DATABASE CONNECTION INITIALIZATION');
console.log('   ┌─ Configuration ────────────────────────────────────────────────────');
console.log(`   │ Host: ${dbConfig.host}`);
console.log(`   │ Port: ${dbConfig.port}`);
console.log(`   │ Database: ${dbConfig.database}`);
console.log(`   │ User: ${dbConfig.user}`);
console.log(`   │ Password: ${dbConfig.password}`);
console.log(`   │ Max Connections: ${dbConfig.connectionLimit}`);
console.log(`   │ Wait For Connections: ${dbConfig.waitForConnections}`);
console.log(`   └────────────────────────────────────────────────────────────────────`);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'pulpy_reporting',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  timezone: '+00:00', // UTC ENFORCEMENT: Force UTC timezone for all connections
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true,
});

// Handle pool errors
pool.on('error', (err) => {
  console.log('\n' + '='.repeat(80));
  console.error('❌ DATABASE POOL ERROR');
  console.error('   ┌─ Error Details ────────────────────────────────────────────────────');
  console.error(`   │ Message: ${err.message}`);
  console.error(`   │ Code: ${err.code || 'N/A'}`);
  if (err.stack) {
    console.error(`   │ Stack: ${err.stack.split('\n').slice(0, 3).join('\n   │        ')}`);
  }
  console.error('   │');
  console.error('   │ This error occurred on an idle client.');
  console.error('   │ The pool will continue to retry connections.');
  console.error('   └────────────────────────────────────────────────────────────────────');
  console.log('='.repeat(80) + '\n');
});

// Set UTC timezone for all connections (UTC ENFORCEMENT)
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

// Test connection (non-blocking)
const connectionStartTime = Date.now();
pool.query('SELECT NOW(), UTC_TIMESTAMP(), VERSION()')
  .then(([rows]) => {
    const connectionDuration = Date.now() - connectionStartTime;
    const result = Array.isArray(rows) ? rows[0] : rows;
    const serverTime = result['NOW()'];
    const utcTime = result['UTC_TIMESTAMP()'];
    const mysqlVersion = result['VERSION()'] || 'Unknown';

    console.log('   ┌─ Connection Test ────────────────────────────────────────────────────');
    console.log('   │ Status: ✅ SUCCESS');
    console.log(`   │ Duration: ${connectionDuration}ms`);
    console.log(`   │ MySQL Version: ${mysqlVersion}`);
    console.log(`   │ Server Time (NOW()): ${serverTime}`);
    console.log(`   │ UTC Time: ${utcTime}`);
    console.log(`   │ Times Match (UTC enforced): ${serverTime?.getTime() === utcTime?.getTime()}`);
    console.log(`   │ Pool Size: ${pool.pool._allConnections?.length || 0} active connections`);
    console.log('   └────────────────────────────────────────────────────────────────────');
    console.log('='.repeat(80) + '\n');
  })
  .catch((err) => {
    const connectionDuration = Date.now() - connectionStartTime;

    console.log('   ┌─ Connection Test ────────────────────────────────────────────────────');
    console.error('   │ Status: ❌ FAILED');
    console.error(`   │ Duration: ${connectionDuration}ms`);
    console.error(`   │ Error Message: ${err.message}`);
    console.error(`   │ Error Code: ${err.code || 'N/A'}`);

    if (err.code === 'ECONNREFUSED') {
      console.error('   │');
      console.error('   │ 💡 Troubleshooting:');
      console.error('   │   1. Check if MySQL is running');
      console.error('   │   2. Verify host and port are correct');
      console.error('   │   3. Check firewall settings');
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_NOT_SUPPORTED_AUTH_MODE') {
      console.error('   │');
      console.error('   │ 💡 Troubleshooting:');
      console.error('   │   1. Check database username and password');
      console.error('   │   2. Verify user has access to the database');
      console.error('   │   3. Try: ALTER USER "user"@"localhost" IDENTIFIED WITH mysql_native_password BY "password";');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('   │');
      console.error('   │ 💡 Troubleshooting:');
      console.error('   │   1. Database does not exist');
      console.error('   │   2. Create database: CREATE DATABASE pulpy_reporting;');
      console.error('   │   3. Run migrations: npm run migrate');
    }

    console.error('   │');
    console.error('   │ ⚠️  Server will start, but database operations may fail.');
    console.error('   └────────────────────────────────────────────────────────────────────');
    console.log('='.repeat(80) + '\n');
  });

export default pool;

