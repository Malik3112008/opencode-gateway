"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderDashboard = renderDashboard;
function renderDashboard() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenCode Zen Smart Gateway</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0d1117; --card: #161b22; --border: #30363d; --border2: #21262d;
    --fg: #c9d1d9; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950;
    --yellow: #d29922; --red: #da3633; --blue: #1f6feb; --purple: #a371f7;
    --okbg: #238636; --warnbg: #9e6a03; --errbg: #da3633;
  }
  html[data-theme="light"] {
    color-scheme: light;
    --bg: #f6f8fa; --card: #ffffff; --border: #d0d7de; --border2: #eaeef2;
    --fg: #24292f; --muted: #57606a; --accent: #0969da; --green: #1a7f37;
    --yellow: #9a6700; --red: #cf222e; --blue: #0969da; --purple: #8250df;
    --okbg: #1a7f37; --warnbg: #9a6700; --errbg: #cf222e;
  }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--bg); color: var(--fg); margin: 0; padding: 20px; }
  h1 { font-size: 18px; color: var(--accent); margin: 0; }
  .sub { color: var(--muted); font-size: 12px; margin: 4px 0 0; }
  .topbar { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; }
  .controls input, .controls select, .controls button { background: var(--card); color: var(--fg); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; font-size: 12px; font-family: inherit; }
  .controls button { cursor: pointer; }
  .controls button:hover { border-color: var(--accent); }
  h2 { font-size: 13px; color: var(--muted); margin: 0; text-transform: uppercase; letter-spacing: .06em; }
  .section { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
  .sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; cursor: pointer; user-select: none; }
  .sec-head .arrow { color: var(--muted); }
  .sec-body { overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border2); white-space: nowrap; }
  th { color: var(--muted); font-weight: 600; }
  tr.current { background: rgba(88,166,255,0.08); }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge.ok { background: var(--okbg); color: #fff; }
  .badge.warn { background: var(--warnbg); color: #fff; }
  .badge.err { background: var(--errbg); color: #fff; }
  .badge.active { background: var(--blue); color: #fff; }
  .badge.mute { background: var(--border); color: var(--muted); }
  .bar { height: 6px; background: var(--border2); border-radius: 3px; overflow: hidden; min-width: 60px; }
  .bar > div { height: 100%; background: var(--accent); }
  .bar.warn > div { background: var(--yellow); }
  .bar.err > div { background: var(--red); }
  .muted { color: var(--muted); }
  .red { color: var(--red); }
  .green { color: var(--green); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 14px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .card .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  .card .value { font-size: 22px; font-weight: 700; margin: 2px 0; }
  .card .hint { font-size: 11px; color: var(--muted); }
  .chartgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  @media (max-width: 900px) { .chartgrid { grid-template-columns: 1fr; } }
  .chartbox { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; }
  .hbar { display: flex; flex-direction: column; gap: 7px; margin-top: 10px; }
  .hbar-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .hbar-lbl { flex: 0 0 44%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .hbar-track { flex: 1; height: 13px; background: var(--border2); border-radius: 7px; overflow: hidden; }
  .hbar-fill { display: block; height: 100%; border-radius: 7px; }
  .hbar-val { flex: 0 0 54px; text-align: right; color: var(--fg); }
  svg { display: block; width: 100%; height: auto; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--muted); margin-top: 6px; }
  .legend span i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  #alerts { margin-bottom: 12px; }
  .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 6px; }
  .alert.warn { background: rgba(210,153,34,.15); border: 1px solid var(--yellow); color: var(--yellow); }
  .alert.err { background: rgba(218,54,51,.15); border: 1px solid var(--red); color: var(--red); }
  .alert.ok { background: rgba(63,185,80,.12); border: 1px solid var(--green); color: var(--green); }
  .pill { font-size: 11px; padding: 2px 8px; border: 1px solid var(--border); border-radius: 12px; color: var(--muted); }
  .mt { margin-top: 8px; }
  .td-dot { color: var(--green); }
  .fade { opacity: .6; }
  .charttip { font-size: 11px; color: var(--muted); }
  a.logout { font-size: 12px; color: var(--muted); text-decoration: none; border: 1px solid var(--border); padding: 3px 10px; border-radius: 12px; }
  a.logout:hover { color: var(--accent); border-color: var(--accent); }
</style>
</head>
<body>
<div class="topbar">
  <div>
    <h1>OpenCode Zen Smart Gateway</h1>
    <div class="sub" id="subbar">uptime - &middot; updated - &middot; <span id="status"><span class="td-dot">&bull;</span> connecting</span></div>
  </div>
  <div class="controls">
    <input id="search" placeholder="cari key / model / event..." style="width:200px">
    <select id="interval">
      <option value="5000" selected>refresh 5s</option>
      <option value="15000">refresh 15s</option>
      <option value="30000">refresh 30s</option>
      <option value="0">pause</option>
    </select>
    <button id="themeBtn">theme</button>
    <a href="/logout" class="logout">logout</a>
    <span id="countdown" class="pill">-</span>
  </div>
</div>

<div id="alerts"></div>

<div class="cards" id="statcards"></div>

<div class="chartgrid">
  <div class="chartbox">
    <h2>Tokens / jam (24 jam)</h2>
    <div id="chTok"></div>
    <div class="legend" id="lgTok"></div>
    <div class="charttip">area: input (biru) + output (hijau)</div>
  </div>
  <div class="chartbox">
    <h2>Requests / jam (24 jam)</h2>
    <div id="chReq"></div>
  </div>
  <div class="chartbox">
    <h2>Share token per model</h2>
    <div id="chModel"></div>
    <div class="legend" id="lgModel"></div>
  </div>
  <div class="chartbox">
    <h2>Share request per key</h2>
    <div id="chKey"></div>
    <div class="legend" id="lgKey"></div>
  </div>
</div>

<div class="section">
  <div class="sec-head" onclick="toggle('secKeys')"><h2>Keys</h2><span class="arrow" id="arrKeys">&#9660;</span></div>
  <div class="sec-body" id="secKeys"><table>
    <thead><tr><th>Key</th><th>Status</th><th>Cooldown selesai</th><th>Req hari ini</th><th>Tokens hari ini</th><th>Rata2 tok/req</th><th>Est %</th><th>Event</th><th>Terakhir dipakai</th></tr></thead>
    <tbody id="keyRows"></tbody>
  </table></div>
</div>

<div class="section">
  <div class="sec-head" onclick="toggle('secModels')"><h2>Per-Model</h2><span class="arrow" id="arrModels">&#9660;</span></div>
  <div class="sec-body" id="secModels"><table>
    <thead><tr><th>Model</th><th>Requests</th><th>In tok</th><th>Out tok</th><th>Total tok</th><th>Share</th><th>Key</th></tr></thead>
    <tbody id="modelRows"></tbody>
  </table></div>
</div>

<div class="section">
  <div class="sec-head" onclick="toggle('secAct')"><h2>Activity Terkini <span class="pill">10 terbaru</span></h2><span class="arrow" id="arrAct">&#9660;</span></div>
  <div class="sec-body" id="secAct"><table>
    <thead><tr><th>Waktu</th><th>Status</th><th>Model</th><th>Key</th><th>In tok</th><th>Out tok</th><th>Durasi</th><th>Path</th><th>Error</th></tr></thead>
    <tbody id="actRows"></tbody>
  </table></div>
</div>

<div class="section">
  <div class="sec-head" onclick="toggle('secEvt')"><h2>Events <span class="pill">10 terbaru</span></h2><span class="arrow" id="arrEvt">&#9660;</span></div>
  <div class="sec-body" id="secEvt">
    <div class="controls mt" style="margin-bottom:8px">
      <button data-f="all" class="evtf">all</button>
      <button data-f="limit" class="evtf">limit</button>
      <button data-f="failover" class="evtf">failover</button>
      <button data-f="recovered" class="evtf">recovered</button>
    </div>
    <table><thead><tr><th>Waktu</th><th>Type</th><th>Details</th></tr></thead><tbody id="eventRows"></tbody></table>
  </div>
</div>

<script>
var COLORS = ['#58a6ff','#3fb950','#f0883e','#d29922','#a371f7','#db6d28','#f778ba','#39c5cf','#7ee787','#ff7b72','#e3b341','#bc8cff'];
var state = { data: null, filter: 'all', interval: 5000, nextTick: 0 };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
}
function fmtTok(n) { return (n == null ? 0 : n).toLocaleString(); }
function fmtNum(n) { return (n == null ? 0 : n).toLocaleString(); }
function short(k) { return k && k.length > 6 ? '...' + k.slice(-6) : (k || '-'); }
function fmtTime(iso) { if (!iso) return '-'; var d = new Date(iso); return d.toLocaleString(); }
function fmtClock(iso) { if (!iso) return '-'; var d = new Date(iso); return d.toLocaleTimeString(); }
function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  if (!sec) return '-';
  var d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  var out = '';
  if (d) out += d + 'd ';
  if (h) out += h + 'h ';
  if (m) out += m + 'm ';
  out += s + 's';
  return out;
}
function ago(iso) {
  if (!iso) return '-';
  var s = Math.floor((Date.now() - new Date(iso).getTime())/1000);
  return fmtDur(s) + ' lalu';
}
function pct(used, allow) { return allow ? Math.min(100, (used/allow*100)) : 0; }
function barPct(used, allow) {
  var p = pct(used, allow);
  var cls = p >= 90 ? 'err' : (p >= 60 ? 'warn' : '');
  return '<div class="bar ' + cls + '"><div style="width:' + p.toFixed(1) + '%"></div></div>';
}

// ---- SVG charts ----
function svgWrap(inner, w, h) { return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + inner + '</svg>'; }

function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) {
    var d = 'M' + pts[0][0] + ',' + pts[0][1];
    for (var i = 1; i < pts.length; i++) d += ' L' + pts[i][0] + ',' + pts[i][1];
    return d;
  }
  var d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[Math.max(0, i - 1)];
    var p1 = pts[i];
    var p2 = pts[i + 1];
    var p3 = pts[Math.min(pts.length - 1, i + 2)];
    var cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    var cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    var cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    var cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ' C' + cp1x.toFixed(1) + ',' + cp1y.toFixed(1) + ' ' + cp2x.toFixed(1) + ',' + cp2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
  }
  return d;
}

