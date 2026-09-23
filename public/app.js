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
    eventSource: null
  };

  // UI Element Selectors
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

  // Clock
  function updateClock() {
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString();
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Connection State Status Manager
  function updateConnectionState(status) {
    if (!connectionLabel || !statusLed) return;

    switch (status) {
      case 'connected':
        connectionLabel.textContent = 'Connected (Live)';
        statusLed.style.background = '#00f5d4';
        statusLed.style.boxShadow = '0 0 10px #00f5d4';
        break;
      case 'connecting':
        connectionLabel.textContent = 'Connecting...';
        statusLed.style.background = '#ffb703';
        statusLed.style.boxShadow = '0 0 10px #ffb703';
        break;
      case 'reconnecting':
        connectionLabel.textContent = 'Reconnecting...';
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

  // Chart Setup
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

  // HR Zones
  function getHeartRateZone(bpm) {
    if (bpm < 60) return { name: 'RESTING', color: '#3a86ff', bg: 'rgba(58, 134, 255, 0.15)', alert: false };
    if (bpm <= 100) return { name: 'NORMAL', color: '#00f5d4', bg: 'rgba(0, 245, 212, 0.15)', alert: false };
    if (bpm <= 140) return { name: 'CARDIO', color: '#ffb703', bg: 'rgba(255, 183, 3, 0.15)', alert: true, msg: 'Elevated heart rate detected (Cardio Zone).' };
    return { name: 'PEAK', color: '#ff4d6d', bg: 'rgba(255, 77, 109, 0.25)', alert: true, msg: 'Warning: High Heart Rate / Peak Zone reached!' };
  }

  // Deduplicated Reading Handler
  function processReading(data) {
    if (!data || typeof data.bpm !== 'number' || isNaN(data.bpm)) return;

    // Deduplication check
    const readingId = data.id || `${data.timestamp}_${data.bpm}_${data.source}`;
    if (state.seenIds.has(readingId)) return;
    state.seenIds.add(readingId);

    const timestamp = new Date(data.timestamp || Date.now());
    const formattedTime = timestamp.toLocaleTimeString();
    const zone = getHeartRateZone(data.bpm);

    if (bpmEl) bpmEl.textContent = data.bpm;
    if (readingStateEl) readingStateEl.textContent = `Telemetry active • ${zone.name} zone`;
    if (readingDotEl) readingDotEl.style.background = zone.color;
    if (lastSeenEl) lastSeenEl.textContent = formattedTime;

    if (heartIcon) {
      const beatDuration = (60 / data.bpm).toFixed(2);
      heartIcon.style.animationDuration = `${beatDuration}s`;
    }

    if (zoneBadgeEl) {
      zoneBadgeEl.textContent = zone.name;
      zoneBadgeEl.style.color = zone.color;
      zoneBadgeEl.style.background = zone.bg;
    }

    if (zoneMeterFill) {
      const percentage = Math.min(Math.max(((data.bpm - 40) / (180 - 40)) * 100, 5), 100);
      zoneMeterFill.style.width = `${percentage}%`;
      zoneMeterFill.style.background = zone.color;
    }

    if (alertBanner && alertMessage) {
      if (zone.alert) {
        alertMessage.textContent = zone.msg;
        alertBanner.classList.remove('hidden');
      } else {
        alertBanner.classList.add('hidden');
      }
    }

    if (latestStatEl) latestStatEl.innerHTML = `${data.bpm} <small>bpm</small>`;
    if (latestTimeEl) latestTimeEl.textContent = formattedTime;
    if (sourceEl) sourceEl.textContent = data.source || 'Android Client';
    if (deviceIdEl) deviceIdEl.textContent = data.deviceId || 'DEV_BLE_SMARTCARE';

    state.readings.push(data.bpm);
    state.totalCount++;
    if (countEl) countEl.textContent = state.totalCount;

    state.historyRecords.push({
      time: formattedTime,
      bpm: data.bpm,
      source: data.source || 'Android App',
      zone: zone.name
    });

    const min = Math.min(...state.readings);
    const max = Math.max(...state.readings);
    const avg = Math.round(state.readings.reduce((a, b) => a + b, 0) / state.readings.length);

    if (minBpmEl) minBpmEl.textContent = min;
    if (maxBpmEl) maxBpmEl.textContent = max;
    if (avgBpmEl) avgBpmEl.textContent = avg;

    if (state.chart) {
      state.chart.data.labels.push(formattedTime);
      state.chart.data.datasets[0].data.push(data.bpm);

      if (state.chart.data.labels.length > state.maxReadings) {
        state.chart.data.labels.shift();
        state.chart.data.datasets[0].data.shift();
      }
      state.chart.update();
    }

    addHistoryRow(formattedTime, data.bpm, data.source || 'Android App', zone);
  }

  function addHistoryRow(time, bpm, source, zone) {
    if (!historyTbody) return;
    if (state.totalCount === 1) historyTbody.innerHTML = '';

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

  // Step 1 & 3: Initial REST Sync & SSE Connection
  async function initBackendConnection() {
    updateConnectionState('connecting');

    try {
      // Hydrate Initial Reading History
      const res = await fetch('/api/readings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          json.data.forEach(reading => processReading(reading));
        } else {
          if (readingStateEl) readingStateEl.textContent = 'Waiting for the first real heart-rate reading.';
        }
      }
    } catch (err) {
      console.warn('Initial telemetry fetch failed:', err);
    }

    // Connect Server-Sent Events (SSE) Stream
    connectSSE();
  }

  function connectSSE() {
    if (state.eventSource) {
      state.eventSource.close();
    }

    state.eventSource = new EventSource('/api/live');

    state.eventSource.addEventListener('ready', (e) => {
      updateConnectionState('connected');
      try {
        const payload = JSON.parse(e.data);
        if (payload.latestReading) {
          processReading(payload.latestReading);
        }
      } catch (err) {
        console.error('Failed to parse ready SSE payload:', err);
      }
    });

    state.eventSource.addEventListener('heart-rate', (e) => {
      try {
        const reading = JSON.parse(e.data);
        processReading(reading);
      } catch (err) {
        console.error('Failed to parse heart-rate event payload:', err);
      }
    });

    state.eventSource.onerror = () => {
      updateConnectionState('reconnecting');
      state.eventSource.close();
      setTimeout(connectSSE, 5000);
    };
  }

  // Simulator Actions
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
      const payload = {
        bpm: generatePresetBpm(state.selectedPreset),
        timestamp: new Date().toISOString(),
        source: '[SIMULATOR]',
        deviceId: 'SIM_8E23'
      };

      try {
        await fetch('/api/heart-rate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        // Fallback local processing if offline
        processReading({ ...payload, id: `sim_${Date.now()}` });
      }
    });
  }

  if (streamToggleBtn) {
    streamToggleBtn.addEventListener('click', () => {
      state.isStreaming = !state.isStreaming;

      if (state.isStreaming) {
        streamToggleBtn.textContent = 'Stop Stream ⏹';
        streamToggleBtn.classList.add('btn-danger');
        state.streamTimer = setInterval(async () => {
          const payload = {
            bpm: generatePresetBpm(state.selectedPreset),
            timestamp: new Date().toISOString(),
            source: '[SIMULATOR_STREAM]',
            deviceId: 'SIM_STREAM'
          };
          try {
            await fetch('/api/heart-rate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } catch (err) {
            processReading({ ...payload, id: `sim_${Date.now()}` });
          }
        }, 2000);
      } else {
        streamToggleBtn.textContent = 'Start Live Stream ⟳';
        streamToggleBtn.classList.remove('btn-danger');
        clearInterval(state.streamTimer);
      }
    });
  }

  // CSV Export
  if (exportCsvBtn) {
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
  }

  // Copy Endpoint
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

  // App Boot
  initChart();
  initBackendConnection();
});
