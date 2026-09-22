# SmartCare Heart Dashboard

A responsive live heart-rate dashboard plus a small Node/Express API for your SmartCare Android app.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder run:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:5000`.

The dashboard includes a live BPM card, trend chart, recent readings, device/source information, connection status, and a demo-reading button. Demo readings are explicitly labeled.

## Connect your Android app

Send a POST request for each real heart-rate notification to:

`POST http://YOUR_COMPUTER_LAN_IP:5000/api/heart-rate`

JSON body:

```json
{
  "bpm": 76,
  "timestamp": "2026-09-22T13:00:00Z",
  "source": "PRISM_8E23",
  "deviceId": "optional-device-id"
}
```

Use the actual parsed BPM value received from BLE. Do not send fabricated readings.

### Android notes

- Add `android.permission.INTERNET` to the manifest.
- For local testing, your phone and computer must be on the same Wi-Fi network. Use your computer's LAN IP, not `localhost` or `10.0.2.2` from a physical phone.
- Android apps targeting modern Android versions generally need HTTPS for network traffic. For a quick local HTTP test only, configure cleartext traffic for the debug build, or use an HTTPS deployment. Do not leave cleartext enabled for production.
- Ensure your app's network request is made off the main thread and handles failures/retries.
- Do not upload a reading until the BLE notification has been parsed and validated.

## API

- `GET /api/health` — health check
- `GET /api/readings/latest` — latest reading
- `GET /api/readings` — retained in-memory readings (up to 180)
- `GET /api/live` — Server-Sent Events stream for live dashboard updates
- `POST /api/heart-rate` — accept a reading

The history is held in memory and resets when the server restarts. This is a testing starter, not a production medical records system.

## Optional shared API key

Set `SMARTCARE_API_KEY` on the server. When configured, the Android request must include:

`x-smartcare-key: YOUR_KEY`

Do not put a permanent secret in a public client app for production. Use authenticated user sessions and server-side authorization for a real deployment.

## Production checklist

- Deploy behind HTTPS.
- Add user authentication, per-patient authorization, database persistence, retention/deletion controls, and audit logging.
- Validate timestamps and payload sizes; rate-limit ingestion.
- Treat heart-rate data as sensitive health information and obtain appropriate consent.
- Do not use this dashboard alone to diagnose, triage, or trigger emergency dispatch.