function xLabels(html, labels, n, xAt, w, h) {
  if (!labels || !labels.length) return html;
  var step = Math.max(1, Math.floor(n / 6));
  var i;
  for (i = 0; i < n; i += step) {
    html += '<text x="' + xAt(i) + '" y="' + (h - 4) + '" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.65">' + esc(labels[i]) + '</text>';
  }
  if ((n - 1) % step !== 0) {
    html += '<text x="' + xAt(n - 1) + '" y="' + (h - 4) + '" font-size="9" text-anchor="end" fill="currentColor" opacity="0.65">' + esc(labels[n - 1]) + '</text>';
  }
  return html;
}

function stackedAreaChart(el, series, labels, w, h) {
  var n = series[0].data.length;
  var maxV = 1;
  var i, j;
  for (i = 0; i < n; i++) { var s = 0; for (j = 0; j < series.length; j++) s += (series[j].data[i] || 0); if (s > maxV) maxV = s; }
  var padL = 46, padR = 6, padT = 8, padB = 22;
  var iw = w - padL - padR, ih = h - padT - padB;
  var xAt = function(i) { return padL + (n <= 1 ? iw / 2 : i * (iw / (n - 1))); };
  var yAt = function(v) { return padT + ih - (v / maxV) * ih; };
  var cum = []; for (i = 0; i < n; i++) cum.push(0);
  var levelPts = [];
  for (j = 0; j < series.length; j++) {
    var lvl = [];
    for (i = 0; i < n; i++) { cum[i] += (series[j].data[i] || 0); lvl.push([xAt(i), yAt(cum[i])]); }
    levelPts.push(lvl);
  }
  var baseline = padT + ih;
  var inner = '';
  for (var g = 0; g <= 4; g++) {
    var gy = padT + ih * g / 4;
    var gv = maxV - (maxV * g / 4);
    inner += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy + '" stroke="currentColor" stroke-opacity="0.1"/>';
    inner += '<text x="' + (padL - 5) + '" y="' + (gy + 3) + '" font-size="9" text-anchor="end" fill="currentColor" opacity="0.6">' + fmtNum(Math.round(gv)) + '</text>';
  }
  for (j = 0; j < levelPts.length; j++) {
    var topD = smoothPath(levelPts[j]);
    var bottomD;
    if (j === 0) {
      bottomD = ' L' + levelPts[0][n - 1][0].toFixed(1) + ',' + baseline + ' L' + levelPts[0][0][0].toFixed(1) + ',' + baseline + ' Z';
    } else {
      var bpts = levelPts[j - 1].slice().reverse();
      bottomD = ' ' + smoothPath(bpts).slice(1) + ' Z';
    }
    var d = topD + bottomD;
    inner += '<path d="' + d + '" fill="' + series[j].color + '" opacity="0.55"><title>' + esc(series[j].label) + '</title></path>';
    inner += '<path d="' + smoothPath(levelPts[j]) + '" fill="none" stroke="' + series[j].color + '" stroke-width="1.5" opacity="0.9"><title>' + esc(series[j].label) + '</title></path>';
  }
  inner = xLabels(inner, labels, n, xAt, w, h);
  el.innerHTML = svgWrap(inner, w, h);
}

