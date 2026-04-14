// ─── Config ──────────────────────────────────────────────────────────────────
const API = 'http://localhost:3000/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const token = () => localStorage.getItem('aq_token');
const setToken = (t) => localStorage.setItem('aq_token', t);
const setUser  = (u) => localStorage.setItem('aq_user', JSON.stringify(u));
const getUser  = () => JSON.parse(localStorage.getItem('aq_user') || 'null');
const clearAuth = () => { localStorage.removeItem('aq_token'); localStorage.removeItem('aq_user'); };

async function apiPost(endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: '💧' };
  toast.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 400); }, 3000);
}

// ─── Form Toggle ─────────────────────────────────────────────────────────────
let isLogin = true;

function toggleForm() {
  isLogin = !isLogin;
  const loginCard  = document.getElementById('login-card');
  const regCard    = document.getElementById('register-card');
  if (isLogin) {
    loginCard.style.display = 'block';
    regCard.style.display   = 'none';
    loginCard.classList.add('form-switch');
    setTimeout(() => loginCard.classList.remove('form-switch'), 400);
  } else {
    loginCard.style.display = 'none';
    regCard.style.display   = 'block';
    regCard.classList.add('form-switch');
    setTimeout(() => regCard.classList.remove('form-switch'), 400);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn   = document.getElementById('login-btn');
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;

  btn.innerHTML = '<span class="loader"></span> Signing in…';
  btn.disabled = true;

  try {
    const data = await apiPost('/auth/login', { email, password: pass });
    setToken(data.token);
    setUser(data.user);
    showToast(`Welcome back, ${data.user.name}! 🌊`, 'success');
    setTimeout(() => {
      window.location.href = data.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
    }, 800);
  } catch (err) {
    showToast(err.message, 'error');
    btn.innerHTML = '🌊 Sign In';
    btn.disabled = false;
  }
}

// ─── Register ─────────────────────────────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  const btn   = document.getElementById('reg-btn');
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const conf  = document.getElementById('reg-confirm').value;

  if (pass !== conf) { showToast('Passwords do not match', 'error'); return; }
  if (pass.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

  btn.innerHTML = '<span class="loader"></span> Creating account…';
  btn.disabled = true;

  try {
    const data = await apiPost('/auth/register', { name, email, password: pass });
    setToken(data.token);
    setUser(data.user);
    showToast(`Account created! Welcome, ${data.user.name}! 💧`, 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
  } catch (err) {
    showToast(err.message, 'error');
    btn.innerHTML = '🚀 Create Account';
    btn.disabled = false;
  }
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
function requireAuth(adminOnly = false) {
  const t = token();
  const u = getUser();
  if (!t || !u) { window.location.href = 'index.html'; return false; }
  if (adminOnly && u.role !== 'admin') { window.location.href = 'dashboard.html'; return false; }
  return true;
}

function logout() {
  clearAuth();
  window.location.href = 'index.html';
}

// ─── Canvas Background ────────────────────────────────────────────────────────
function initCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function Particle() {
    this.reset = function() {
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.r  = Math.random() * 2.5 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.a  = Math.random() * 0.4 + 0.1;
    };
    this.reset();
  }

  function init() { particles = Array.from({ length: 80 }, () => new Particle()); }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Deep ocean gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0,   '#03071e');
    grad.addColorStop(0.5, '#0a1628');
    grad.addColorStop(1,   '#050d1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Glowing orbs
    [[W*0.2, H*0.3, 300, '0,212,255'], [W*0.8, H*0.6, 250, '0,150,199'], [W*0.5, H*0.1, 200, '72,202,228']].forEach(([x, y, r, c]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c},0.07)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
    });

    // Particles
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(0,212,255,${p.a})`;
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) p.reset();
    });

    requestAnimationFrame(draw);
  }

  resize();
  init();
  draw();
  window.addEventListener('resize', () => { resize(); init(); });
}

// ─── Ripple ───────────────────────────────────────────────────────────────────
function addRipple(e) {
  const btn  = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const rip  = document.createElement('span');
  rip.className = 'ripple-effect';
  const size = Math.max(btn.offsetWidth, btn.offsetHeight);
  rip.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px`;
  btn.style.position = 'relative'; btn.style.overflow = 'hidden';
  btn.appendChild(rip);
  setTimeout(() => rip.remove(), 700);
}

// Init on page load
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();

  // Redirect logged-in users away from auth page
  if (document.getElementById('login-card')) {
    const t = token(); const u = getUser();
    if (t && u) { window.location.href = u.role === 'admin' ? 'admin.html' : 'dashboard.html'; }
  }

  // Attach form handlers
  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const regForm = document.getElementById('register-form');
  if (regForm) regForm.addEventListener('submit', handleRegister);

  // Ripple on all buttons
  document.querySelectorAll('.btn, .quick-log-btn').forEach(b => b.addEventListener('click', addRipple));
});
