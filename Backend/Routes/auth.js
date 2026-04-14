const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queries } = require('../database');
const { authMiddleware } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

const AVATAR_COLORS = ['#00d4ff','#0096c7','#48cae4','#00b4d8','#ade8f4','#90e0ef','#caf0f8','#023e8a','#0077b6'];

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = queries.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 12);
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const result = queries.createUser.run(name.trim(), email.toLowerCase().trim(), hash, color);

  const user = queries.getUserById.get(result.lastInsertRowid);
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.status(201).json({ token, user });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const user = queries.getUserByEmail.get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = bcrypt.compareSync(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = queries.getUserById.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// PUT /api/auth/goal
router.put('/goal', authMiddleware, (req, res) => {
  const { daily_goal } = req.body;
  if (!daily_goal || daily_goal < 500 || daily_goal > 10000)
    return res.status(400).json({ error: 'Goal must be between 500 and 10000 ml' });
  queries.updateGoal.run(daily_goal, req.user.id);
  res.json({ message: 'Goal updated', daily_goal });
});

module.exports = router;

