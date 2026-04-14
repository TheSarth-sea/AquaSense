const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path   = require('path');
require('dotenv').config();

const DB_PATH = path.join(__dirname, 'aquasense.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode + foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ─── Schema ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    daily_goal  INTEGER NOT NULL DEFAULT 2500,
    role        TEXT    NOT NULL DEFAULT 'user',
    avatar_color TEXT   NOT NULL DEFAULT '#00d4ff',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS water_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_ml   INTEGER NOT NULL,
    drink_type  TEXT    NOT NULL DEFAULT 'water',
    note        TEXT,
    logged_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS daily_summaries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        TEXT    NOT NULL,
    total_ml    INTEGER NOT NULL DEFAULT 0,
    goal_ml     INTEGER NOT NULL DEFAULT 2500,
    UNIQUE(user_id, date)
  );
`);

// ─── Seed Admin ──────────────────────────────────────────────────────────────

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL);
  if (!existing) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
    db.prepare(`
      INSERT INTO users (name, email, password, daily_goal, role, avatar_color)
      VALUES (?, ?, ?, 3000, 'admin', '#00ffaa')
    `).run(process.env.ADMIN_NAME, process.env.ADMIN_EMAIL, hash);
    console.log(`✅ Admin seeded: ${process.env.ADMIN_EMAIL}`);
  }
}

seedAdmin();

// ─── Query Helpers ───────────────────────────────────────────────────────────

const queries = {
  // Users
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById:    db.prepare('SELECT id, name, email, daily_goal, role, avatar_color, created_at FROM users WHERE id = ?'),
  getAllUsers:     db.prepare(`
    SELECT u.id, u.name, u.email, u.daily_goal, u.role, u.avatar_color, u.created_at,
      (SELECT COUNT(*) FROM water_logs WHERE user_id = u.id) as total_logs,
      (SELECT COALESCE(SUM(amount_ml),0) FROM water_logs WHERE user_id = u.id) as total_ml
    FROM users u ORDER BY u.created_at DESC
  `),
  createUser:     db.prepare(`
    INSERT INTO users (name, email, password, daily_goal, avatar_color)
    VALUES (?, ?, ?, 2500, ?)
  `),
  updateGoal:     db.prepare('UPDATE users SET daily_goal = ? WHERE id = ?'),
  deleteUser:     db.prepare('DELETE FROM users WHERE id = ?'),

  // Water Logs
  addLog: db.prepare(`
    INSERT INTO water_logs (user_id, amount_ml, drink_type, note, logged_at)
    VALUES (?, ?, ?, ?, datetime('now','localtime'))
  `),
  getTodayLogs: db.prepare(`
    SELECT * FROM water_logs
    WHERE user_id = ? AND date(logged_at) = date('now','localtime')
    ORDER BY logged_at DESC
  `),
  getTodayTotal: db.prepare(`
    SELECT COALESCE(SUM(amount_ml), 0) as total
    FROM water_logs
    WHERE user_id = ? AND date(logged_at) = date('now','localtime')
  `),
  getHistory: db.prepare(`
    SELECT date(logged_at) as date, SUM(amount_ml) as total_ml, COUNT(*) as log_count
    FROM water_logs
    WHERE user_id = ? AND logged_at >= date('now','localtime', ? || ' days')
    GROUP BY date(logged_at)
    ORDER BY date ASC
  `),
  getHourlyDistribution: db.prepare(`
    SELECT strftime('%H', logged_at) as hour, SUM(amount_ml) as total_ml
    FROM water_logs
    WHERE user_id = ? AND date(logged_at) = date('now','localtime')
    GROUP BY hour ORDER BY hour
  `),
  deleteLog:  db.prepare('DELETE FROM water_logs WHERE id = ? AND user_id = ?'),
  getLogById: db.prepare('SELECT * FROM water_logs WHERE id = ? AND user_id = ?'),
  getDrinkBreakdown: db.prepare(`
    SELECT drink_type, SUM(amount_ml) as total_ml, COUNT(*) as count
    FROM water_logs WHERE user_id = ?
    AND logged_at >= date('now','localtime', '-30 days')
    GROUP BY drink_type ORDER BY total_ml DESC
  `),
  getStreak: db.prepare(`
    WITH RECURSIVE dates AS (
      SELECT date('now','localtime') as d
      UNION ALL
      SELECT date(d, '-1 day') FROM dates WHERE d > date('now','localtime', '-365 days')
    ),
    daily AS (
      SELECT date(logged_at) as d FROM water_logs
      WHERE user_id = ? GROUP BY date(logged_at)
      HAVING SUM(amount_ml) >= (SELECT daily_goal FROM users WHERE id = ?)
    )
    SELECT COUNT(*) as streak FROM dates
    WHERE d IN (SELECT d FROM daily)
    AND d >= (
      SELECT COALESCE(MAX(d2.d), date('now','localtime'))
      FROM dates d2
      WHERE d2.d NOT IN (SELECT d FROM daily)
      AND d2.d < date('now','localtime')
    )
  `),
  getPersonalBest: db.prepare(`
    SELECT date(logged_at) as date, SUM(amount_ml) as total
    FROM water_logs WHERE user_id = ?
    GROUP BY date(logged_at) ORDER BY total DESC LIMIT 1
  `),
  getWeeklyAvg: db.prepare(`
    SELECT AVG(daily_total) as avg FROM (
      SELECT date(logged_at) as d, SUM(amount_ml) as daily_total
      FROM water_logs WHERE user_id = ?
      AND logged_at >= date('now','localtime', '-7 days')
      GROUP BY d
    )
  `),

  // Admin stats
  getTotalUsers:  db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'user'"),
  getTotalLogs:   db.prepare('SELECT COUNT(*) as count FROM water_logs'),
  getTotalWater:  db.prepare('SELECT COALESCE(SUM(amount_ml),0) as total FROM water_logs'),
  getActiveToday: db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count FROM water_logs
    WHERE date(logged_at) = date('now','localtime')
  `),
  getUserGrowth: db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM users WHERE role = 'user'
    GROUP BY date(created_at) ORDER BY date DESC LIMIT 30
  `),
  getTopConsumers: db.prepare(`
    SELECT u.name, u.email, u.avatar_color,
      SUM(w.amount_ml) as total_ml, COUNT(w.id) as logs
    FROM water_logs w JOIN users u ON u.id = w.user_id
    WHERE w.logged_at >= date('now','localtime', '-7 days')
    GROUP BY w.user_id ORDER BY total_ml DESC LIMIT 10
  `),
  getPlatformDailyStats: db.prepare(`
    SELECT date(logged_at) as date,
      SUM(amount_ml) as total_ml,
      COUNT(DISTINCT user_id) as active_users,
      COUNT(*) as log_count
    FROM water_logs
    WHERE logged_at >= date('now','localtime', '-30 days')
    GROUP BY date(logged_at) ORDER BY date ASC
  `)
};

module.exports = { db, queries };
