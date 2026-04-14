// ─── Config ──────────────────────────────────────────────────────────────────
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('aq_token')}` };
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(`${API}${url}`, { headers: authHeaders(), ...opts });
  if (res.status === 401) { logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  todayTotal: 0,
  dailyGoal: 2500,
  percentage: 0,
  logs: [],
  stats: {},
  selectedDrink: 'water',
  history: []
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: '💧', warning: '⚠️' };
  t.innerHTML = `<span>${icons[type]||'💧'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 400); }, 3500);
}

// ─── Gauge ────────────────────────────────────────────────────────────────────
function updateGauge(pct) {
  const circumference = 565;
  const offset = circumference - (circumference * Math.min(pct, 100) / 100);
  const fill = document.getElementById('gaugeFill');
  const pctEl = document.getElementById('gaugePct');
  const subEl = document.getElementById('gaugeSub');
  if (fill) fill.style.strokeDashoffset = offset;
  if (pctEl) {
    animateNumber(pctEl, parseInt(pctEl.innerText || 0), Math.min(pct, 100), '%');
  }
  if (subEl) subEl.textContent = `${ml2L(state.todayTotal)} / ${ml2L(state.dailyGoal)}`;

  // Update drops
  const drops = document.querySelectorAll('.drop');
  const activeDrops = Math.round((Math.min(pct, 100) / 100) * drops.length);
  drops.forEach((d, i) => {
    if (i < activeDrops) { if (!d.classList.contains('active')) { d.classList.add('active'); } }
    else { d.classList.remove('active'); }
  });

  // Progress bar
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = `${Math.min(pct, 100)}%`;

  // Celebration
  if (pct >= 100) { triggerGoalCelebration(); }
}

function ml2L(ml) {
  return ml >= 1000 ? `${(ml/1000).toFixed(1)}L` : `${ml}ml`;
}

function animateNumber(el, from, to, suffix = '') {
  const dur = 1000;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 4);
    el.textContent = Math.round(from + (to - from) * ease) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Goal Celebration ─────────────────────────────────────────────────────────
function triggerGoalCelebration() {
  const gauge = document.querySelector('.water-gauge');
  if (gauge && !gauge.dataset.celebrated) {
    gauge.dataset.celebrated = '1';
    gauge.classList.add('goal-reached');
    toast('🎉 Daily goal reached! Amazing job!', 'success');
    launchConfetti();
    setTimeout(() => gauge.classList.remove('goal-reached'), 700);
  }
}

function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width, y: -10,
    vx: (Math.random()-0.5)*4, vy: Math.random()*4+2,
    color: ['#00d4ff','#00ff88','#ffb347','#ff4d6d','#90e0ef'][Math.floor(Math.random()*5)],
    r: Math.random()*5+3, rot: Math.random()*360, vrot: (Math.random()-0.5)*8
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.r,-p.r,p.r*2,p.r*2); ctx.restore();
      p.x+=p.vx; p.y+=p.vy; p.rot+=p.vrot; p.vy+=0.1;
    });
    frame++;
    if (frame < 120) requestAnimationFrame(draw);
    else { ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display='none'; }
  }
  draw();
}

// ─── Load Today Data ──────────────────────────────────────────────────────────
async function loadToday() {
  try {
    const data = await apiFetch('/water/today');
    state.todayTotal = data.total_ml;
    state.dailyGoal  = data.daily_goal;
    state.percentage = data.percentage;
    state.logs       = data.logs;

    updateGauge(data.percentage);
    renderTodayTotal();
    renderLogs();
    if (window.updateHourlyChart) updateHourlyChart(data.hourly_distribution);
  } catch(e) { toast('Failed to load today\'s data', 'error'); }
}

// ─── Load Stats ───────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const data = await apiFetch('/water/stats');
    state.stats = data;
    renderStats(data);
  } catch(e) {}
}

