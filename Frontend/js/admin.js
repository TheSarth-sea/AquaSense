// ─── Config ──────────────────────────────────────────────────────────────────
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('aq_token')}` };
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(`${API}${url}`, { headers: authHeaders(), ...opts });
  if (res.status === 401 || res.status === 403) { logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success:'✅', error:'❌', info:'💧', warning:'⚠️' };
  t.innerHTML = `<span>${icons[type]||'💧'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 400); }, 3500);
}

// ─── State ────────────────────────────────────────────────────────────────────
let allUsers = [];
let adminStats = {};
let platformChart = null, growthChart = null, topChart = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ml2L(ml) { return ml >= 1000 ? `${(ml/1000).toFixed(1)}L` : `${ml}ml`; }

function formatNum(n) {
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n/1000).toFixed(1)}K`;
  return n.toString();
}

function animateNumber(el, from, to, suffix = '', dur = 1200) {
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 4);
    el.textContent = Math.round(from + (to - from) * ease) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Load Admin Stats ─────────────────────────────────────────────────────────
async function loadAdminStats() {
  try {
    const data = await apiFetch('/admin/stats');
    adminStats = data;
    renderStatCards(data);
    renderPlatformChart(data.platform_daily);
    renderGrowthChart(data.user_growth);
    renderTopConsumers(data.top_consumers);
  } catch(e) { toast('Failed to load stats', 'error'); }
}

function renderStatCards(data) {
  const cards = [
    { id:'statUsers',    value: data.total_users,     suffix:'',  icon:'👥', label:'Total Users' },
    { id:'statLogs',     value: data.total_logs,      suffix:'',  icon:'📝', label:'Total Logs' },
    { id:'statWater',    value: Math.round(data.total_water_ml/1000), suffix:'L', icon:'💧', label:'Total Water' },
    { id:'statActive',   value: data.active_today,    suffix:'',  icon:'🟢', label:'Active Today' },
  ];
  cards.forEach(c => {
    const el = document.getElementById(c.id);
    if (el) animateNumber(el, 0, c.value, c.suffix);
  });
}

// ─── Load Users ───────────────────────────────────────────────────────────────
async function loadUsers() {
  document.getElementById('usersTableBody').innerHTML = `
    <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)">
      <span class="loader"></span>
    </td></tr>`;
  try {
    allUsers = await apiFetch('/admin/users');
    renderUsersTable(allUsers);
  } catch(e) { toast('Failed to load users', 'error'); }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px">
      <div class="empty-state"><div class="es-icon">👤</div><p>No users found</p></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar" style="background:${u.avatar_color||'#00d4ff'};width:36px;height:36px;font-size:0.85rem">
            ${u.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;color:var(--text-primary)">${escHtml(u.name)}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${escHtml(u.email)}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="badge ${u.role==='admin'?'badge-admin':'badge-blue'}">${u.role}</span>
      </td>
      <td style="color:var(--water-primary);font-weight:600">${ml2L(u.daily_goal)}</td>
      <td style="color:var(--text-secondary)">${formatNum(u.total_ml || 0)} ml</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${new Date(u.created_at).toLocaleDateString()}</td>
      <td>
        <div style="display:flex;gap:8px;align-items:center">
          ${u.role !== 'admin' ? `
            <button class="btn btn-ghost btn-sm" onclick="openGoalEdit(${u.id}, '${escHtml(u.name)}', ${u.daily_goal})">
              🎯 Goal
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteUser(${u.id}, '${escHtml(u.name)}')">
              🗑️
            </button>
          ` : '<span style="color:var(--text-muted);font-size:0.8rem">Protected</span>'}
        </div>
      </td>
    </tr>
  `).join('');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Search Users ─────────────────────────────────────────────────────────────
function searchUsers(query) {
  const q = query.toLowerCase().trim();
  const filtered = q ? allUsers.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : allUsers;
  renderUsersTable(filtered);
}

// ─── Delete User ──────────────────────────────────────────────────────────────
let pendingDeleteId = null;

function confirmDeleteUser(id, name) {
  pendingDeleteId = id;
  document.getElementById('deleteUserName').textContent = name;
  openModal('deleteModal');
}

