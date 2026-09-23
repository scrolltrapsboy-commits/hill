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

// Helper: Broadcast reading to SSE clients
function broadcastReading(reading) {
  const data = `event: heart-rate\ndata: ${JSON.stringify(reading)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(data);
    } catch (err) {
      // Client connection issues handled in close event
    }
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.argv[2] || process.uptime(),
    timestamp: new Date().toISOString(),
    totalReadings: readings.length,
    activeConnections: sseClients.length
  });
});

// GET all readings (chronological)
app.get('/api/readings', (req, res) => {
  res.json({
    success: true,
    count: readings.length,
    data: readings
  });
});

// GET latest reading
app.get('/api/readings/latest', (req, res) => {
  if (readings.length === 0) {
    return res.json({
      success: true,
      data: null
    });
  }
  res.json({
    success: true,
    data: readings[readings.length - 1]
  });
});

// SSE Live Stream Endpoint
app.get('/api/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial 'ready' event
  const latest = readings.length > 0 ? readings[readings.length - 1] : null;
  res.write(`event: ready\ndata: ${JSON.stringify({ status: 'connected', latestReading: latest, totalReadings: readings.length })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client.id !== clientId);
  });
});

// POST new heart rate reading
app.post('/api/heart-rate', (req, res) => {
  const { bpm, timestamp, source, deviceId } = req.body;

  // Validation
  const numericBpm = Number(bpm);
  if (!bpm || isNaN(numericBpm) || numericBpm < 30 || numericBpm > 250) {
    return res.status(400).json({
      success: false,
      error: 'Invalid BPM value. Must be a number between 30 and 250.'
    });
  }

  const reading = {
    id: `read_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    bpm: Math.round(numericBpm),
    timestamp: timestamp || new Date().toISOString(),
    source: source || 'Android Client',
    deviceId: deviceId || 'UNKNOWN_DEVICE'
  };

  readings.push(reading);

  // Keep last 1000 readings in memory
  if (readings.length > 1000) {
    readings.shift();
  }

  // Broadcast to all active SSE clients
  broadcastReading(reading);

  res.status(201).json({
    success: true,
    data: reading
  });
});

// Fallback to static app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SmartCare Sync Server running on port ${PORT}`);
});
