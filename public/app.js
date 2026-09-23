document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    readings: [],
    historyRecords: [],
    maxReadings: 25,
    chart: null,
    totalCount: 0,
    isStreaming: false,
    streamTimer: null,
    selectedPreset: 'normal'
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
  const streamToggleBtn = document.getElementById('streamToggleBtn');
  const copyEndpointBtn = document.getElementById('copyEndpoint');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const toastEl = document.getElementById('toast');
  const connectionLabel = document.getElementById('connectionLabel');
  const statusLed = document.getElementById('statusLed');
  const zoneMeterFill = document.getElementById('zoneMeterFill');
  const alertBanner = document.getElementById('alertBanner');
  const alertMessage = document.getElementById('alertMessage');
  const simButtons = document.querySelectorAll('.sim-btn');

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
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 160);
    gradient.addColorStop(0, 'rgba(255, 77, 109, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 77, 109, 0.0)');

    state.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Heart Rate (BPM)',
          data: [],
          borderColor: '#ff4d6d',
          borderWidth: 3,
          tension: 0.35,
          fill: true,
          backgroundColor: gradient,
          pointBackgroundColor: '#ff4d6d',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(18, 24, 38, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#ff4d6d',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: { display: false },
          y: {
            display: true,
            min: 40,
            max: 180,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', font: { size: 10 } }
          }
        }
      }
    });
  }

  // 3. Heart Rate Zone Calculator
  function getHeartRateZone(bpm) {
    if (bpm < 60) return { name: 'RESTING', color: '#3a86ff', bg: 'rgba(58, 134, 255, 0.15)', alert: false };
    if (bpm <= 100) return { name: 'NORMAL', color: '#00f5d4', bg: 'rgba(0, 245, 212, 0.15)', alert: false };
    if (bpm <= 140) return { name: 'CARDIO', color: '#ffb703', bg: 'rgba(255, 183, 3, 0.15)', alert: true, msg: 'Elevated heart rate detected (Cardio Zone).' };
    return { name: 'PEAK', color: '#ff4d6d', bg: 'rgba(255, 77, 109, 0.25)', alert: true, msg: 'Warning: High Heart Rate / Peak Zone reached!' };
  }

  // 4. Process Reading Payload
  function processReading(data) {
    const timestamp = new Date(data.timestamp || Date.now());
    const formattedTime = timestamp.toLocaleTimeString();
    const zone = getHeartRateZone(data.bpm);

    // Update Telemetry Display
    bpmEl.textContent = data.bpm;
    readingStateEl.textContent = `Telemetry active • ${zone.name} zone`;
    readingDotEl.style.background = zone.color;
    lastSeenEl.textContent = formattedTime;
    
    // Status Bar
    connectionLabel.textContent = 'Connected (Live)';
    statusLed.style.background = '#00f5d4';
    statusLed.style.boxShadow = '0 0 10px #00f5d4';

    // Heartbeat Speed Animation
    const beatDuration = (60 / data.bpm).toFixed(2);
    heartIcon.style.animationDuration = `${beatDuration}s`;

    // Zone Badge & Meter
    zoneBadgeEl.textContent = zone.name;
    zoneBadgeEl.style.color = zone.color;
    zoneBadgeEl.style.background = zone.bg;

    const percentage = Math.min(Math.max(((data.bpm - 40) / (180 - 40)) * 100, 5), 100);
    zoneMeterFill.style.width = `${percentage}%`;
    zoneMeterFill.style.background = zone.color;

    // Alert Banner Management
    if (zone.alert) {
      alertMessage.textContent = zone.msg;
      alertBanner.classList.remove('hidden');
    } else {
      alertBanner.classList.add('hidden');
    }

    // Overview Stats
    latestStatEl.innerHTML = `${data.bpm} <small>bpm</small>`;
    latestTimeEl.textContent = formattedTime;
    sourceEl.textContent = data.source || 'Android Client';
    deviceIdEl.textContent = data.deviceId || 'DEV_BLE_SMARTCARE';

    // State Updates
    state.readings.push(data.bpm);
    state.totalCount++;
    countEl.textContent = state.totalCount;

    state.historyRecords.push({
      time: formattedTime,
      bpm: data.bpm,
      source: data.source || 'Android App',
      zone: zone.name
    });

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

    // Append to Table
    addHistoryRow(formattedTime, data.bpm, data.source || 'Android App', zone);
  }

  function addHistoryRow(time, bpm, source, zone) {
    if (state.totalCount === 1) {
      historyTbody.innerHTML = '';
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${time}</td>
      <td><strong>${bpm} bpm</strong></td>
      <td>${source}</td>
      <td><span style="color:${zone.color}; font-weight:700;">${zone.name}</span></td>
    `;

    historyTbody.insertBefore(row, historyTbody.firstChild);

    if (historyTbody.children.length > 12) {
      historyTbody.removeChild(historyTbody.lastChild);
    }
  }

  // 5. Simulator Controls
  simButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      simButtons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.selectedPreset = e.target.getAttribute('data-preset');
    });
  });

  function generatePresetBpm(preset) {
    switch (preset) {
      case 'resting': return Math.floor(Math.random() * 10) + 52;
      case 'cardio': return Math.floor(Math.random() * 20) + 120;
      case 'peak': return Math.floor(Math.random() * 20) + 155;
      case 'normal':
      default: return Math.floor(Math.random() * 15) + 70;
    }
  }

  demoBtn.addEventListener('click', () => {
    const bpm = generatePresetBpm(state.selectedPreset);
    processReading({
      bpm: bpm,
      timestamp: new Date().toISOString(),
      source: 'SIMULATOR',
      deviceId: 'SIM_8E23'
    });
  });

  streamToggleBtn.addEventListener('click', () => {
    state.isStreaming = !state.isStreaming;

    if (state.isStreaming) {
      streamToggleBtn.textContent = 'Stop Stream ⏹';
      streamToggleBtn.classList.add('btn-danger');
      state.streamTimer = setInterval(() => {
        const bpm = generatePresetBpm(state.selectedPreset);
        processReading({
          bpm: bpm,
          timestamp: new Date().toISOString(),
          source: 'SIMULATOR_STREAM',
          deviceId: 'SIM_STREAM'
        });
      }, 1500);
    } else {
      streamToggleBtn.textContent = 'Start Live Stream ⟳';
      streamToggleBtn.classList.remove('btn-danger');
      clearInterval(state.streamTimer);
    }
  });

  // 6. CSV Export Functionality
  exportCsvBtn.addEventListener('click', () => {
    if (state.historyRecords.length === 0) {
      alert('No reading data available to export.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,Time,BPM,Source,Zone\n';
    state.historyRecords.forEach(r => {
      csvContent += `${r.time},${r.bpm},${r.source},${r.zone}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SmartCare_HeartRate_Session_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Copy Endpoint Clipboard Action
  copyEndpointBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('/api/heart-rate').then(() => {
      toastEl.classList.add('show');
      setTimeout(() => toastEl.classList.remove('show'), 2000);
    });
  });

  // Init Chart
  initChart();
});