async function executeDelete() {
  if (!pendingDeleteId) return;
  try {
    await apiFetch(`/admin/users/${pendingDeleteId}`, { method: 'DELETE' });
    toast('User deleted successfully', 'success');
    closeModal('deleteModal');
    pendingDeleteId = null;
    await loadUsers();
    await loadAdminStats();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── Edit Goal ────────────────────────────────────────────────────────────────
let editGoalUserId = null;

function openGoalEdit(id, name, currentGoal) {
  editGoalUserId = id;
  document.getElementById('editGoalUserName').textContent = name;
  document.getElementById('editGoalInput').value = currentGoal;
  openModal('goalEditModal');
}

async function saveGoalEdit() {
  const val = parseInt(document.getElementById('editGoalInput').value);
  if (!val || val < 500 || val > 10000) { toast('Goal must be 500–10000 ml', 'error'); return; }
  try {
    await apiFetch(`/admin/users/${editGoalUserId}/goal`, { method:'PUT', body: JSON.stringify({ daily_goal: val }) });
    toast('Goal updated!', 'success');
    closeModal('goalEditModal');
    editGoalUserId = null;
    await loadUsers();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── Platform Daily Chart ─────────────────────────────────────────────────────
function renderPlatformChart(data) {
  const canvas = document.getElementById('platformChart');
  if (!canvas || !data?.length) return;
  if (platformChart) platformChart.destroy();

  const ctx = canvas.getContext('2d');
  platformChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => new Date(d.date).toLocaleDateString([], { month:'short', day:'numeric' })),
      datasets: [{
        label: 'Total Water (L)',
        data: data.map(d => Math.round(d.total_ml / 1000)),
        borderColor: '#00d4ff',
        backgroundColor(c) {
          const { ctx: gCtx, chartArea } = c.chart;
          if (!chartArea) return 'rgba(0,212,255,0.1)';
          const gr = gCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gr.addColorStop(0, 'rgba(0,212,255,0.35)');
          gr.addColorStop(1, 'rgba(0,212,255,0)');
          return gr;
        },
        fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: '#00d4ff', pointBorderColor: '#03071e', pointBorderWidth: 2,
        borderWidth: 2.5
      }, {
        label: 'Active Users',
        data: data.map(d => d.active_users),
        borderColor: '#00ff88',
        backgroundColor: 'transparent',
        fill: false, tension: 0.4, pointRadius: 3,
        pointBackgroundColor: '#00ff88', borderWidth: 2, yAxisID: 'y2'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: { color: 'rgba(232,244,248,0.7)', font: { family:'Outfit', size:11 }, padding: 16, boxWidth: 14, boxHeight: 14 }
        },
        tooltip: {
          backgroundColor:'rgba(10,22,40,0.95)', borderColor:'rgba(0,212,255,0.3)', borderWidth:1,
          titleColor:'#00d4ff', bodyColor:'#90e0ef', padding:14, cornerRadius:12
        }
      },
      scales: {
        x: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'rgba(232,244,248,0.5)',font:{family:'Outfit',size:11}}, border:{display:false} },
        y: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'rgba(232,244,248,0.5)',font:{family:'Outfit',size:11},callback:v=>v+'L'}, border:{display:false}, beginAtZero:true },
        y2: { position:'right', grid:{display:false}, ticks:{color:'rgba(0,255,136,0.5)',font:{family:'Outfit',size:11}}, border:{display:false}, beginAtZero:true }
      }
    }
  });
}

// ─── User Growth Chart ────────────────────────────────────────────────────────
function renderGrowthChart(data) {
  const canvas = document.getElementById('growthChart');
  if (!canvas || !data?.length) return;
  if (growthChart) growthChart.destroy();

  const ctx = canvas.getContext('2d');
  const reversed = [...data].reverse();
  let cumulative = 0;
  const cumData = reversed.map(d => { cumulative += d.count; return cumulative; });

  growthChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: reversed.map(d => new Date(d.date).toLocaleDateString([], { month:'short', day:'numeric' })),
      datasets: [{
        label: 'Total Users',
        data: cumData,
        borderColor: '#48cae4',
        backgroundColor(c) {
          const {ctx:gCtx,chartArea} = c.chart;
          if (!chartArea) return 'rgba(72,202,228,0.1)';
          const gr = gCtx.createLinearGradient(0,chartArea.top,0,chartArea.bottom);
          gr.addColorStop(0,'rgba(72,202,228,0.35)');
          gr.addColorStop(1,'rgba(72,202,228,0)');
          return gr;
        },
        fill:true, tension:0.4, pointRadius:4,
        pointBackgroundColor:'#48cae4', pointBorderColor:'#03071e', pointBorderWidth:2, borderWidth:2.5
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{ labels:{ color:'rgba(232,244,248,0.7)',font:{family:'Outfit',size:11} } },
        tooltip:{ backgroundColor:'rgba(10,22,40,0.95)',borderColor:'rgba(0,212,255,0.3)',borderWidth:1,titleColor:'#00d4ff',bodyColor:'#90e0ef',padding:12,cornerRadius:10 }
      },
      scales: {
        x:{ grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(232,244,248,0.5)',font:{family:'Outfit',size:11}},border:{display:false} },
        y:{ grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'rgba(232,244,248,0.5)',font:{family:'Outfit',size:11},stepSize:1},border:{display:false},beginAtZero:true }
      }
    }
  });
}

// ─── Top Consumers ────────────────────────────────────────────────────────────
function renderTopConsumers(data) {
  const el = document.getElementById('topConsumersList');
  if (!el) return;

  if (!data?.length) {
    el.innerHTML = `<div class="empty-state"><div class="es-icon">🏆</div><p>No data yet</p></div>`;
    return;
  }

  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = data.map((u, i) => `
    <div class="log-item" style="animation-delay:${i*0.06}s">
      <div style="font-size:1.3rem;width:30px;text-align:center">${medals[i]||`${i+1}`}</div>
      <div class="avatar" style="background:${u.avatar_color||'#00d4ff'};width:36px;height:36px;font-size:0.85rem">
        ${u.name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1">
        <div style="font-weight:600;color:var(--text-primary)">${escHtml(u.name)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted)">${u.logs} logs this week</div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;color:var(--water-primary)">${ml2L(u.total_ml)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">7-day total</div>
      </div>
    </div>
  `).join('');
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openModal(id)  { const m = document.getElementById(id); if (m) m.classList.add('active'); }
function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('active'); }

// ─── Nav ──────────────────────────────────────────────────────────────────────
function renderNavUser() {
  const u = getUser();
  if (!u) return;
  const nameEl   = document.getElementById('navName');
  const avatarEl = document.getElementById('navAvatar');
  if (nameEl) nameEl.textContent = u.name;
  if (avatarEl) { avatarEl.style.background = u.avatar_color || '#00ffaa'; avatarEl.textContent = u.name.charAt(0).toUpperCase(); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const u = getUser();
  if (!u || !localStorage.getItem('aq_token')) { window.location.href = 'index.html'; return; }
  if (u.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

  renderNavUser();
  await Promise.all([loadAdminStats(), loadUsers()]);

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('active'); });
  });

  const ls = document.getElementById('loadingScreen');
  if (ls) { ls.classList.add('hidden'); setTimeout(() => ls.remove(), 600); }
}

document.addEventListener('DOMContentLoaded', init);
