URGENT DATA INTEGRITY BUG — SMARTCARE DASHBOARD SHOWS TOO MANY HEART-RATE READINGS

Inspect and fix the existing SmartCare website and backend.

CURRENT PROBLEM:

The dashboard shows hundreds of heart-rate readings even though I only used my smartwatch once.

The screenshot shows:
- Total Readings: 762
- Latest heart rate: 81 BPM
- Multiple history entries recorded seconds apart
- Source Device: PRISM_8E23

I need the dashboard to show genuine smartwatch measurements accurately.

Do not assume the readings are genuine simply because their source field says PRISM_8E23. Investigate how every reading is created, accepted, stored, broadcast, and displayed.

PROJECT BACKEND:
https://hill-5l07.onrender.com/

EXISTING ENDPOINTS:
POST /api/heart-rate
GET /api/readings
GET /api/readings/latest
GET /api/live

==================================================
1. FIND THE ACTUAL SOURCE OF THE EXTRA READINGS
==================================================

Inspect the entire project, especially:

- server.js
- public/app.js
- Any simulator or demo generator
- Any setInterval or setTimeout loops
- Any automatic live-stream functionality
- EventSource handlers
- Dashboard initialization code
- Chart update logic
- History table rendering
- Android API integration
- Any code that repeatedly calls POST /api/heart-rate

Search for every place that creates, modifies, broadcasts, or displays a heart-rate reading.

Determine whether the extra readings originate from:

A. The website simulator.
B. An automatic JavaScript timer.
C. The Android application sending repeated values.
D. The backend inserting readings automatically.
E. Duplicate HTTP requests.
F. Duplicate SSE event handling.
G. The dashboard processing the same reading more than once.
H. Old demo data remaining in memory.
I. Another source identified by the actual code.

Do not guess. Report the evidence for the cause.

==================================================
2. REMOVE UNWANTED AUTOMATIC DEMO GENERATION
==================================================

The website must not generate heart-rate values automatically during
normal operation.

Disable automatic simulation on page load.

Do not start a demo stream unless the user explicitly presses
"Start Simulator".

When the user presses "Stop Simulator", stop all simulator timers
immediately.

When the page reloads, do not silently restart the simulator.

Keep the simulator controls if useful for testing, but make it clear
that simulator readings are NOT real smartwatch measurements.

Do not let simulator readings appear as PRISM_8E23 readings.

==================================================
3. SEPARATE REAL AND SIMULATED READINGS
==================================================

Introduce reliable source classification.

Use clearly distinguishable categories such as:

- REAL_WATCH
- SIMULATOR
- TEST

Use the existing API contract where possible. If the contract must
change, update the Android app, backend, and dashboard consistently.

Do not trust a user-provided source label alone as proof that a
reading came from a physical watch.

Preserve available metadata, including:
- Reading ID
- BPM
- Measurement timestamp
- Server received timestamp
- Source type
- Device name
- Device ID, if available

Do not silently convert simulated data into real-watch data.

The production dashboard must clearly distinguish real measurements
from simulator and test data.

==================================================
4. PREVENT DUPLICATE READINGS
==================================================

Investigate duplicate submissions and duplicate frontend processing.

Ensure:
- One accepted HTTP submission creates at most one stored reading.
- One SSE event is processed only once.
- Initial history loading and live updates do not duplicate records.
- Repeated rendering does not increment the reading count.
- EventSource listeners are not registered repeatedly.
- Multiple dashboard initialization calls do not create duplicate
  subscriptions.

Use a stable reading ID or another reliable deduplication strategy.

Do not discard genuinely distinct measurements merely because their
BPM values happen to be identical.

==================================================
5. STOP DISPLAYING OLD OR STALE DATA AS LIVE
==================================================

A previously received reading must not automatically be presented as
a fresh live measurement.

Show:
- Actual BPM.
- Measurement timestamp.
- Server received timestamp, if available.
- Whether the measurement is fresh or stale.
- Whether monitoring is currently active.

If no recent genuine measurement exists, show:

"No fresh smartwatch measurement received."

Do not repeatedly update the latest-reading timestamp unless a new
measurement has actually arrived.

Do not manufacture chart points to make the graph appear active.

==================================================
6. FIX THE READING COUNT, CHART, AND HISTORY
==================================================

Make sure:

- Total Readings counts unique accepted records, not UI render events.
- The chart uses actual stored measurements.
- History contains unique records.
- The latest value corresponds to the newest valid measurement.
- Old demo data is not silently presented as real smartwatch data.
- Empty history displays a clear empty state.

If the existing server contains old simulator or test readings,
identify them and separate or remove them safely.

Do not delete genuine patient readings without authorization.

If data provenance cannot be established, label those records as
unverified rather than pretending they are genuine.

==================================================
7. CHECK THE ANDROID-TO-BACKEND FLOW
==================================================

Inspect how the Android app sends readings to:

POST /api/heart-rate

Determine whether it sends:
- Every genuine BLE notification.
- A cached BPM value repeatedly.
- A reading from a timer.
- Duplicate requests after reconnecting.
- Requests from multiple services or listeners.

Do not automatically assume every notification represents a new
sensor measurement if the watch's behavior is not established.

Preserve the actual measurement timestamp.

If the Android app intentionally reports one reading per minute,
make sure it does not resend an old cached value as a newly measured
reading.

Do not fabricate readings to fill missing intervals.

==================================================
8. PRESERVE LIVE WEBSITE SYNCHRONIZATION
==================================================

Keep the real-time dashboard integration working.

The website must:
- Load existing genuine readings from the backend.
- Receive new readings through the existing live mechanism.
- Update the chart and history once per unique reading.
- Show connection and synchronization errors clearly.
- Recover from temporary network disconnections.
- Never create fake BPM values when the backend is empty.

==================================================
9. TEST AND REPORT
==================================================

Run the available tests.

Verify:
1. Loading the website does not generate readings.
2. The simulator remains stopped unless explicitly started.
3. One test submission creates one record.
4. One real-time event creates one dashboard update.
5. Repeated rendering does not increase the count.
6. Duplicate events do not create duplicate history entries.
7. Empty backend data produces a proper empty state.
8. Stale readings are clearly identified.
9. Simulator data cannot be mistaken for real-watch data.
10. Genuine Android readings can still reach the website.

Report:
- The actual source of the extra readings.
- The files modified.
- The exact changes made.
- Whether the project builds.
- Tests performed and their actual results.
- Whether old records were identified as demo, test, genuine, or
  unverified.
- Any remaining issues.

Do not claim that the problem is fixed unless the relevant behavior
was actually tested.
