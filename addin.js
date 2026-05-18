/* Journey Report Add-In
 * MyGeotab Page Add-In following Zenith design guidelines
 * Namespace: geotab.addin.journeyReport
 */

/* global geotab, L, Chart */

geotab.addin.journey_report = (() => {
  'use strict';

  // ── State ────────────────────────────────────────────────
  let _api = null;
  let _map = null;
  let _speedChart = null;
  let _reportData = null;

  // Exception rule name → category mapping (case-insensitive substring match)
  const BEHAVIOR_KEYS = {
    speeding:       ['over speed', 'overspeed', 'speed violation'],
    geofenceSpeed:  ['speeding in geofence', 'geofence speed'],
    braking:        ['harsh brake', 'hard brake'],
    acceleration:   ['harsh accel', 'hard accel'],
    turning:        ['harsh turn', 'hard turn', 'cornering'],
  };

  // ── Lifecycle ────────────────────────────────────────────
  const initialize = (api, state, callback) => {
    _api = api;
    setDefaultDates();
    loadDevices();
    callback();
  };

  const focus = (api, state) => {
    _api = api;
  };

  const blur = (api, state) => {
    // no-op
  };

  // ── Helpers ──────────────────────────────────────────────
  function setDefaultDates() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    document.getElementById('jr-date-from').value = toDateInput(yesterday);
    document.getElementById('jr-date-to').value = toDateInput(today);
  }

  function toDateInput(d) {
    return d.toISOString().split('T')[0];
  }

  function toISOLocal(dateStr) {
    return new Date(dateStr + 'T00:00:00').toISOString();
  }

  function toISOLocalEnd(dateStr) {
    return new Date(dateStr + 'T23:59:59').toISOString();
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function secsBetween(a, b) {
    return Math.abs(new Date(b) - new Date(a)) / 1000;
  }

  function showError(msg) {
    const el = document.getElementById('jr-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function clearError() {
    const el = document.getElementById('jr-error');
    el.style.display = 'none';
    el.textContent = '';
  }

  function setLoading(show, msg) {
    const el = document.getElementById('jr-loading');
    el.style.display = show ? 'flex' : 'none';
    if (msg) document.getElementById('jr-loading-msg').textContent = msg;
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== null && val !== undefined ? val : '—';
  }

  // ── Load Devices ─────────────────────────────────────────
  function loadDevices() {
    _api.call('Get', { typeName: 'Device', resultsLimit: 5000 }, devices => {
      const sel = document.getElementById('jr-device');
      sel.innerHTML = '<option value="">— Select vehicle —</option>';
      devices
        .filter(d => d.id && d.name)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.name;
          sel.appendChild(opt);
        });
    }, err => {
      showError('Failed to load devices: ' + (err.message || err));
    });
  }

  // ── Main Generate ─────────────────────────────────────────
  async function generate() {
    clearError();
    document.getElementById('jr-report').style.display = 'none';

    const deviceId = document.getElementById('jr-device').value;
    const dateFrom = document.getElementById('jr-date-from').value;
    const dateTo   = document.getElementById('jr-date-to').value;
    const shipment = document.getElementById('jr-shipment').value.trim();

    if (!deviceId) { showError('Please select a vehicle.'); return; }
    if (!dateFrom || !dateTo) { showError('Please select a date range.'); return; }

    const deviceName = document.getElementById('jr-device').selectedOptions[0].text;
    const btn = document.getElementById('jr-generate-btn');
    btn.disabled = true;

    const fromDate = toISOLocal(dateFrom);
    const toDate   = toISOLocalEnd(dateTo);

    try {
      setLoading(true, 'Fetching trips…');
      const trips = await apiCall('Get', {
        typeName: 'Trip',
        search: { deviceSearch: { id: deviceId }, fromDate, toDate },
      });

      setLoading(true, 'Fetching exception events…');
      const exceptions = await apiCall('Get', {
        typeName: 'ExceptionEvent',
        search: { deviceSearch: { id: deviceId }, fromDate, toDate },
        resultsLimit: 50000,
      });

      setLoading(true, 'Fetching exception rules…');
      const rules = await apiCall('Get', { typeName: 'Rule', resultsLimit: 5000 });
      const ruleMap = {};
      rules.forEach(r => { ruleMap[r.id] = r.name || ''; });

      setLoading(true, 'Fetching GPS track…');
      const logRecords = await apiCall('Get', {
        typeName: 'LogRecord',
        search: { deviceSearch: { id: deviceId }, fromDate, toDate },
        resultsLimit: 50000,
      });

      setLoading(true, 'Fetching status data (fuel/idling)…');
      const statusData = await apiCall('Get', {
        typeName: 'StatusData',
        search: { deviceSearch: { id: deviceId }, fromDate, toDate, diagnosticSearch: { id: 'DiagnosticEngineHoursId' } },
        resultsLimit: 5000,
      }).catch(() => []);

      setLoading(false);

      _reportData = buildReportData({
        deviceId, deviceName, fromDate, toDate, shipment,
        trips, exceptions, rules, ruleMap, logRecords, statusData,
      });

      renderReport(_reportData);
      document.getElementById('jr-report').style.display = 'block';
      document.getElementById('jr-report').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      setLoading(false);
      showError('Error generating report: ' + (err.message || JSON.stringify(err)));
    } finally {
      btn.disabled = false;
    }
  }

  function apiCall(method, params) {
    return new Promise((resolve, reject) => {
      _api.call(method, params, resolve, reject);
    });
  }

  // ── Build Report Data ─────────────────────────────────────
  function buildReportData({ deviceId, deviceName, fromDate, toDate, shipment,
                              trips, exceptions, ruleMap, logRecords }) {

    // Aggregate trip stats across all trips in range
    let totalDistanceM = 0;
    let totalDrivingSec = 0;
    let totalIdlingSec = 0;
    let tripStart = null;
    let tripEnd = null;

    trips.forEach(t => {
      totalDistanceM += t.distance || 0;
      totalDrivingSec += t.drivingDuration || 0;
      totalIdlingSec += t.idlingDuration || 0;
      const ts = new Date(t.start);
      const te = new Date(t.stop);
      if (!tripStart || ts < tripStart) tripStart = ts;
      if (!tripEnd || te > tripEnd) tripEnd = te;
    });

    const totalDistanceKm = (totalDistanceM / 1000).toFixed(2);
    const totalDurationSec = tripStart && tripEnd ? secsBetween(tripStart, tripEnd) : 0;
    const idlingPct = totalDurationSec > 0
      ? ((totalIdlingSec / totalDurationSec) * 100).toFixed(2)
      : '0.00';

    // Fuel — MyGeotab doesn't always expose fuel directly on Trip; estimate if not available
    const fuelL = trips.reduce((sum, t) => sum + (t.fuelUsed || 0), 0);
    const fuelLDisplay = fuelL > 0 ? fuelL.toFixed(1) : 'N/A';
    const fuelYield = fuelL > 0 && totalDistanceKm > 0
      ? (totalDistanceKm / fuelL).toFixed(2) : 'N/A';

    // Classify exceptions by behavior category
    const behaviorCounts = { speeding: 0, geofenceSpeed: 0, braking: 0, acceleration: 0, turning: 0 };
    exceptions.forEach(ex => {
      const ruleName = (ruleMap[ex.rule?.id] || '').toLowerCase();
      for (const [key, keywords] of Object.entries(BEHAVIOR_KEYS)) {
        if (keywords.some(kw => ruleName.includes(kw))) {
          behaviorCounts[key]++;
          break;
        }
      }
    });

    // Build event log from exceptions + GPS significant points
    const events = buildEventLog(exceptions, ruleMap, logRecords, trips);

    // Sort log records by date for map/chart
    const track = [...logRecords]
      .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
      .filter(r => r.latitude && r.longitude && r.latitude !== 0);

    return {
      deviceId, deviceName, fromDate, toDate, shipment,
      tripStart: tripStart ? tripStart.toISOString() : null,
      tripEnd: tripEnd ? tripEnd.toISOString() : null,
      totalDurationSec,
      totalDistanceKm,
      totalDrivingSec,
      totalIdlingSec,
      idlingPct,
      fuelLDisplay,
      fuelYield,
      behaviorCounts,
      events,
      track,
      trips,
    };
  }

  function buildEventLog(exceptions, ruleMap, logRecords, trips) {
    const events = [];

    // Exception events
    exceptions.forEach(ex => {
      events.push({
        type: ruleMap[ex.rule?.id] || 'Exception',
        dateTime: ex.activeFrom || ex.dateTime,
        latitude: ex.location?.y || null,
        longitude: ex.location?.x || null,
        speed: ex.lastDriver ? null : null,
        driver: '',
        description: '',
      });
    });

    // Trip start/stop as ignition events
    trips.forEach(t => {
      events.push({ type: 'Ignition On',  dateTime: t.start, latitude: null, longitude: null, speed: 0, driver: '', description: '' });
      events.push({ type: 'Ignition Off', dateTime: t.stop,  latitude: null, longitude: null, speed: 0, driver: '', description: '' });
    });

    // Sort all events chronologically
    events.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    return events;
  }

  // ── Render Report ─────────────────────────────────────────
  function renderReport(d) {
    // Page 1 — header info
    setText('jr-vehicle-id',   d.deviceName);
    setText('jr-trip-start',   formatDateTime(d.tripStart));
    setText('jr-trip-end',     formatDateTime(d.tripEnd));
    setText('jr-duration',     formatDuration(d.totalDurationSec));
    setText('jr-shipment-val', d.shipment || '—');
    setText('jr-generated-on', formatDateTime(new Date().toISOString()));
    document.getElementById('jr-driver-name').textContent = '_______________';

    // Behavior counts
    setText('exc-speeding',      d.behaviorCounts.speeding);
    setText('exc-geofence-speed',d.behaviorCounts.geofenceSpeed);
    setText('exc-braking',       d.behaviorCounts.braking);
    setText('exc-acceleration',  d.behaviorCounts.acceleration);
    setText('exc-turning',       d.behaviorCounts.turning);

    // Trip stats
    setText('stat-trip-time',          formatDuration(d.totalDrivingSec));
    setText('stat-distance',           d.totalDistanceKm);
    setText('stat-fuel',               d.fuelLDisplay);
    setText('stat-fuel-yield',         d.fuelYield);
    setText('stat-idling',             formatDuration(d.totalIdlingSec));
    setText('stat-idling-terminal',    '—');
    setText('stat-idling-road',        '—');
    setText('stat-idling-customer',    '—');
    setText('stat-idling-pct',         d.idlingPct);
    setText('stat-idling-fuel',        '—');
    setText('stat-fuel-yield-no-idling', '—');

    // Page 2 — Map
    renderMap(d);

    // Timeline
    renderTimeline(d);

    // Speed chart
    renderSpeedChart(d.track);

    // Page 3 — Event log
    renderEventLog(d.events);
  }

  // ── Map ───────────────────────────────────────────────────
  function renderMap(d) {
    if (_map) { _map.remove(); _map = null; }

    const mapEl = document.getElementById('jr-map');
    _map = L.map(mapEl, { scrollWheelZoom: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(_map);

    const track = d.track;
    if (track.length > 0) {
      const latlngs = track.map(r => [r.latitude, r.longitude]);
      const polyline = L.polyline(latlngs, { color: '#0078d4', weight: 3, opacity: 0.8 }).addTo(_map);

      // Start marker (green)
      L.circleMarker(latlngs[0], { radius: 8, fillColor: '#107c10', color: '#fff', weight: 2, fillOpacity: 1 })
        .bindPopup('Trip Start: ' + formatDateTime(track[0].dateTime))
        .addTo(_map);

      // End marker (red)
      L.circleMarker(latlngs[latlngs.length - 1], { radius: 8, fillColor: '#d83b01', color: '#fff', weight: 2, fillOpacity: 1 })
        .bindPopup('Trip End: ' + formatDateTime(track[track.length - 1].dateTime))
        .addTo(_map);

      _map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
    } else {
      _map.setView([14.5995, 120.9842], 10); // Default: Metro Manila
    }

    // Map info line
    document.getElementById('jr-map-info').textContent =
      `${d.deviceName}   ${formatDateTime(d.tripStart)} — ${formatDateTime(d.tripEnd)}`;

    const maxSpeed = track.length > 0 ? Math.max(...track.map(r => (r.speed || 0) * 3.6)).toFixed(0) : 0;
    document.getElementById('jr-map-stats').innerHTML =
      `<strong>Total Distance:</strong> ${d.totalDistanceKm} km &nbsp;|&nbsp; ` +
      `<strong>Driving Time:</strong> ${formatDuration(d.totalDrivingSec)} &nbsp;|&nbsp; ` +
      `<strong>Idling Time:</strong> ${formatDuration(d.totalIdlingSec)} &nbsp;|&nbsp; ` +
      `<strong>Max Speed:</strong> ${maxSpeed} km/h`;
  }

  // ── Timeline ──────────────────────────────────────────────
  function renderTimeline(d) {
    const total = d.totalDurationSec || 1;
    const running = d.totalDrivingSec;
    const idling  = d.totalIdlingSec;
    const engine  = running + idling;
    const parking = Math.max(0, total - engine);

    function setBar(barId, valId, seconds, color) {
      const pct = Math.min(100, (seconds / total) * 100).toFixed(1);
      const container = document.getElementById(barId);
      container.innerHTML = `<div class="jr-timeline-segment" style="left:0;width:${pct}%;background:${color}"></div>`;
      setText(valId, formatDuration(seconds));
    }

    setBar('tl-running', 'tl-running-val', running, '#107c10');
    setBar('tl-idling',  'tl-idling-val',  idling,  '#ffb900');
    setBar('tl-engine',  'tl-engine-val',  engine,  '#d83b01');
    setBar('tl-parking', 'tl-parking-val', parking, '#0078d4');
  }

  // ── Speed Chart ───────────────────────────────────────────
  function renderSpeedChart(track) {
    const ctx = document.getElementById('jr-speed-chart').getContext('2d');
    if (_speedChart) { _speedChart.destroy(); _speedChart = null; }

    // Downsample to max 500 points for performance
    const step = Math.max(1, Math.floor(track.length / 500));
    const sampled = track.filter((_, i) => i % step === 0);

    const labels = sampled.map(r => {
      const d = new Date(r.dateTime);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    });
    const speeds = sampled.map(r => parseFloat(((r.speed || 0) * 3.6).toFixed(1)));

    _speedChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Speed (km/h)',
          data: speeds,
          borderColor: '#0078d4',
          backgroundColor: 'rgba(0,120,212,0.15)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.2,
        }],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 10, font: { size: 11 } }, grid: { color: '#eee' } },
          y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#eee' } },
        },
      },
    });
  }

  // ── Event Log ─────────────────────────────────────────────
  function renderEventLog(events) {
    const tbody = document.getElementById('jr-event-body');
    tbody.innerHTML = '';

    const summary = `Showing ${events.length} events`;
    document.getElementById('jr-event-summary').textContent = summary;

    events.forEach(ev => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escHtml(ev.type)}</td>
        <td>${formatDateTime(ev.dateTime)}</td>
        <td style="font-size:12px">${escHtml(ev.address || '—')}</td>
        <td>${escHtml(ev.driver || '—')}</td>
        <td>${ev.speed !== null && ev.speed !== undefined ? ev.speed : '—'}</td>
        <td>${escHtml(ev.description || '')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Print / PDF ───────────────────────────────────────────
  function printReport() {
    if (!_reportData) return;

    // Capture map as image before opening print window
    let mapImageUrl = null;
    try {
      const mapCanvas = document.querySelector('#jr-map canvas');
      if (mapCanvas) mapImageUrl = mapCanvas.toDataURL('image/png');
    } catch (e) { /* cross-origin tiles may block canvas export */ }

    const printData = {
      ...(_reportData),
      track: undefined,        // omit large array
      generatedAt: new Date().toISOString(),
      mapImageUrl,
    };

    try {
      localStorage.setItem('jr_print_data', JSON.stringify(printData));
    } catch (e) {
      showError('Could not store report data for printing. Try reducing the date range.');
      return;
    }

    const printUrl = new URL('print.html', window.location.href).href;
    window.open(printUrl, '_blank');
  }

  // ── Public API ────────────────────────────────────────────
  const journeyReportAddin = { generate, printReport };
  window.journeyReport = journeyReportAddin;

  return { initialize, focus, blur };
})();
