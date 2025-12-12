import bcrypt from 'bcrypt';

const password = process.argv[2] || 'admin123';
const rounds = 10;

bcrypt.hash(password, rounds).then((hash) => {
  console.log(`Password: ${password}`);
  console.log(`Hash: ${hash}`);
  console.log('\nSQL:');
  console.log(`INSERT INTO admin_users (email, name, password_hash, role) VALUES ('admin@bng.com', 'Admin User', '${hash}', 'admin');`);
});