function barChart(el, values, labels, w, h, color) {
  var n = values.length;
  var maxV = 1; for (var i = 0; i < n; i++) if (values[i] > maxV) maxV = values[i];
  var padL = 46, padR = 6, padT = 8, padB = 22;
  var iw = w - padL - padR, ih = h - padT - padB;
  var bw = iw / n * 0.6;
  var inner = '';
  for (var g = 0; g <= 4; g++) {
    var gy = padT + ih * g / 4;
    var gv = maxV - (maxV * g / 4);
    inner += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy + '" stroke="currentColor" stroke-opacity="0.1"/>';
    inner += '<text x="' + (padL - 5) + '" y="' + (gy + 3) + '" font-size="9" text-anchor="end" fill="currentColor" opacity="0.6">' + fmtNum(Math.round(gv)) + '</text>';
  }
  for (i = 0; i < n; i++) {
    var bh = (values[i] / maxV) * ih;
    var x = padL + i * (iw / n) + (iw / n - bw) / 2;
    var y = padT + ih - bh;
    inner += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(bh, 0).toFixed(1) + '" fill="' + color + '" opacity="0.8"><title>' + values[i] + '</title></rect>';
  }
  var xCenter = function(i) { return padL + i * (iw / n) + (iw / n) / 2; };
  inner = xLabels(inner, labels, n, xCenter, w, h);
  el.innerHTML = svgWrap(inner, w, h);
}

