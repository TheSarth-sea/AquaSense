const express = require('express');
const { queries } = require('../database');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminOnly);

// GET /api/admin/users
router.get('/users', (req, res) => {
  const users = queries.getAllUsers.all();
  res.json(users);
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const totalUsers   = queries.getTotalUsers.get();
  const totalLogs    = queries.getTotalLogs.get();
  const totalWater   = queries.getTotalWater.get();
  const activeToday  = queries.getActiveToday.get();
  const userGrowth   = queries.getUserGrowth.all();
  const topConsumers = queries.getTopConsumers.all();
  const platformDaily = queries.getPlatformDailyStats.all();

  res.json({
    total_users:    totalUsers.count,
    total_logs:     totalLogs.count,
    total_water_ml: totalWater.total,
    active_today:   activeToday.count,
    user_growth:    userGrowth,
    top_consumers:  topConsumers,
    platform_daily: platformDaily
  });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const user = queries.getUserById.get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin' });
  queries.deleteUser.run(req.params.id);
  res.json({ message: 'User deleted' });
});

// PUT /api/admin/users/:id/goal
router.put('/users/:id/goal', (req, res) => {
  const { daily_goal } = req.body;
  if (!daily_goal || daily_goal < 500) return res.status(400).json({ error: 'Invalid goal' });
  queries.updateGoal.run(daily_goal, req.params.id);
  res.json({ message: 'Goal updated', daily_goal });
});

module.exports = router;

