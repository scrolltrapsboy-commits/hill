// public/app.js (Key Changes)
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
  const alertBanner = document.getElementById('alertBanner');
  const alertMessage = document.getElementById('alertMessage');

  // Stale Reading Monitoring Timer
  setInterval(checkStaleStatus, 5000);

  function checkStaleStatus() {
    if (!state.lastReadingTime) return;
    const elapsedMs = Date.now() - state.lastReadingTime;
    
    // 2 minutes stale threshold
    if (elapsedMs > 120000) {
      if (readingStateEl) readingStateEl.textContent = 'No fresh smartwatch measurement received.';
      if (readingDotEl) readingDotEl.style.background = '#64748b';
      if (heartIcon) heartIcon.style.animationDuration = '0s';
    }
  }

  function processReading(data) {
    if (!data || typeof data.bpm !== 'number' || isNaN(data.bpm)) return;

    // Unique Identifier Deduplication
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
        : `Simulated/Unverified Telemetry (${data.sourceType || 'TEST'})`;
    }

    if (lastSeenEl) lastSeenEl.textContent = formattedTime;
    if (latestStatEl) latestStatEl.innerHTML = `${data.bpm} <small>bpm</small>`;
    if (latestTimeEl) latestTimeEl.textContent = formattedTime;
    if (sourceEl) sourceEl.textContent = sourceLabel;
    if (deviceIdEl) deviceIdEl.textContent = data.deviceId || 'DEV_UNKNOWN';

    // Update Numerical Totals
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

  // Initial Fetch & SSE Connect
  async function init() {
    try {
      const res = await fetch('/api/readings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data.length > 0) {
          json.data.forEach(r => processReading(r));
        } else {
          if (readingStateEl) readingStateEl.textContent = 'Waiting for the first real heart-rate reading.';
        }
      }
    } catch (e) {
      console.warn('Initial fetch failed:', e);
    }

    // SSE Connection
    const es = new EventSource('/api/live');
    es.addEventListener('heart-rate', (e) => {
      try { processReading(JSON.parse(e.data)); } catch (err) {}
    });
  }

  // Explicit Simulator Handler (Marked as Simulator Payload)
  if (demoBtn) {
    demoBtn.addEventListener('click', async () => {
      await fetch('/api/heart-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bpm: Math.floor(Math.random() * 20) + 70,
          timestamp: new Date().toISOString(),
          source: 'WEB_SIMULATOR',
          isSimulator: true,
          deviceId: 'SIM_CLIENT'
        })
      });
    });
  }

  init();
});
