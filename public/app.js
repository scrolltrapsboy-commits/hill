const $ = id => document.getElementById(id);
const readings = [];
let latest = null;
const maxPoints = 50;

function fmtTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function render() {
  $("bpm").textContent = latest ? latest.bpm : "--";
  $("latestStat").innerHTML = latest ? `${latest.bpm} <small>bpm</small>` : "— <small>bpm</small>";
  $("latestTime").textContent = latest ? `Received ${fmtTime(latest.timestamp)}` : "Waiting for data";
  $("lastSeen").textContent = latest ? fmtTime(latest.timestamp) : "No data yet";
  $("source").textContent = latest?.source || "Not connected";
  $("deviceId").textContent = latest?.deviceId ? `ID: ${latest.deviceId}` : "Device ID unavailable";
  $("count").textContent = readings.length;
  $("readingState").textContent = latest ? "A heart-rate reading has been received" : "Waiting for the first reading";
  $("readingDot").classList.toggle("active", !!latest);
  const body = $("history");
  if (!readings.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty">Waiting for your Android app to send a reading…</td></tr>';
  } else {
    body.innerHTML = readings.slice(-12).reverse().map(r => `<tr><td>${fmtTime(r.timestamp)}</td><td>${r.bpm} bpm</td><td>${escapeHtml(r.source || "SmartCare")}</td><td><span class="status-chip">Received</span></td></tr>`).join("");
  }
  drawChart();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function drawChart() {
  const canvas = $("chart"), rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width*dpr));
  canvas.height = Math.max(1, Math.floor(rect.height*dpr));
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0,0,w,h);
  const data = readings.slice(-maxPoints).map(r => r.bpm);
  if (data.length < 2) {
    ctx.fillStyle = "#647392"; ctx.font = "11px DM Sans"; ctx.fillText(data.length ? "Collecting more readings for the trend…" : "Your live trend will appear here", 8, h/2);
    return;
  }
  let min = Math.min(...data)-8, max = Math.max(...data)+8;
  if (max-min < 24) { const mid=(max+min)/2; min=mid-12; max=mid+12; }
  const pts = data.map((v,i)=>({x: i*(w-8)/(data.length-1)+4, y: h-8-((v-min)/(max-min))*(h-20)}));
  const grad = ctx.createLinearGradient(0,0,0,h); grad.addColorStop(0,"rgba(92,225,192,.25)"); grad.addColorStop(1,"rgba(92,225,192,0)");
  ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.lineTo(pts[pts.length-1].x,h); ctx.lineTo(pts[0].x,h); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
  ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.lineWidth=2.5; ctx.strokeStyle="#5ce1c0"; ctx.lineJoin="round"; ctx.lineCap="round"; ctx.stroke();
  const p=pts[pts.length-1]; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fillStyle="#dffff7"; ctx.fill(); ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2); ctx.strokeStyle="#5ce1c055"; ctx.lineWidth=4; ctx.stroke();
}
function addReading(r) {
  if (!r || !Number.isFinite(Number(r.bpm))) return;
  const item = {...r, bpm:Math.round(Number(r.bpm)), timestamp:r.timestamp || new Date().toISOString()};
  readings.push(item); if (readings.length>180) readings.shift();
  latest=item; render();
}
async function loadInitial() {
  try {
    const [historyRes, latestRes] = await Promise.all([fetch("/api/readings"),fetch("/api/readings/latest")]);
    const h=await historyRes.json(), l=await latestRes.json();
    (h.readings||[]).forEach(r=>readings.push(r));
    latest=l.latest || readings[readings.length-1] || null;
    render();
    $("apiStatus").textContent="API is reachable";
  } catch (_) { $("apiStatus").textContent="API connection unavailable"; }
}
function connectStream() {
  const stream = new EventSource("/api/live");
  stream.addEventListener("open",()=>{ $("connectionLabel").textContent="Dashboard online"; });
  stream.addEventListener("ready",e=>{
    try {
      const d=JSON.parse(e.data);
      if (!readings.length && Array.isArray(d.readings)) d.readings.forEach(r=>readings.push(r));
      latest=d.latest || latest; render();
    } catch(_){}
  });
  stream.addEventListener("heart-rate",e=>{try{addReading(JSON.parse(e.data));}catch(_){}});
  stream.onerror=()=>{ $("connectionLabel").textContent="Reconnecting"; };
}
$("clock").textContent=fmtTime(new Date());
setInterval(()=>{$("clock").textContent=fmtTime(new Date());},1000);
$("endpoint").textContent=`${location.origin}/api/heart-rate`;
$("copyEndpoint").addEventListener("click",async()=>{
  try { await navigator.clipboard.writeText(`${location.origin}/api/heart-rate`); $("toast").textContent="Endpoint copied"; }
  catch(_) { $("toast").textContent="Select and copy the endpoint"; }
  $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),1800);
});
$("demoBtn").addEventListener("click",async()=>{
  const btn=$("demoBtn"); btn.disabled=true; btn.innerHTML="Sending demo…";
  try {
    const bpm=68+Math.floor(Math.random()*24);
    const response=await fetch("/api/heart-rate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({bpm,timestamp:new Date().toISOString(),source:"Dashboard demo",deviceId:"DEMO — NOT A WATCH"})});
    if(!response.ok) throw new Error("Request failed");
    $("apiStatus").textContent="Demo reading sent successfully";
  } catch(_) { $("apiStatus").textContent="Could not send demo reading"; }
  finally { btn.disabled=false; btn.innerHTML='Send demo reading <span>↗</span>'; }
});
window.addEventListener("resize",drawChart);
loadInitial(); connectStream();
