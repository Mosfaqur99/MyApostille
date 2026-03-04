const bcrypt = require('bcryptjs');

// Passwords to hash
const passwords = ['admin123', 'user123'];

passwords.forEach(async (password) => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  console.log(`Password: ${password}`);
  console.log(`Hash: ${hash}\n`);
});

// Keep process alive until hashing completes
setTimeout(() => process.exit(0), 1000);