function hBarChart(el, entries) {
  var max = 1; for (var i = 0; i < entries.length; i++) if (entries[i].value > max) max = entries[i].value;
  var rows = entries.map(function(e, i){
    var w = (e.value / max) * 100;
    return '<div class="hbar-row"><span class="hbar-lbl" title="' + esc(e.label) + '">' + esc(e.label) + '</span>' +
      '<span class="hbar-track"><span class="hbar-fill" style="width:' + w.toFixed(1) + '%;background:' + COLORS[i % COLORS.length] + '"></span></span>' +
      '<span class="hbar-val">' + (e.pct != null ? e.pct.toFixed(1) + '%' : fmtNum(e.value)) + '</span></div>';
  }).join('');
  el.innerHTML = '<div class="hbar">' + rows + '</div>';
}

// ---- renderers ----
function render(data) {
  state.data = data;
  var now = new Date(data.now).getTime();

  var activeKeys = 0, coolKeys = 0;
  for (var k in data.keys) { if (data.keys[k].status === 'cooldown') coolKeys++; else activeKeys++; }

  document.getElementById('subbar').innerHTML =
    'uptime ' + fmtDur(data.serviceInfo.uptimeSec) +
    ' &middot; start ' + fmtClock(data.serviceInfo.startTime) +
    ' &middot; key aktif <b>' + esc(short(data.serviceInfo.currentKey)) + '</b> (' + activeKeys + '/' + data.serviceInfo.poolSize + ' sehat)' +
    ' &middot; Tor IP <b>' + esc(data.tor.ip || '?') + '</b> <span class="badge ' + (data.tor.ok ? 'ok' : 'err') + '">' + (data.tor.ok ? 'TOR OK' : 'TOR FAIL') + '</span>' +
    ' &middot; updated <span id="updAgo">' + ago(data.now) + '</span>';

  // alerts
  var alerts = '';
  if (coolKeys === data.serviceInfo.poolSize && data.serviceInfo.poolSize > 0) {
    alerts += '<div class="alert err">Semua key di cooldown — request akan diteruskan tapi bisa kena 429. Tunggu probe pulih / tambah key baru.</div>';
  } else if (coolKeys > 0) {
    alerts += '<div class="alert warn">' + coolKeys + ' key di cooldown. Failover otomatis aktif; key dipulihkan lewat probe otomatis.</div>';
  }
  if (data.failoverToday > 0) {
    alerts += '<div class="alert ok">Failover otomatis terjadi ' + data.failoverToday + 'x hari ini (ganti key + restart Tor + retry).</div>';
  }
  document.getElementById('alerts').innerHTML = alerts;

  // stat cards
  var cards = '';
  cards += statCard('Requests hari ini', fmtNum(data.totals.today.req), 'total ' + fmtNum(data.totals.all.req));
  cards += statCard('Tokens hari ini', fmtTok(data.totals.today.inTok + data.totals.today.outTok), 'in ' + fmtTok(data.totals.today.inTok) + ' + out ' + fmtTok(data.totals.today.outTok));
  cards += statCard('Est % request', pct(data.totals.today.req, data.serviceInfo.dailyAllowance.requests).toFixed(1) + '%', 'dari ' + data.serviceInfo.dailyAllowance.requests + '/hari', 'bar');
  cards += statCard('Est % token', pct(data.totals.today.inTok + data.totals.today.outTok, data.serviceInfo.dailyAllowance.tokens).toFixed(1) + '%', 'dari ' + fmtTok(data.serviceInfo.dailyAllowance.tokens) + '/hari', 'bar');
  cards += statCard('Failover hari ini', fmtNum(data.failoverToday), 'limit / failover / recovered');
  cards += statCard('Key cooldown', fmtNum(coolKeys), activeKeys + ' sehat dari ' + data.serviceInfo.poolSize);
  cards += statCard('Gagal (4xx/5xx)', fmtNum(data.totals.fail), 'dari ' + fmtNum(data.totals.all.req) + ' request');
  cards += statCard('Uptime gateway', fmtDur(data.serviceInfo.uptimeSec), 'sejak ' + fmtClock(data.serviceInfo.startTime));
  document.getElementById('statcards').innerHTML = cards;

  // charts
  var h24 = data.hourly.h24 || [];
  var hourLbls = h24.map(function(b){ var d = new Date(b.ts); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':00'; });
  stackedAreaChart(document.getElementById('chTok'), [
    { label: 'input', color: '#58a6ff', data: h24.map(function(b){ return b.inTok; }) },
    { label: 'output', color: '#3fb950', data: h24.map(function(b){ return b.outTok; }) }
  ], hourLbls, 800, 210);
  document.getElementById('lgTok').innerHTML =
    '<span><i style="background:#58a6ff"></i>input</span><span><i style="background:#3fb950"></i>output</span>';

  barChart(document.getElementById('chReq'), h24.map(function(b){ return b.req; }), hourLbls, 800, 210, '#58a6ff');

  var modelEnt = Object.keys(data.models).map(function(m){ return { label: m, value: data.models[m].tokens, pct: data.models[m].share }; }).sort(function(a,b){ return b.value-a.value; });
  hBarChart(document.getElementById('chModel'), modelEnt.slice(0, 8));
  document.getElementById('lgModel').innerHTML = '';

  var keyEnt = Object.keys(data.keys).map(function(k){ return { label: short(k), value: data.keys[k].requestsToday }; }).sort(function(a,b){ return b.value-a.value; });
  var keyTot = 0; keyEnt.forEach(function(e){ keyTot += e.value; });
  keyEnt.forEach(function(e){ e.pct = keyTot ? (e.value / keyTot) * 100 : 0; });
  hBarChart(document.getElementById('chKey'), keyEnt);
  document.getElementById('lgKey').innerHTML = '';

  // keys table
  var q = document.getElementById('search').value.toLowerCase();
  var rows = Object.keys(data.keys).map(function(k){
    var v = data.keys[k];
    var ok = v.status === 'cooldown';
    var statusCls = ok ? 'err' : 'ok';
    var statusTxt = ok ? 'cooldown' : 'active';
    var pReq = pct(v.requestsToday, data.serviceInfo.dailyAllowance.requests);
    var pTok = pct(v.tokensToday, data.serviceInfo.dailyAllowance.tokens);
    var row = '<tr' + (v.isCurrent ? ' class="current"' : '') + '>' +
      '<td>' + esc(v.short) + (v.isCurrent ? ' <span class="badge active">AKTIF</span>' : '') + '</td>' +
      '<td><span class="badge ' + statusCls + '">' + statusTxt + '</span></td>' +
      '<td class="' + (v.cooldownRemainingSec > 0 ? 'red' : 'muted') + '">' + fmtClock(v.cooldownEndsAt) + (v.cooldownRemainingSec > 0 ? ' (' + fmtDur(v.cooldownRemainingSec) + ')' : '') + '</td>' +
      '<td>' + fmtNum(v.requestsToday) + '</td>' +
      '<td>' + fmtTok(v.tokensToday) + '</td>' +
      '<td>' + fmtTok(v.avgTokPerReq) + '</td>' +
      '<td>' + barPct(v.tokensToday, data.serviceInfo.dailyAllowance.tokens) + ' <span class="muted">' + pReq.toFixed(0) + '%/' + pTok.toFixed(0) + '%</span></td>' +
      '<td>' + fmtNum(v.eventCount) + '</td>' +
      '<td class="muted">' + fmtTime(v.lastUsed) + '</td></tr>';
    if (q && row.toLowerCase().indexOf(q) === -1) return '';
    return row;
  }).filter(Boolean).join('');
  document.getElementById('keyRows').innerHTML = rows || '<tr><td colspan="9" class="muted">belum ada aktivitas / tidak cocok</td></tr>';

  // models table
  var mrows = Object.keys(data.models).map(function(m){
    var v = data.models[m];
    var row = '<tr><td>' + esc(m) + '</td><td>' + fmtNum(v.requests) + '</td><td>' + fmtTok(v.inTokens) + '</td><td>' + fmtTok(v.outTokens) + '</td><td>' + fmtTok(v.tokens) + '</td><td>' + (v.share||0) + '%</td><td class="muted">' + v.keys.map(esc).join(', ') + '</td></tr>';
    if (q && row.toLowerCase().indexOf(q) === -1) return '';
    return row;
  }).filter(Boolean).join('');
  document.getElementById('modelRows').innerHTML = mrows || '<tr><td colspan="7" class="muted">belum ada aktivitas</td></tr>';

  // activity
  var acts = (data.activity || []).slice().reverse();
  document.getElementById('actRows').innerHTML = acts.map(function(a){
    var ok = a.status < 400;
    var row = '<tr>' +
      '<td class="muted">' + fmtTime(a.ts) + '</td>' +
      '<td>' + (ok ? '<span class="badge ok">' + a.status + '</span>' : '<span class="badge err">' + a.status + '</span>') + '</td>' +
      '<td>' + esc(a.model) + '</td>' +
      '<td>' + esc(a.key) + '</td>' +
      '<td>' + fmtTok(a.inTok) + '</td>' +
      '<td>' + fmtTok(a.outTok) + '</td>' +
      '<td class="muted">' + fmtDur(a.ms/1000) + '</td>' +
      '<td class="muted">' + esc(a.path) + (a.stream ? ' (stream)' : '') + '</td>' +
      '<td class="muted red">' + (a.error ? esc(a.error).slice(0, 80) : '') + '</td></tr>';
    if (q && row.toLowerCase().indexOf(q) === -1) return '';
    return row;
  }).filter(Boolean).join('') || '<tr><td colspan="9" class="muted">belum ada request</td></tr>';

  renderEvents();
}