// ─── Load History ─────────────────────────────────────────────────────────────
async function loadHistory(days = 7) {
  try {
    const data = await apiFetch(`/water/history?days=${days}`);
    state.history = data;
    if (window.updateHistoryChart) updateHistoryChart(data);
  } catch(e) {}
}

// ─── Render Today Total ───────────────────────────────────────────────────────
function renderTodayTotal() {
  const el = document.getElementById('todayTotal');
  if (el) el.textContent = ml2L(state.todayTotal);
  const goalEl = document.getElementById('dailyGoal');
  if (goalEl) goalEl.textContent = ml2L(state.dailyGoal);
}

// ─── Render Stats ─────────────────────────────────────────────────────────────
function renderStats(s) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('statStreak',   `${s.streak}🔥`);
  set('statBest',     s.personal_best?.total ? ml2L(s.personal_best.total) : '—');
  set('statWeekAvg',  ml2L(s.weekly_average));

  // Drink breakdown
  const breakEl = document.getElementById('drinkBreakdown');
  if (breakEl && s.drink_breakdown?.length) {
    const drinkIcons = { water:'💧', tea:'🍵', juice:'🥤', coffee:'☕', milk:'🥛', sports:'⚡' };
    breakEl.innerHTML = s.drink_breakdown.map(d => `
      <div class="log-item">
        <div class="log-icon">${drinkIcons[d.drink_type]||'💧'}</div>
        <div><div class="log-amount">${ml2L(d.total_ml)}</div><div class="log-type">${d.drink_type} • ${d.count} logs</div></div>
        <div class="log-time" style="margin-left:auto">${Math.round(d.total_ml / (state.stats.weekly_average||1) * 100)}%</div>
      </div>
    `).join('');
  }
}

// ─── Render Logs ──────────────────────────────────────────────────────────────
const drinkIcons = { water:'💧', tea:'🍵', juice:'🥤', coffee:'☕', milk:'🥛', sports:'⚡', other:'🫗' };

function renderLogs() {
  const el = document.getElementById('logList');
  if (!el) return;

  if (!state.logs.length) {
    el.innerHTML = `<div class="empty-state"><div class="es-icon">💧</div><p>No logs today yet.<br>Start tracking your intake!</p></div>`;
    return;
  }

  el.innerHTML = state.logs.map((log, i) => `
    <div class="log-item" style="animation-delay:${i*0.05}s">
      <div class="log-icon">${drinkIcons[log.drink_type]||'💧'}</div>
      <div style="flex:1">
        <div class="log-amount">+${log.amount_ml} ml</div>
        <div class="log-type">${log.drink_type}${log.note ? ' • '+log.note : ''}</div>
      </div>
      <div class="log-time">${formatTime(log.logged_at)}</div>
      <button class="log-delete" onclick="deleteLog(${log.id})" title="Delete">🗑️</button>
    </div>
  `).join('');
}

