const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.SMARTCARE_API_KEY || "";
const MAX_HISTORY = 180;

app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

let readings = [];
let latest = null;

function authorized(req, res, next) {
  if (!API_KEY) return next(); // Configure SMARTCARE_API_KEY before deployment.
  const supplied = req.get("x-smartcare-key");
  if (supplied !== API_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

function normalize(body) {
  const bpm = Number(body?.bpm ?? body?.heartRate);
  if (!Number.isFinite(bpm) || bpm < 25 || bpm > 240) return null;
  const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) return null;
  return {
    id: `${timestamp.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    bpm: Math.round(bpm),
    timestamp: timestamp.toISOString(),
    source: String(body.source || body.deviceName || "SmartCare BLE").slice(0, 80),
    deviceId: String(body.deviceId || "").slice(0, 100)
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "SmartCare Heart API", timestamp: new Date().toISOString() }));
app.get("/api/readings/latest", (_req, res) => res.json({ ok: true, latest }));
app.get("/api/readings", (_req, res) => res.json({ ok: true, readings }));

app.post("/api/heart-rate", authorized, (req, res) => {
  const reading = normalize(req.body);
  if (!reading) return res.status(400).json({ ok: false, error: "Provide a valid bpm (25–240) and valid timestamp." });
  latest = reading;
  readings.push(reading);
  if (readings.length > MAX_HISTORY) readings = readings.slice(-MAX_HISTORY);
  res.status(201).json({ ok: true, reading });
});

// Server-Sent Events stream: dashboard receives new readings without polling.
app.get("/api/live", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ latest, readings })}\n\n`);
  const send = (reading) => res.write(`event: heart-rate\ndata: ${JSON.stringify(reading)}\n\n`);
  const clients = app.locals.sseClients || (app.locals.sseClients = new Set());
  clients.add(send);
  const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 20000);
  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(send);
  });
});

const originalPost = app._router.stack.find(layer => layer.route?.path === "/api/heart-rate");
if (originalPost) {
  const route = originalPost.route;
  const oldHandler = route.stack[route.stack.length - 1].handle;
  route.stack[route.stack.length - 1].handle = function(req, res, next) {
    const previousStatus = res.statusCode;
    const oldJson = res.json.bind(res);
    res.json = (payload) => {
      if (res.statusCode === 201 && payload?.reading) {
        for (const client of app.locals.sseClients || []) {
          try { client(payload.reading); } catch (_) {}
        }
      }
      return oldJson(payload);
    };
    return oldHandler(req, res, next);
  };
}

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, error: "API endpoint not found" });
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => console.log(`SmartCare Heart Dashboard running on port ${PORT}`));
