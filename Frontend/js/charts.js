// ─── Chart.js Instances ───────────────────────────────────────────────────────
let historyChart = null;
let donutChart   = null;
let hourlyChart  = null;
let drinkChart   = null;

const OCEAN_COLORS = ['#00d4ff','#0096c7','#48cae4','#90e0ef','#00b4d8','#caf0f8','#023e8a','#0077b6'];

function oceanGradient(ctx, chartArea, from, to) {
  const grad = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  return grad;
}

// ─── History Bar Chart (7/14/30 day) ─────────────────────────────────────────
function initHistoryChart() {
  const canvas = document.getElementById('historyChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  historyChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: [], datasets: [{
      label: 'Water Intake (ml)',
      data: [],
      backgroundColor(c) {
        const chart = c.chart;
        const { ctx: gCtx, chartArea } = chart;
        if (!chartArea) return 'rgba(0,212,255,0.5)';
        const grad = gCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
        grad.addColorStop(0, 'rgba(0,150,199,0.7)');
        grad.addColorStop(1, 'rgba(0,212,255,0.95)');
        return grad;
      },
      borderColor: 'rgba(0,212,255,0.9)',
      borderWidth: 0,
      borderRadius: { topLeft: 8, topRight: 8 },
      borderSkipped: false,
    }, {
      label: 'Goal', type: 'line',
      data: [],
      borderColor: 'rgba(255,179,71,0.6)',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0,
      order: 0
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,22,40,0.95)',
          borderColor: 'rgba(0,212,255,0.3)',
          borderWidth: 1,
          titleColor: '#00d4ff',
          bodyColor: '#90e0ef',
          padding: 14,
          cornerRadius: 12,
          callbacks: {
            label: (c) => `${c.dataset.label}: ${c.parsed.y >= 1000 ? (c.parsed.y/1000).toFixed(1)+'L' : c.parsed.y+'ml'}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: { color: 'rgba(232,244,248,0.5)', font: { family: 'Outfit', size: 11 },
            callback(v, i) {
              const lbl = this.getLabelForValue(v);
              const d = new Date(lbl);
              return d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
            }
          },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: { color: 'rgba(232,244,248,0.5)', font: { family: 'Outfit', size: 11 },
            callback: (v) => v >= 1000 ? v/1000+'L' : v+'ml'
          },
          border: { display: false },
          beginAtZero: true
        }
      }
    }
  });
}

// ─── Update History Chart ─────────────────────────────────────────────────────
window.updateHistoryChart = function(data) {
  if (!historyChart) initHistoryChart();
  if (!historyChart || !data?.length) return;

  historyChart.data.labels = data.map(d => d.date);
  historyChart.data.datasets[0].data = data.map(d => d.total_ml);
  historyChart.data.datasets[1].data = data.map(d => d.goal_ml);

  // Color bars: green if goal met, blue otherwise
  historyChart.data.datasets[0].backgroundColor = data.map(d => {
    return d.achieved
      ? 'rgba(0,255,136,0.85)'  // will use default gradient
      : (ctx) => {
          const chart = ctx.chart;
          const { ctx: gCtx, chartArea } = chart;
          if (!chartArea) return 'rgba(0,212,255,0.6)';
          const grad = gCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          grad.addColorStop(0, d.achieved ? 'rgba(0,255,136,0.5)' : 'rgba(0,150,199,0.7)');
          grad.addColorStop(1, d.achieved ? 'rgba(0,255,136,0.9)' : 'rgba(0,212,255,0.95)');
          return grad;
        };
  });

  // Use simpler coloring
  historyChart.data.datasets[0].backgroundColor = function(c) {
    const chart = c.chart;
    const { ctx: gCtx, chartArea } = chart;
    if (!chartArea) return 'rgba(0,212,255,0.6)';
    const d = data[c.dataIndex];
    const grad = gCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    if (d?.achieved) {
      grad.addColorStop(0, 'rgba(0,200,100,0.6)');
      grad.addColorStop(1, 'rgba(0,255,136,0.9)');
    } else {
      grad.addColorStop(0, 'rgba(0,150,199,0.7)');
      grad.addColorStop(1, 'rgba(0,212,255,0.95)');
    }
    return grad;
  };

  historyChart.update('active');
};

// ─── Weekly Donut Chart ───────────────────────────────────────────────────────
function initDonutChart(data) {
  const canvas = document.getElementById('donutChart');
  if (!canvas || !data?.length) return;

  const labels = data.map(d => { const date = new Date(d.date); return date.toLocaleDateString([], {weekday:'short'}); });
  const values = data.map(d => d.total_ml);
  const goals  = data.map(d => d.goal_ml);
  const achieved = values.filter((v, i) => v >= goals[i]).length;

  if (donutChart) donutChart.destroy();

  const ctx = canvas.getContext('2d');
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values.map(v => Math.max(v, 50)), // min slice for visibility
        backgroundColor: values.map((v, i) =>
          v >= goals[i] ? 'rgba(0,255,136,0.85)' : OCEAN_COLORS[i % OCEAN_COLORS.length]
        ),
        borderColor: 'rgba(3,7,30,0.5)',
        borderWidth: 2,
        hoverOffset: 12
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: 'rgba(232,244,248,0.7)', font: { family: 'Outfit', size: 11 }, padding: 12, boxWidth: 12, boxHeight: 12 }
        },
        tooltip: {
          backgroundColor: 'rgba(10,22,40,0.95)',
          borderColor: 'rgba(0,212,255,0.3)', borderWidth: 1,
          titleColor: '#00d4ff', bodyColor: '#90e0ef',
          padding: 14, cornerRadius: 12,
          callbacks: {
            label: (c) => ` ${c.parsed >= 1000 ? (c.parsed/1000).toFixed(1)+'L' : c.parsed+'ml'}`
          }
        }
      }
    },
    plugins: [{
      id: 'centerText',
      afterDraw(chart) {
        const { ctx: gCtx, chartArea: { top, bottom, left, right } } = chart;
        const cx = (left + right) / 2, cy = (top + bottom) / 2;
        gCtx.save();
        gCtx.textAlign = 'center'; gCtx.textBaseline = 'middle';
        gCtx.fillStyle = '#00d4ff';
        gCtx.font = `800 2rem Outfit`;
        gCtx.fillText(`${achieved}/7`, cx, cy - 10);
        gCtx.fillStyle = 'rgba(232,244,248,0.5)';
        gCtx.font = `500 0.75rem Outfit`;
        gCtx.fillText('goals met', cx, cy + 16);
        gCtx.restore();
      }
    }]
  });
}

// ─── Hourly Distribution Chart ────────────────────────────────────────────────
function initHourlyChart(data) {
  const canvas = document.getElementById('hourlyChart');
  if (!canvas) return;
  if (hourlyChart) hourlyChart.destroy();

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2,'0'));
  const values = hours.map(h => {
    const found = data?.find(d => d.hour === h);
    return found ? found.total_ml : 0;
  });

  const ctx = canvas.getContext('2d');
  hourlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hours.map(h => {
        const n = parseInt(h);
        return n === 0 ? '12am' : n < 12 ? `${n}am` : n === 12 ? '12pm' : `${n-12}pm`;
      }),
      datasets: [{
        label: 'Intake (ml)',
        data: values,
        backgroundColor: (c) => {
          const chart = c.chart;
          const { ctx: gCtx, chartArea } = chart;
          if (!chartArea) return 'rgba(0,212,255,0.5)';
          const grad = gCtx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          grad.addColorStop(0, 'rgba(0,150,199,0.4)');
          grad.addColorStop(1, 'rgba(0,212,255,0.8)');
          return grad;
        },
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,22,40,0.95)',
          borderColor: 'rgba(0,212,255,0.3)', borderWidth: 1,
          titleColor: '#00d4ff', bodyColor: '#90e0ef', padding: 10, cornerRadius: 10
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(232,244,248,0.4)', font: { family:'Outfit', size:9 }, maxRotation: 0 }, border: { display: false } },
        y: { display: false, beginAtZero: true }
      }
    }
  });
}

window.updateHourlyChart = function(data) {
  initHourlyChart(data);
};

// ─── Init Charts ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('historyChart')) initHistoryChart();
});