function statCard(label, value, hint) {
  return '<div class="card"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="hint">' + hint + '</div></div>';
}

function renderEvents() {
  var q = document.getElementById('search').value.toLowerCase();
  var evts = (state.data ? state.data.events || [] : []).slice(-10).reverse();
  evts = evts.filter(function(e){
    if (state.filter !== 'all' && e.type !== state.filter) return false;
    if (q) {
      var s = JSON.stringify(e).toLowerCase();
      if (s.indexOf(q) === -1) return false;
    }
    return true;
  });
  document.getElementById('eventRows').innerHTML = evts.map(function(e){
    var cls = e.type === 'failover' ? 'ok' : (e.type === 'recovered' ? 'ok' : 'err');
    var detail = JSON.stringify(Object.assign({}, e, { ts: undefined }));
    return '<tr><td class="muted">' + fmtTime(e.ts) + '</td><td><span class="badge ' + cls + '">' + esc(e.type) + '</span></td><td>' + esc(detail) + '</td></tr>';
  }).join('') || '<tr><td colspan="3" class="muted">tidak ada event</td></tr>';
}

function toggle(id) {
  var el = document.getElementById(id);
  var arr = document.getElementById('arr' + id.replace('sec', ''));
  if (el.style.display === 'none') { el.style.display = ''; arr.innerHTML = '&#9660;'; }
  else { el.style.display = 'none'; arr.innerHTML = '&#9654;'; }
}