function formatTime(str) {
  const d = new Date(str);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Log Water ────────────────────────────────────────────────────────────────
async function logWater(amount, drinkType, note = '') {
  try {
    const data = await apiFetch('/water/log', {
      method: 'POST',
      body: JSON.stringify({ amount_ml: amount, drink_type: drinkType, note })
    });
    state.todayTotal = data.today_total;
    state.percentage = data.percentage;

    await loadToday();
    await loadHistory(7);
    await loadStats();

    toast(`+${amount}ml ${drinkType} logged! 💧`, 'success');

    // Reset celebrate flag if goal hasn't been reached
    if (data.percentage < 100) {
      const gauge = document.querySelector('.water-gauge');
      if (gauge) delete gauge.dataset.celebrated;
    }
  } catch(e) { toast(e.message, 'error'); }
}

// ─── Quick Log ────────────────────────────────────────────────────────────────
function quickLog(amount) {
  logWater(amount, state.selectedDrink);
}

// ─── Custom Log Form ──────────────────────────────────────────────────────────
async function handleCustomLog(e) {
  e.preventDefault();
  const amount = parseInt(document.getElementById('customAmount').value);
  const drink  = document.getElementById('customDrink').value;
  const note   = document.getElementById('customNote').value.trim();

  if (!amount || amount < 1 || amount > 5000) { toast('Enter amount between 1 and 5000 ml', 'error'); return; }
  await logWater(amount, drink, note);

  document.getElementById('customAmount').value = '';
  document.getElementById('customNote').value   = '';
  closeModal('customLogModal');
}

// ─── Delete Log ───────────────────────────────────────────────────────────────
async function deleteLog(id) {
  try {
    await apiFetch(`/water/log/${id}`, { method: 'DELETE' });
    toast('Log removed', 'info');
    await loadToday();
    await loadHistory(7);
    await loadStats();
    // Reset celebrate state so goal-reached can fire again if re-reached
    const gauge = document.querySelector('.water-gauge');
    if (gauge) delete gauge.dataset.celebrated;
  } catch(e) { toast(e.message, 'error'); }
}

// ─── Goal Update ──────────────────────────────────────────────────────────────
async function handleGoalUpdate(e) {
  e.preventDefault();
  const val = parseInt(document.getElementById('goalInput').value);
  if (!val || val < 500 || val > 10000) { toast('Goal must be 500–10000 ml', 'error'); return; }
  try {
    await apiFetch('/auth/goal', { method: 'PUT', body: JSON.stringify({ daily_goal: val }) });
    state.dailyGoal = val;
    const u = JSON.parse(localStorage.getItem('aq_user') || '{}');
    u.daily_goal = val; localStorage.setItem('aq_user', JSON.stringify(u));
    toast('Daily goal updated! 🎯', 'success');
    closeModal('goalModal');
    const gauge = document.querySelector('.water-gauge');
    if (gauge) delete gauge.dataset.celebrated;
    await loadToday();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openModal(id) { const m = document.getElementById(id); if (m) m.classList.add('active'); }
function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('active'); }

// ─── Drink Chip Selection ─────────────────────────────────────────────────────
function selectDrink(chip, drink) {
  document.querySelectorAll('.drink-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  state.selectedDrink = drink;
}

// ─── History Period Toggle ────────────────────────────────────────────────────
function changePeriod(days, btn) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadHistory(days);
}

// ─── Navbar User ──────────────────────────────────────────────────────────────
function renderNavUser() {
  const u = getUser();
  if (!u) return;
  const nameEl   = document.getElementById('navName');
  const avatarEl = document.getElementById('navAvatar');
  if (nameEl) nameEl.textContent = u.name;
  if (avatarEl) {
    avatarEl.style.background = u.avatar_color || '#00d4ff';
    avatarEl.textContent = u.name.charAt(0).toUpperCase();
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const u = getUser();
  if (!u || !localStorage.getItem('aq_token')) { window.location.href = 'index.html'; return; }
  if (u.role === 'admin') { window.location.href = 'admin.html'; return; }

  renderNavUser();

  // Pre-fill goal input
  const goalInput = document.getElementById('goalInput');
  if (goalInput) goalInput.value = u.daily_goal || 2500;

  await Promise.all([loadToday(), loadStats(), loadHistory(7)]);

  // Init ripples
  document.querySelectorAll('.btn, .quick-log-btn').forEach(b => b.addEventListener('click', addRippleEffect));

  // Modal close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); });
  });

  // Loading screen
  const ls = document.getElementById('loadingScreen');
  if (ls) { ls.classList.add('hidden'); setTimeout(() => ls.remove(), 600); }
}

function addRippleEffect(e) {
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const rip = document.createElement('span');
  rip.className = 'ripple-effect';
  const size = Math.max(btn.offsetWidth, btn.offsetHeight);
  rip.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
  btn.appendChild(rip);
  setTimeout(() => rip.remove(), 700);
}

document.addEventListener('DOMContentLoaded', init);

