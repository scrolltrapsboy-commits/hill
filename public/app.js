document.addEventListener('DOMContentLoaded', () => {
  const state = {
    readings: [],
    historyRecords: [],
    seenIds: new Set(),
    maxReadings: 25,
    chart: null,
    totalCount: 0,
    isStreaming: false,
    streamTimer: null,
    selectedPreset: 'normal',
    eventSource: null,
    lastReadingTime: null
  };

  // Element Cache
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
  const simButtons = document.querySelectorAll('.sim-btn');

  // Local Clock
  function updateClock() {
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString();
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Monitor stale readings (>2 mins)
  setInterval(checkStaleStatus, 5000);

  function checkStaleStatus() {
    if (!state.lastReadingTime) return;
    const elapsedMs = Date.now() - state.lastReadingTime;
    
    if (elapsedMs > 120000) {
      if (readingStateEl) readingStateEl.textContent = 'No fresh smartwatch measurement received.';
      if (readingDotEl) readingDotEl.style.background = '#64748b';
      if (heartIcon) heartIcon.style.animationDuration = '0s';
    }
  }

  function updateConnectionState(status) {
    if (!connectionLabel || !statusLed) return;
    switch (status) {
      case 'connected':
        connectionLabel.textContent = 'Connected (Live)';
        statusLed.style.background = '#00f5d4';
        statusLed.style.boxShadow = '0 0 10px #00f5d4';
        break;
      case 'connecting':
      case 'reconnecting':
        connectionLabel.textContent = status === 'connecting' ? 'Connecting...' : 'Reconnecting...';
        statusLed.style.background = '#ffb703';
        statusLed.style.boxShadow = '0 0 10px #ffb703';
        break;
      case 'failed':
      case 'disconnected':
        connectionLabel.textContent = 'Disconnected';
        statusLed.style.background = '#ff4d6d';
        statusLed.style.boxShadow = '0 0 10px #ff4d6d';
        break;
    }
  }

  // Setup Chart.js
  function initChart() {
    const canvas = document.getElementById('chartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
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
        animation: { duration: 200 },
        plugins: {
          legend: { display: false }
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

  // Process and Deduplicate Ingested Reading
  function processReading(data) {
    if (!data || typeof data.bpm !== 'number' || isNaN(data.bpm)) return;

    // Deduplication check
    const uniqueId = data.id || `${data.timestamp}_${data.bpm}_${data.deviceId || 'unk'}`;
    if (state.seenIds.has(uniqueId)) return;
    state.seenIds.add(uniqueId);

    const timestamp = new Date(data.timestamp || Date.now());
    const formattedTime = timestamp.toLocaleTimeString();
    state.lastReadingTime = timestamp.getTime();

    const isRealWatch = data.sourceType === 'REAL_WATCH';
    const sourceLabel = isRealWatch ? `${data.source} [WATCH]` : `${data.source || 'Simulated'}`;

    if (bpmEl) bpmEl.textContent = data.bpm;
    if (readingStateEl) {
      readingStateEl.textContent = isRealWatch 
        ? `Live Telemetry Active (${data.sourceType})` 
        : `Telemetry Received (${data.sourceType || 'UNVERIFIED'})`;
    }

    if (lastSeenEl) lastSeenEl.textContent = formattedTime;
    if (latestStatEl) latestStatEl.innerHTML = `${data.bpm} <small>bpm</small>`;
    if (latestTimeEl) latestTimeEl.textContent = formattedTime;
    if (sourceEl) sourceEl.textContent = sourceLabel;
    if (deviceIdEl) deviceIdEl.textContent = data.deviceId || 'DEV_UNKNOWN';

    if (heartIcon) {
      const beatDuration = (60 / data.bpm).toFixed(2);
      heartIcon.style.animationDuration = `${beatDuration}s`;
    }

    // Accumulate unique counts
    state.readings.push(data.bpm);
    state.totalCount++;
    if (countEl) countEl.textContent = state.totalCount;

    state.historyRecords.push({
      time: formattedTime,
      bpm: data.bpm,
      source: sourceLabel,
      type: data.sourceType || 'UNVERIFIED'
    });

    // Recalculate Min, Max, Avg
    const min = Math.min(...state.readings);
    const max = Math.max(...state.readings);
    const avg = Math.round(state.readings.reduce((a, b) => a + b, 0) / state.readings.length);

    if (minBpmEl) minBpmEl.textContent = min;
    if (maxBpmEl) maxBpmEl.textContent = max;
    if (avgBpmEl) avgBpmEl.textContent = avg;

    // Update Chart
    if (state.chart) {
      state.chart.data.labels.push(formattedTime);
      state.chart.data.datasets[0].data.push(data.bpm);
      if (state.chart.data.labels.length > state.maxReadings) {
        state.chart.data.labels.shift();
        state.chart.data.datasets[0].data.shift();
      }
      state.chart.update();
    }

    addHistoryRow(formattedTime, data.bpm, sourceLabel, data.sourceType);
  }

  function addHistoryRow(time, bpm, source, sourceType) {
    if (!historyTbody) return;
    if (state.totalCount === 1) historyTbody.innerHTML = '';

    const typeColor = sourceType === 'REAL_WATCH' ? '#00f5d4' : (sourceType === 'SIMULATOR' ? '#ffb703' : '#94a3b8');

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${time}</td>
      <td><strong>${bpm} bpm</strong></td>
      <td>${source}</td>
      <td><span style="color:${typeColor}; font-weight:700;">${sourceType || 'UNVERIFIED'}</span></td>
    `;

    historyTbody.insertBefore(row, historyTbody.firstChild);
    if (historyTbody.children.length > 15) {
      historyTbody.removeChild(historyTbody.lastChild);
    }
  }

  // App Initialization & Backend Handshake
  async function init() {
    updateConnectionState('connecting');

    try {
      const res = await fetch('/api/readings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          json.data.forEach(r => processReading(r));
        } else {
          if (readingStateEl) readingStateEl.textContent = 'Waiting for the first real heart-rate reading.';
        }
      }
    } catch (err) {
      console.warn('Failed to load initial history:', err);
    }

    // Connect SSE
    if (state.eventSource) state.eventSource.close();
    state.eventSource = new EventSource('/api/live');

    state.eventSource.addEventListener('ready', () => {
      updateConnectionState('connected');
    });

    state.eventSource.addEventListener('heart-rate', (e) => {
      try {
        processReading(JSON.parse(e.data));
      } catch (err) {
        console.error('Invalid SSE payload:', err);
      }
    });

    state.eventSource.onerror = () => {
      updateConnectionState('reconnecting');
      state.eventSource.close();
      setTimeout(init, 5000);
    };
  }

  // Simulator Controls
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

  if (demoBtn) {
    demoBtn.addEventListener('click', async () => {
      await fetch('/api/heart-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bpm: generatePresetBpm(state.selectedPreset),
          timestamp: new Date().toISOString(),
          source: 'WEB_SIMULATOR',
          isSimulator: true,
          deviceId: 'SIM_CLIENT'
        })
      });
    });
  }

  if (streamToggleBtn) {
    streamToggleBtn.addEventListener('click', () => {
      state.isStreaming = !state.isStreaming;

      if (state.isStreaming) {
        streamToggleBtn.textContent = 'Stop Stream ⏹';
        streamToggleBtn.classList.add('btn-danger');
        state.streamTimer = setInterval(async () => {
          await fetch('/api/heart-rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bpm: generatePresetBpm(state.selectedPreset),
              timestamp: new Date().toISOString(),
              source: 'WEB_SIMULATOR',
              isSimulator: true,
              deviceId: 'SIM_STREAM'
            })
          });
        }, 2000);
      } else {
        streamToggleBtn.textContent = 'Start Live Stream ⟳';
        streamToggleBtn.classList.remove('btn-danger');
        clearInterval(state.streamTimer);
      }
    });
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (state.historyRecords.length === 0) {
        alert('No data available to export.');
        return;
      }
      let csvContent = 'data:text/csv;charset=utf-8,Time,BPM,Source,Type\n';
      state.historyRecords.forEach(r => {
        csvContent += `${r.time},${r.bpm},${r.source},${r.type}\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `SmartCare_Session_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  if (copyEndpointBtn) {
    copyEndpointBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('/api/heart-rate').then(() => {
        if (toastEl) {
          toastEl.classList.add('show');
          setTimeout(() => toastEl.classList.remove('show'), 2000);
        }
      });
    });
  }

  initChart();
  init();
});
