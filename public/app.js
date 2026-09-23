document.addEventListener('DOMContentLoaded', () => {
  const state = {
    readings: [],
    historyRecords: [],
    seenIds: new Set(),
    maxReadings: 25,
    chart: null,
    totalCount: 0,
    eventSource: null,
    lastReadingTimestamp: null
  };

  // Element Selectors
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
  const copyEndpointBtn = document.getElementById('copyEndpoint');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const toastEl = document.getElementById('toast');
  const connectionLabel = document.getElementById('connectionLabel');
  const statusLed = document.getElementById('statusLed');
  const zoneMeterFill = document.getElementById('zoneMeterFill');
  const alertBanner = document.getElementById('alertBanner');
  const alertMessage = document.getElementById('alertMessage');

  // Local Clock
  function updateClock() {
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString();
  }
  setInterval(updateClock, 1000);
  updateClock();

  // Freshness & Stale Checker (Triggers after 2 minutes of no new smartwatch data)
  setInterval(checkFreshness, 5000);

  function checkFreshness() {
    if (!state.lastReadingTimestamp) return;
    const elapsed = Date.now() - state.lastReadingTimestamp;

    if (elapsed > 120000) { // > 2 minutes
      if (readingStateEl) readingStateEl.textContent = 'No fresh smartwatch measurement received.';
      if (readingDotEl) readingDotEl.style.background = '#64748b';
      if (heartIcon) heartIcon.style.animationDuration = '0s';
    }
  }

  function updateBackendConnectionState(status) {
    if (!connectionLabel || !statusLed) return;
    switch (status) {
      case 'connected':
        connectionLabel.textContent = 'Server Connected';
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
        connectionLabel.textContent = 'Server Offline';
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

  function getHeartRateZone(bpm) {
    if (bpm < 60) return { name: 'RESTING', color: '#3a86ff', bg: 'rgba(58, 134, 255, 0.15)', alert: false };
    if (bpm <= 100) return { name: 'NORMAL', color: '#00f5d4', bg: 'rgba(0, 245, 212, 0.15)', alert: false };
    if (bpm <= 140) return { name: 'CARDIO', color: '#ffb703', bg: 'rgba(255, 183, 3, 0.15)', alert: true, msg: 'Elevated Heart Rate (Cardio Zone)' };
    return { name: 'PEAK', color: '#ff4d6d', bg: 'rgba(255, 77, 109, 0.25)', alert: true, msg: 'High Heart Rate Warning (Peak Zone)' };
  }

  // Process ONLY Genuine Android Telemetry
  function processGenuineReading(data) {
    if (!data || typeof data.bpm !== 'number' || isNaN(data.bpm)) return;
    if (data.sourceType !== 'REAL_WATCH') return; // Strict Frontend Filter

    // Unique Identifier Deduplication
    const uniqueId = data.id || `${data.timestamp}_${data.bpm}_${data.deviceId}`;
    if (state.seenIds.has(uniqueId)) return;
    state.seenIds.add(uniqueId);

    const timestamp = new Date(data.timestamp || Date.now());
    const formattedTime = timestamp.toLocaleTimeString();
    state.lastReadingTimestamp = timestamp.getTime();

    const zone = getHeartRateZone(data.bpm);

    if (bpmEl) bpmEl.textContent = data.bpm;
    if (readingStateEl) readingStateEl.textContent = `Genuine Android Reading Received (${zone.name})`;
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
    if (sourceEl) sourceEl.textContent = data.source || 'PRISM_8E23';
    if (deviceIdEl) deviceIdEl.textContent = data.deviceId || 'PRISM_8E23';

    // Increment Genuine Totals
    state.readings.push(data.bpm);
    state.totalCount++;
    if (countEl) countEl.textContent = state.totalCount;

    state.historyRecords.push({
      time: formattedTime,
      bpm: data.bpm,
      source: data.source || 'PRISM_8E23',
      status: 'VERIFIED_WATCH'
    });

    // Recompute Analytics
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

    addHistoryRow(formattedTime, data.bpm, data.source || 'PRISM_8E23');
  }

  function addHistoryRow(time, bpm, source) {
    if (!historyTbody) return;
    if (state.totalCount === 1) historyTbody.innerHTML = '';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${time}</td>
      <td><strong>${bpm} bpm</strong></td>
      <td>${source}</td>
      <td><span style="color:#00f5d4; font-weight:700;">VERIFIED</span></td>
    `;

    historyTbody.insertBefore(row, historyTbody.firstChild);
    if (historyTbody.children.length > 15) {
      historyTbody.removeChild(historyTbody.lastChild);
    }
  }

  // App Ingestion Handshake
  async function init() {
    updateBackendConnectionState('connecting');

    try {
      const res = await fetch('/api/readings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          json.data.forEach(r => processGenuineReading(r));
        } else {
          if (readingStateEl) readingStateEl.textContent = 'Waiting for a genuine Android reading...';
        }
      }
    } catch (err) {
      updateBackendConnectionState('failed');
      if (readingStateEl) readingStateEl.textContent = 'Unable to connect to SmartCare server.';
      return;
    }

    // Connect SSE for Live Telemetry
    if (state.eventSource) state.eventSource.close();
    state.eventSource = new EventSource('/api/live');

    state.eventSource.addEventListener('ready', () => {
      updateBackendConnectionState('connected');
    });

    state.eventSource.addEventListener('heart-rate', (e) => {
      try {
        processGenuineReading(JSON.parse(e.data));
      } catch (err) {
        console.error('Invalid EventSource payload:', err);
      }
    });

    state.eventSource.onerror = () => {
      updateBackendConnectionState('reconnecting');
      state.eventSource.close();
      setTimeout(init, 5000);
    };
  }

  // CSV Export Functionality
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      if (state.historyRecords.length === 0) {
        alert('No genuine reading data available to export.');
        return;
      }
      let csvContent = 'data:text/csv;charset=utf-8,Time,BPM,Source,Status\n';
      state.historyRecords.forEach(r => {
        csvContent += `${r.time},${r.bpm},${r.source},${r.status}\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `SmartCare_Genuine_Session_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Copy Endpoint Button
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