// ---- refresh loop ----
var lastData = null;
async function refresh() {
  try {
    var r = await fetch('/stats');
    if (r.status === 401) { window.location.href = '/login'; return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    lastData = await r.json();
    render(lastData);
    document.getElementById('status').innerHTML = '<span class="td-dot">&bull;</span> connected';
  } catch (e) {
    document.getElementById('status').innerHTML = '<span class="red">&bull;</span> offline (' + esc(e.message) + ')';
  }
  scheduleNext();
}
function scheduleNext() {
  state.nextTick = Date.now() + state.interval;
  tickCountdown();
}
function tickCountdown() {
  var el = document.getElementById('countdown');
  if (state.interval === 0) { el.textContent = 'paused'; return; }
  var left = Math.ceil((state.nextTick - Date.now()) / 1000);
  el.textContent = 'refresh in ' + Math.max(0, left) + 's';
  if (lastData) {
    var ua = document.getElementById('updAgo');
    if (ua) ua.textContent = ago(lastData.now);
  }
}
setInterval(function(){
  if (state.interval > 0 && Date.now() >= state.nextTick) refresh();
  tickCountdown();
}, 1000);

document.getElementById('interval').addEventListener('change', function(){
  state.interval = parseInt(this.value, 10);
  scheduleNext();
});
document.getElementById('search').addEventListener('input', function(){
  if (lastData) render(lastData);
});
document.getElementById('themeBtn').addEventListener('click', function(){
  var cur = document.documentElement.getAttribute('data-theme');
  var next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('gw-theme', next); } catch (e) {}
});
var saved = null; try { saved = localStorage.getItem('gw-theme'); } catch (e) {}
if (saved) document.documentElement.setAttribute('data-theme', saved);

document.querySelectorAll('.evtf').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.evtf').forEach(function(b){ b.style.borderColor = ''; });
    state.filter = btn.getAttribute('data-f');
    btn.style.borderColor = '#58a6ff';
    renderEvents();
  });
});

refresh();
</script>
</body>
</html>`;
}
