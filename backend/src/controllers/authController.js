const bcrypt = require('bcrypt');
const prisma = require('../config/db');

const signup = async (req, res) => {
  const { name, email, password } = req.body;

  // Basic validation
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  // Password rule: min 8 chars, at least one letter and one number
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include a letter and a number.',
    });
  }

  // Check for existing user
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // Hash password — 10 salt rounds is the standard balance of security vs speed
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  // Never send passwordHash back, even hashed
  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
  });
};

module.exports = { signup };
