const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data store
let readings = [];
let sseClients = [];

// Classify reading sources securely
function classifySource(body, req) {
  const rawSource = String(body.source || '').toUpperCase();
  const isSim = Boolean(body.isSimulator) || rawSource.includes('SIMULATOR') || rawSource.includes('DEMO');
  
  if (isSim) {
    return { type: 'SIMULATOR', label: 'Simulator / Test' };
  }
  
  const userAgent = req.get('User-Agent') || '';
  const isAndroidClient = userAgent.includes('SmartCareAndroid') || req.headers['x-smartcare-client'] === 'android-ble';
  
  if (isAndroidClient && body.deviceId) {
    return { type: 'REAL_WATCH', label: body.source || 'Smartwatch (BLE)' };
  }
  
  return { type: 'UNVERIFIED', label: body.source ? `${body.source} (Unverified)` : 'Unverified Source' };
}

function broadcastReading(reading) {
  const data = `event: heart-rate\ndata: ${JSON.stringify(reading)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(data);
    } catch (err) {
      // Handled via close event
    }
  });
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    totalReadings: readings.length,
    realWatchReadings: readings.filter(r => r.sourceType === 'REAL_WATCH').length,
    activeConnections: sseClients.length
  });
});

// GET all readings with optional source filter
app.get('/api/readings', (req, res) => {
  const filter = req.query.type;
  let filtered = readings;
  if (filter) {
    filtered = readings.filter(r => r.sourceType === filter.toUpperCase());
  }
  res.json({ success: true, count: filtered.length, data: filtered });
});

// GET latest reading with freshness flag
app.get('/api/readings/latest', (req, res) => {
  if (readings.length === 0) {
    return res.json({ success: true, data: null });
  }
  
  const latest = readings[readings.length - 1];
  const now = Date.now();
  const readingTime = new Date(latest.timestamp).getTime();
  const isFresh = (now - readingTime) < 120000; // 2-minute freshness threshold

  res.json({
    success: true,
    data: {
      ...latest,
      isFresh
    }
  });
});

// SSE Live Stream
app.get('/api/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  const latest = readings.length > 0 ? readings[readings.length - 1] : null;
  res.write(`event: ready\ndata: ${JSON.stringify({ status: 'connected', latestReading: latest, totalReadings: readings.length })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client.id !== clientId);
  });
});

// POST Heart Rate
app.post('/api/heart-rate', (req, res) => {
  const { bpm, timestamp, source, deviceId } = req.body;
  const numericBpm = Number(bpm);

  if (!bpm || isNaN(numericBpm) || numericBpm < 30 || numericBpm > 250) {
    return res.status(400).json({ success: false, error: 'Invalid BPM value (must be between 30 and 250).' });
  }

  const classification = classifySource(req.body, req);
  const nowIso = new Date().toISOString();
  const measurementTime = timestamp || nowIso;

  // Server-side Deduplication: reject identical BPM from same device within 1 second
  const isDuplicate = readings.some(r => 
    r.bpm === Math.round(numericBpm) &&
    r.deviceId === (deviceId || 'UNKNOWN_DEVICE') &&
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
    source: classification.label,
    sourceType: classification.type,
    deviceId: deviceId || 'UNKNOWN_DEVICE'
  };

  readings.push(reading);
  if (readings.length > 1000) readings.shift();

  broadcastReading(reading);

  res.status(201).json({ success: true, data: reading });
});

// Admin Endpoint: Clear legacy unverified or simulator records
app.post('/api/admin/reset-demo', (req, res) => {
  const initialCount = readings.length;
  readings = readings.filter(r => r.sourceType === 'REAL_WATCH');
  res.json({
    success: true,
    message: `Cleared ${initialCount - readings.length} simulated/unverified records. Retained ${readings.length} real smartwatch records.`
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SmartCare Sync Server running on port ${PORT}`);
});
