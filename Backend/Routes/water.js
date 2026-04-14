const express = require('express');
const { queries } = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/water/log
router.post('/log', authMiddleware, (req, res) => {
  const { amount_ml, drink_type = 'water', note = '' } = req.body;
  if (!amount_ml || amount_ml < 1 || amount_ml > 5000)
    return res.status(400).json({ error: 'Amount must be between 1 and 5000 ml' });

  const result = queries.addLog.run(req.user.id, amount_ml, drink_type, note);
  const log = { id: result.lastInsertRowid, user_id: req.user.id, amount_ml, drink_type, note };

  const today = queries.getTodayTotal.get(req.user.id);
  const user  = queries.getUserById.get(req.user.id);

  res.status(201).json({
    log,
    today_total: today.total,
    daily_goal: user.daily_goal,
    percentage: Math.min(100, Math.round((today.total / user.daily_goal) * 100))
  });
});

// GET /api/water/today
router.get('/today', authMiddleware, (req, res) => {
  const logs  = queries.getTodayLogs.get ? 
    queries.getTodayLogs.all(req.user.id) : 
    queries.getTodayLogs.all(req.user.id);
  const total = queries.getTodayTotal.get(req.user.id);
  const user  = queries.getUserById.get(req.user.id);
  const hourly = queries.getHourlyDistribution.all(req.user.id);

  res.json({
    logs,
    total_ml: total.total,
    daily_goal: user.daily_goal,
    percentage: Math.min(100, Math.round((total.total / user.daily_goal) * 100)),
    hourly_distribution: hourly
  });
});

// GET /api/water/history?days=7
router.get('/history', authMiddleware, (req, res) => {
  const days = parseInt(req.query.days) || 7;
  if (days < 1 || days > 365) return res.status(400).json({ error: 'Days must be 1-365' });

  const user    = queries.getUserById.get(req.user.id);
  const history = queries.getHistory.all(req.user.id, `-${days}`);

  // Fill missing days with 0
  const filled = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found = history.find(h => h.date === dateStr);
    filled.push({
      date: dateStr,
      total_ml: found ? found.total_ml : 0,
      log_count: found ? found.log_count : 0,
      goal_ml: user.daily_goal,
      achieved: found ? found.total_ml >= user.daily_goal : false
    });
  }
  res.json(filled);
});

// GET /api/water/stats
router.get('/stats', authMiddleware, (req, res) => {
  const user    = queries.getUserById.get(req.user.id);
  const streak  = queries.getStreak.get(req.user.id, req.user.id);
  const best    = queries.getPersonalBest.get(req.user.id);
  const weekAvg = queries.getWeeklyAvg.get(req.user.id);
  const breakdown = queries.getDrinkBreakdown.all(req.user.id);
  const today   = queries.getTodayTotal.get(req.user.id);

  res.json({
    streak: streak?.streak || 0,
    personal_best: best || { date: null, total: 0 },
    weekly_average: Math.round(weekAvg?.avg || 0),
    today_total: today.total,
    daily_goal: user.daily_goal,
    percentage: Math.min(100, Math.round((today.total / user.daily_goal) * 100)),
    drink_breakdown: breakdown
  });
});

// DELETE /api/water/log/:id
router.delete('/log/:id', authMiddleware, (req, res) => {
  const log = queries.getLogById.get(req.params.id, req.user.id);
  if (!log) return res.status(404).json({ error: 'Log not found' });
  queries.deleteLog.run(req.params.id, req.user.id);
  res.json({ message: 'Log deleted' });
});

module.exports = router;

