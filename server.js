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

  // Explicit secret, package name, or known watch identifier check
  if (apiKey === ANDROID_APP_SECRET) return true;
  if (pkgName === ALLOWED_PACKAGE) return true;
  if (body && (body.deviceId === 'PRISM_8E23' || body.source === 'PRISM_8E23')) return true;
  if (userAgent.includes('SmartCare') || userAgent.includes('Dalvik') || userAgent.includes('Android')) return true;

  return false;
}

function broadcastReading(reading) {
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

// GET Genuine Readings Only
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
  const { bpm, timestamp, source, deviceId, readingId } = req.body;
  const numericBpm = Number(bpm);

  if (!bpm || isNaN(numericBpm) || numericBpm < 30 || numericBpm > 250) {
    return res.status(400).json({ success: false, error: 'Invalid BPM value. Range: 30-250.' });
  }

  const isGenuine = isAuthenticAndroidRequest(req, req.body);
  const sourceType = isGenuine ? 'REAL_WATCH' : (req.body.isSimulator ? 'SIMULATOR' : 'UNVERIFIED');
  const sourceLabel = isGenuine ? (source || 'PRISM_8E23 (Android)') : 'Unverified Request';

  const nowIso = new Date().toISOString();
  const measurementTime = timestamp || nowIso;
  const targetId = readingId || `read_${new Date(measurementTime).getTime()}_${deviceId || 'PRISM_8E23'}`;

  // Deduplication Check: Check if reading with exact ID or exact timestamp/device already exists
  const existingReading = readings.find(r =>
    r.id === targetId ||
    (r.deviceId === (deviceId || 'PRISM_8E23') && new Date(r.timestamp).getTime() === new Date(measurementTime).getTime())
  );

  // If already ingested, return Success (200 OK) with duplicate flag so Android clears queue
  if (existingReading) {
    return res.status(200).json({
      success: true,
      duplicate: true,
      message: 'Reading already received and accepted previously.',
      data: existingReading
    });
  }

  const reading = {
    id: targetId,
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
    duplicate: false,
    data: reading,
    verified: isGenuine
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SmartCare Sync Server running on port ${PORT}`);
});
