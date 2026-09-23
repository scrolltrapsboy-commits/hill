document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    readings: [],
    maxReadings: 20,
    chart: null,
    totalCount: 0
  };

  // DOM Elements
  const bpmEl = document.getElementById('bpm');
  const zoneBadgeEl = document.getElementById('zoneBadge');
  const readingStateEl = document.getElementById('readingState');
  const readingDotEl = document.getElementById('readingDot');
  const lastSeenEl = document.getElementById('lastSeen');
  const minBpmEl = document.getElementById('minBpm');
  const maxBpmEl = document.getElementById('maxBpm');
  const avgBpmEl = document.getElementById('avgBpm');
  const latestStatEl = document.getElementById('latestStat');
  const latestTimeEl = document.getElementById('latestTime');
  const countEl = document.getElementById('count');
  const sourceEl = document.getElementById('source');
  const deviceIdEl = document.getElementById('deviceId');
  const historyTbody = document.getElementById('history');
  const clockEl = document.getElementById('clock');
  const heartIcon = document.getElementById('heartIcon');
  const demoBtn = document.getElementById('demoBtn');
  const copyEndpointBtn = document.getElementById('copyEndpoint');
  const toastEl = document.getElementById('toast');
  const connectionLabel = document.getElementById('connectionLabel');
  const statusLed = document.getElementById('statusLed');

  // 1. Clock Updates
  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString();
  }
  setInterval(updateClock, 1000);
  updateClock();

  // 2. Initialize Chart.js
  function initChart() {
    const ctx = document.getElementById('chartCanvas').getContext('2d');
    
    // Gradient fill under the line chart
    const gradient = ctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(255, 77, 109, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 77, 109, 0.0)');

    state.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'BPM',
          data: [],
          borderColor: '#ff4d6d',
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          backgroundColor: gradient,
          pointBackgroundColor: '#ff4d6d',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#121824',
            titleColor: '#f8fafc',
            bodyColor: '#ff4d6d',
            displayColors: false,
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: { display: false },
          y: {
            display: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', font: { size: 10 } }
          }
        }
      }
    });
  }

  // 3. Heart Rate Zone Classification
  function getHeartRateZone(bpm) {
    if (bpm < 60) return { name: 'RESTING', color: '#3a86ff', bg: 'rgba(58, 134, 255, 0.15)' };
    if (bpm <= 100) return { name: 'NORMAL', color: '#00f5d4', bg: 'rgba(0, 245, 212, 0.15)' };
    if (bpm <= 140) return { name: 'CARDIO', color: '#ffb703', bg: 'rgba(255, 183, 3, 0.15)' };
    return { name: 'PEAK', color: '#ff4d6d', bg: 'rgba(255, 77, 109, 0.2)' };
  }

  // 4. Ingest Reading Function
  function processReading(data) {
    const timestamp = new Date(data.timestamp || Date.now());
    const formattedTime = timestamp.toLocaleTimeString();
    const zone = getHeartRateZone(data.bpm);

    // Update UI elements
    bpmEl.textContent = data.bpm;
    readingStateEl.textContent = `Telemetry active • ${zone.name} zone`;
    readingDotEl.style.background = zone.color;
    lastSeenEl.textContent = formattedTime;
    
    // Update Connection Status Bar
    connectionLabel.textContent = 'Connected';
    statusLed.style.background = '#00f5d4';
    statusLed.style.boxShadow = '0 0 10px #00f5d4';

    // Heartbeat Speed Adjustment
    const beatDuration = (60 / data.bpm).toFixed(2);
    heartIcon.style.animationDuration = `${beatDuration}s`;

    // Zone Badge
    zoneBadgeEl.textContent = zone.name;
    zoneBadgeEl.style.color = zone.color;
    zoneBadgeEl.style.background = zone.bg;

    // Overview Stats
    latestStatEl.innerHTML = `${data.bpm} <small>bpm</small>`;
    latestTimeEl.textContent = formattedTime;
    sourceEl.textContent = data.source || 'Android Client';
    deviceIdEl.textContent = data.deviceId || 'DEV_BLE_SMARTCARE';

    // Store State
    state.readings.push(data.bpm);
    state.totalCount++;
    countEl.textContent = state.totalCount;

    // Min / Max / Avg Math
    const min = Math.min(...state.readings);
    const max = Math.max(...state.readings);
    const avg = Math.round(state.readings.reduce((a, b) => a + b, 0) / state.readings.length);

    minBpmEl.textContent = min;
    maxBpmEl.textContent = max;
    avgBpmEl.textContent = avg;

    // Update Chart
    state.chart.data.labels.push(formattedTime);
    state.chart.data.datasets[0].data.push(data.bpm);

    if (state.chart.data.labels.length > state.maxReadings) {
      state.chart.data.labels.shift();
      state.chart.data.datasets[0].data.shift();
    }
    state.chart.update();

    // History Table Append
    addHistoryRow(formattedTime, data.bpm, data.source || 'Android App', zone);
  }

  function addHistoryRow(time, bpm, source, zone) {
    if (state.totalCount === 1) {
      historyTbody.innerHTML = ''; // Clear empty state on first reading
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${time}</td>
      <td><strong>${bpm} bpm</strong></td>
      <td>${source}</td>
      <td><span style="color:${zone.color}; font-weight:700;">${zone.name}</span></td>
    `;

    historyTbody.insertBefore(row, historyTbody.firstChild);

    // Keep table limited to last 12
    if (historyTbody.children.length > 12) {
      historyTbody.removeChild(historyTbody.lastChild);
    }
  }

  // 5. Button Actions
  demoBtn.addEventListener('click', () => {
    const randomBpm = Math.floor(Math.random() * (135 - 62 + 1)) + 62;
    processReading({
      bpm: randomBpm,
      timestamp: new Date().toISOString(),
      source: 'DEMO_SIMULATOR',
      deviceId: 'SIM_8E23'
    });
  });

  copyEndpointBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('/api/heart-rate').then(() => {
      toastEl.classList.add('show');
      setTimeout(() => toastEl.classList.remove('show'), 2000);
    });
  });

  // Init
  initChart();
});
