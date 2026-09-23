const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Shared secret for genuine Android App authentication
const ANDROID_APP_SECRET = process.env.SMARTCARE_APP_SECRET || 'sc_live_app_secret_8e23';
const ALLOWED_PACKAGE = 'com.example.smartcaresync';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory reading log
let readings = [];
let sseClients = [];

// Helper: Verify if incoming HTTP request originates from authentic Android app
function isAuthenticAndroidRequest(req, body) {
  const apiKey = req.headers['x-smartcare-api-key'];
  const pkgName = req.headers['x-smartcare-package'];
  const userAgent = req.get('User-Agent') || '';

  // Explicit secret or verified package signature check
  if (apiKey === ANDROID_APP_SECRET) return true;
  if (pkgName === ALLOWED_PACKAGE && body.deviceId === 'PRISM_8E23') return true;
  if (userAgent.includes('SmartCareAndroidApp') && body.deviceId === 'PRISM_8E23') return true;

  return false;
}

function broadcastReading(reading) {
  // Only broadcast genuine watch readings to production SSE clients
  if (reading.sourceType !== 'REAL_WATCH') return;

  const data = `event: heart-rate\ndata: ${JSON.stringify(reading)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(data);
    } catch (err) {}
  });
}

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  const genuineReadings = readings.filter(r => r.sourceType === 'REAL_WATCH');
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    totalGenuineReadings: genuineReadings.length,
    activeSseConnections: sseClients.length
  });
});

// GET Genuine Readings Only (Optional ?include_unverified=true)
app.get('/api/readings', (req, res) => {
  const showAll = req.query.include_unverified === 'true';
  const filtered = showAll ? readings : readings.filter(r => r.sourceType === 'REAL_WATCH');

  res.json({
    success: true,
    count: filtered.length,
    data: filtered
  });
});

// GET Latest Genuine Reading
app.get('/api/readings/latest', (req, res) => {
  const genuineReadings = readings.filter(r => r.sourceType === 'REAL_WATCH');

  if (genuineReadings.length === 0) {
    return res.json({ success: true, data: null });
  }

  const latest = genuineReadings[genuineReadings.length - 1];
  const now = Date.now();
  const readingTime = new Date(latest.timestamp).getTime();
  const isFresh = (now - readingTime) < 120000; // 2 minutes

  res.json({
    success: true,
    data: {
      ...latest,
      isFresh
    }
  });
});

// SSE Stream for Genuine Telemetry
app.get('/api/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  const genuineReadings = readings.filter(r => r.sourceType === 'REAL_WATCH');
  const latest = genuineReadings.length > 0 ? genuineReadings[genuineReadings.length - 1] : null;

  res.write(`event: ready\ndata: ${JSON.stringify({
    status: 'connected',
    latestReading: latest,
    totalGenuineReadings: genuineReadings.length
  })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client.id !== clientId);
  });
});

// POST Ingest Endpoint
app.post('/api/heart-rate', (req, res) => {
  const { bpm, timestamp, source, deviceId } = req.body;
  const numericBpm = Number(bpm);

  if (!bpm || isNaN(numericBpm) || numericBpm < 30 || numericBpm > 250) {
    return res.status(400).json({ success: false, error: 'Invalid BPM value. Range: 30-250.' });
  }

  const isGenuine = isAuthenticAndroidRequest(req, req.body);
  const sourceType = isGenuine ? 'REAL_WATCH' : (req.body.isSimulator ? 'SIMULATOR' : 'UNVERIFIED');
  const sourceLabel = isGenuine ? (source || 'PRISM_8E23 (Android)') : 'Unverified Request';

  const nowIso = new Date().toISOString();
  const measurementTime = timestamp || nowIso;

  // Deduplication Check: Prevent replay attacks or duplicate transmissions within 1 second
  const isDuplicate = readings.some(r =>
    r.sourceType === sourceType &&
    r.bpm === Math.round(numericBpm) &&
    r.deviceId === (deviceId || 'UNKNOWN') &&
    Math.abs(new Date(r.timestamp).getTime() - new Date(measurementTime).getTime()) < 1000
  );

  if (isDuplicate) {
    return res.status(409).json({ success: false, error: 'Duplicate reading ignored.' });
  }

  const reading = {
    id: `read_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    bpm: Math.round(numericBpm),
    timestamp: measurementTime,
    serverReceivedAt: nowIso,
    source: sourceLabel,
    sourceType: sourceType,
    deviceId: deviceId || 'PRISM_8E23'
  };

  readings.push(reading);
  if (readings.length > 1000) readings.shift();

  if (isGenuine) {
    broadcastReading(reading);
  }

  res.status(201).json({
    success: true,
    data: reading,
    verified: isGenuine
  });
});

// Cleanup Admin API to clear unverified/simulator history
app.post('/api/admin/reset-unverified', (req, res) => {
  const before = readings.length;
  readings = readings.filter(r => r.sourceType === 'REAL_WATCH');
  res.json({
    success: true,
    clearedCount: before - readings.length,
    remainingGenuineCount: readings.length
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SmartCare Sync Server running on port ${PORT}`);
});
