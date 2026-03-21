// ---------------------------------------------------------------------------
// Admin R2 SQL Query Console — with integrated chart visualization
//
// Features:
// - Textarea for custom SQL queries
// - Preset query dropdown (8 curated analytics queries)
// - Toggle between table view and chart view
// - Auto-detects chart type from column shapes
// - Charts: uPlot (CDN) for time-series, vanilla canvas for bar/donut
// ---------------------------------------------------------------------------

import { adminLayout } from './admin-layout'
import { PRESET_QUERIES } from '../admin/r2sql'

export function adminQueryPage(): string {
  const presetsJson = JSON.stringify(PRESET_QUERIES)

  return adminLayout({
    title: 'Query Console',
    activePage: 'query',
    styles: `
      .query-toolbar {
        display: flex;
        gap: 12px;
        align-items: flex-end;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }

      .query-toolbar .form-group { margin-bottom: 0; }

      .query-editor {
        position: relative;
        margin-bottom: 16px;
      }

      .query-timing {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 8px;
      }

      /* View toggle */
      .view-toggle {
        display: inline-flex;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
      }

      .view-toggle button {
        background: none;
        border: none;
        padding: 6px 14px;
        font-family: 'Inter', sans-serif;
        font-size: 0.78rem;
        font-weight: 500;
        color: var(--text-secondary);
        cursor: pointer;
        transition: all 0.15s;
      }

      .view-toggle button.active {
        background: var(--accent);
        color: #fff;
      }

      .view-toggle button:hover:not(.active) {
        background: var(--surface-hover);
      }

      /* Results */
      .results-area {
        min-height: 200px;
      }

      .results-placeholder {
        text-align: center;
        padding: 60px 20px;
        color: var(--text-muted);
      }

      .results-placeholder .icon { font-size: 2rem; margin-bottom: 12px; }

      .results-error {
        background: rgba(239,68,68,0.1);
        border: 1px solid rgba(239,68,68,0.2);
        border-radius: 10px;
        padding: 16px;
        color: var(--red);
        font-size: 0.85rem;
      }

      /* Chart area */
      .chart-container {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 24px;
        min-height: 300px;
        display: none;
        position: relative;
      }

      .chart-container.visible { display: block; }

      .chart-controls {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .chart-controls select {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 6px 10px;
        color: var(--text-primary);
        font-family: 'Inter', sans-serif;
        font-size: 0.78rem;
        outline: none;
      }

      .chart-controls label {
        font-size: 0.7rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      #chartCanvas {
        width: 100%;
        height: 300px;
      }

      /* Table max height with scroll */
      .results-table-wrap {
        max-height: 500px;
        overflow: auto;
      }
    `,
    content: `
    <div class="admin-header">
      <h1>Query Console</h1>
      <p>Run SQL queries against the R2 analytics Iceberg table</p>
    </div>

    <div class="query-toolbar">
      <div class="form-group" style="min-width:200px">
        <label class="form-label" for="presetSelect">Preset Queries</label>
        <select class="form-select" id="presetSelect">
          <option value="">— Select a preset —</option>
        </select>
      </div>
      <button class="btn btn-primary" id="runBtn" onclick="runQuery()">▶ Run Query</button>
      <div style="flex:1"></div>
      <div class="view-toggle" id="viewToggle">
        <button class="active" data-view="table" onclick="switchView('table')">📊 Table</button>
        <button data-view="chart" onclick="switchView('chart')">📈 Chart</button>
      </div>
    </div>

    <div class="query-editor">
      <textarea
        class="form-textarea"
        id="queryInput"
        placeholder="SELECT * FROM analytics LIMIT 10"
        rows="5"
      ></textarea>
    </div>

    <div class="results-area" id="resultsArea">
      <div class="results-placeholder">
        <div class="icon">🔍</div>
        <p>Select a preset or write a query, then hit Run.</p>
      </div>
    </div>

    <div class="chart-container" id="chartContainer">
      <div class="chart-controls" id="chartControls">
        <div>
          <label>Dimension</label><br>
          <select id="dimSelect" onchange="updateChart()"></select>
        </div>
        <div>
          <label>Metric</label><br>
          <select id="metricSelect" onchange="updateChart()"></select>
        </div>
        <div>
          <label>Chart Type</label><br>
          <select id="chartTypeSelect" onchange="updateChart()">
            <option value="auto">Auto</option>
            <option value="line">Line</option>
            <option value="bar">Bar</option>
            <option value="hbar">Horizontal Bar</option>
            <option value="donut">Donut</option>
          </select>
        </div>
      </div>
      <canvas id="chartCanvas"></canvas>
    </div>

    <div class="query-timing" id="queryTiming"></div>
    `,
    scripts: `
    <script src="https://cdn.jsdelivr.net/npm/uplot@1.6.31/dist/uPlot.iife.min.js" integrity="sha384-XMP23k7YSCFr13Xrkxh4IO0v1W+8fB6AP+3Vycxphp2Z0V2vocAZHyuGaFCysrtM" crossorigin="anonymous"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/uplot@1.6.31/dist/uPlot.min.css" integrity="sha384-IfV0B7MIOYuO95kO9G5ySKPz/85zqFNOAs8iy4tkK5zd9izhJAB8b7lHrwYqqmYE" crossorigin="anonymous">
    <script>
    // ── State ────────────────────────────────────────────
    const PRESETS = ${presetsJson};
    let currentData = null;
    let currentView = 'table';
    let uplotInstance = null;

    // Palette matching the site design
    const COLORS = ['#6366f1','#22c55e','#eab308','#f97316','#ef4444','#a78bfa','#ec4899','#14b8a6','#f59e0b','#8b5cf6'];

    // ── Init presets ─────────────────────────────────────
    (function() {
      var sel = document.getElementById('presetSelect');
      PRESETS.forEach(function(p, i) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = p.label;
        sel.appendChild(opt);
      });

      sel.addEventListener('change', function() {
        if (this.value === '') return;
        var preset = PRESETS[parseInt(this.value)];
        document.getElementById('queryInput').value = preset.sql;
        // Auto-set chart type
        document.getElementById('chartTypeSelect').value = preset.chart || 'auto';
      });
    })();

    // ── Run query ────────────────────────────────────────
    async function runQuery() {
      var sql = document.getElementById('queryInput').value.trim();
      if (!sql) return;

      var btn = document.getElementById('runBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Running…';

      var area = document.getElementById('resultsArea');
      area.innerHTML = '<div class="results-placeholder"><div class="icon">⏳</div><p>Running query…</p></div>';

      try {
        var res = await fetch('/admin/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql: sql }),
        });

        var data = await res.json();

        if (data.error) {
          area.innerHTML = '<div class="results-error">❌ ' + escapeHtml(data.error) + '</div>';
          document.getElementById('chartContainer').classList.remove('visible');
          currentData = null;
        } else {
          currentData = data;
          renderTable(data);
          populateChartControls(data);
          if (currentView === 'chart') {
            document.getElementById('chartContainer').classList.add('visible');
            updateChart();
          }
        }

        document.getElementById('queryTiming').textContent =
          data.rowCount !== undefined
            ? data.rowCount + ' rows · ' + data.timing + 'ms'
            : '';
      } catch (err) {
        area.innerHTML = '<div class="results-error">❌ Request failed: ' + escapeHtml(err.message) + '</div>';
      }

      btn.disabled = false;
      btn.textContent = '▶ Run Query';
    }

    // ── View toggle ──────────────────────────────────────
    function switchView(view) {
      currentView = view;
      document.querySelectorAll('.view-toggle button').forEach(function(b) {
        b.classList.toggle('active', b.dataset.view === view);
      });

      var chartEl = document.getElementById('chartContainer');
      if (view === 'chart' && currentData) {
        chartEl.classList.add('visible');
        updateChart();
      } else {
        chartEl.classList.remove('visible');
      }
    }

    // ── Table rendering ──────────────────────────────────
    function renderTable(data) {
      if (!data.columns || data.columns.length === 0) {
        document.getElementById('resultsArea').innerHTML =
          '<div class="results-placeholder"><p>No results.</p></div>';
        return;
      }

      var html = '<div class="results-table-wrap"><div class="admin-table-wrapper"><table class="admin-table"><thead><tr>';
      data.columns.forEach(function(col) {
        html += '<th>' + escapeHtml(String(col)) + '</th>';
      });
      html += '</tr></thead><tbody>';

      data.rows.forEach(function(row) {
        html += '<tr>';
        row.forEach(function(cell) {
          html += '<td>' + escapeHtml(String(cell ?? '')) + '</td>';
        });
        html += '</tr>';
      });

      html += '</tbody></table></div></div>';
      document.getElementById('resultsArea').innerHTML = html;
    }

    // ── Chart controls ───────────────────────────────────
    function populateChartControls(data) {
      var dimSel = document.getElementById('dimSelect');
      var metSel = document.getElementById('metricSelect');
      dimSel.innerHTML = '';
      metSel.innerHTML = '';

      if (!data.columns) return;

      data.columns.forEach(function(col, i) {
        // Check if column is numeric
        var isNumeric = data.rows.length > 0 && typeof data.rows[0][i] === 'number';
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = col;

        if (isNumeric) {
          metSel.appendChild(opt);
        } else {
          dimSel.appendChild(opt.cloneNode(true));
        }

        // Also add all to both as fallback
        if (!isNumeric) {
          metSel.appendChild(opt.cloneNode(true));
        }
        if (isNumeric) {
          dimSel.appendChild(opt.cloneNode(true));
        }
      });
    }

    // ── Chart rendering ──────────────────────────────────
    function updateChart() {
      if (!currentData || !currentData.rows.length) return;

      var dimIdx = parseInt(document.getElementById('dimSelect').value) || 0;
      var metIdx = parseInt(document.getElementById('metricSelect').value) || (currentData.columns.length > 1 ? 1 : 0);
      var chartType = document.getElementById('chartTypeSelect').value;

      var labels = currentData.rows.map(function(r) { return String(r[dimIdx] ?? ''); });
      var values = currentData.rows.map(function(r) { return Number(r[metIdx]) || 0; });

      // Auto-detect chart type
      if (chartType === 'auto') {
        chartType = autoDetect(labels, values);
      }

      var canvas = document.getElementById('chartCanvas');
      var container = document.getElementById('chartContainer');

      // Clear previous uPlot instance
      if (uplotInstance) {
        uplotInstance.destroy();
        uplotInstance = null;
      }

      // Clear canvas
      canvas.style.display = 'block';
      var existingUplot = container.querySelector('.u-wrap');
      if (existingUplot) existingUplot.remove();

      if (chartType === 'line') {
        renderLineChart(container, canvas, labels, values);
      } else if (chartType === 'bar') {
        renderBarChart(canvas, labels, values, false);
      } else if (chartType === 'hbar') {
        renderBarChart(canvas, labels, values, true);
      } else if (chartType === 'donut') {
        renderDonutChart(canvas, labels, values);
      }
    }

    function autoDetect(labels, values) {
      // Check if labels look like dates/timestamps
      var datePattern = /^\\d{4}-\\d{2}/;
      var numericPattern = /^\\d+$/;
      if (labels.length > 0 && datePattern.test(labels[0])) return 'line';
      if (labels.length > 0 && numericPattern.test(labels[0]) && labels.length >= 10) return 'line';
      if (labels.length <= 8) return 'donut';
      return 'bar';
    }

    // ── Line chart (uPlot) ───────────────────────────────
    function renderLineChart(container, canvas, labels, values) {
      canvas.style.display = 'none';

      // Parse labels as timestamps if possible
      var timestamps = labels.map(function(l) {
        var d = new Date(l);
        return isNaN(d.getTime()) ? 0 : d.getTime() / 1000;
      });

      // If timestamps didn't parse, use indices
      var useTimestamps = timestamps.every(function(t) { return t > 0; });
      var xData = useTimestamps ? timestamps : labels.map(function(_, i) { return i; });

      if (typeof uPlot === 'undefined') {
        // Fallback to bar chart if uPlot not loaded
        canvas.style.display = 'block';
        renderBarChart(canvas, labels, values, false);
        return;
      }

      var opts = {
        width: container.clientWidth - 48,
        height: 300,
        cursor: { show: true },
        scales: {
          x: useTimestamps ? { time: true } : {},
        },
        axes: [
          {
            stroke: '#55556a',
            grid: { stroke: 'rgba(255,255,255,0.05)' },
            ticks: { stroke: 'rgba(255,255,255,0.1)' },
            font: '11px Inter',
          },
          {
            stroke: '#55556a',
            grid: { stroke: 'rgba(255,255,255,0.05)' },
            ticks: { stroke: 'rgba(255,255,255,0.1)' },
            font: '11px Inter',
          },
        ],
        series: [
          {},
          {
            stroke: '#6366f1',
            width: 2,
            fill: 'rgba(99,102,241,0.1)',
            points: { show: true, size: 4, fill: '#6366f1' },
          },
        ],
      };

      var plotEl = document.createElement('div');
      container.appendChild(plotEl);

      uplotInstance = new uPlot(opts, [xData, values], plotEl);
    }

    // ── Bar chart (canvas) ───────────────────────────────
    function renderBarChart(canvas, labels, values, horizontal) {
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;
      var w = canvas.parentElement.clientWidth - 48;
      var h = horizontal ? Math.max(300, labels.length * 28) : 300;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      var maxVal = Math.max.apply(null, values) || 1;
      var pad = horizontal ? { top: 10, right: 20, bottom: 10, left: 120 } : { top: 10, right: 10, bottom: 60, left: 50 };

      if (horizontal) {
        var barH = Math.min(20, (h - pad.top - pad.bottom) / labels.length - 4);

        labels.forEach(function(label, i) {
          var y = pad.top + i * ((h - pad.top - pad.bottom) / labels.length);
          var barW = (values[i] / maxVal) * (w - pad.left - pad.right);

          ctx.fillStyle = COLORS[i % COLORS.length];
          ctx.fillRect(pad.left, y + 2, barW, barH);

          // Label
          ctx.fillStyle = '#8b8b9e';
          ctx.font = '11px Inter';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(label.length > 18 ? label.slice(0, 18) + '…' : label, pad.left - 8, y + 2 + barH / 2);

          // Value
          ctx.fillStyle = '#e8e8ed';
          ctx.textAlign = 'left';
          ctx.fillText(values[i].toLocaleString(), pad.left + barW + 6, y + 2 + barH / 2);
        });
      } else {
        var barW = Math.min(40, (w - pad.left - pad.right) / labels.length - 4);
        var spacing = (w - pad.left - pad.right) / labels.length;

        // Y-axis gridlines
        for (var g = 0; g <= 4; g++) {
          var gy = pad.top + (h - pad.top - pad.bottom) * (1 - g / 4);
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.beginPath();
          ctx.moveTo(pad.left, gy);
          ctx.lineTo(w - pad.right, gy);
          ctx.stroke();

          ctx.fillStyle = '#55556a';
          ctx.font = '10px Inter';
          ctx.textAlign = 'right';
          ctx.fillText(Math.round(maxVal * g / 4).toLocaleString(), pad.left - 6, gy + 4);
        }

        labels.forEach(function(label, i) {
          var x = pad.left + i * spacing + spacing / 2 - barW / 2;
          var barH = (values[i] / maxVal) * (h - pad.top - pad.bottom);
          var y = h - pad.bottom - barH;

          ctx.fillStyle = COLORS[i % COLORS.length];
          ctx.fillRect(x, y, barW, barH);

          // Label
          ctx.save();
          ctx.translate(x + barW / 2, h - pad.bottom + 8);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#8b8b9e';
          ctx.font = '10px Inter';
          ctx.textAlign = 'left';
          ctx.fillText(label.length > 12 ? label.slice(0, 12) + '…' : label, 0, 0);
          ctx.restore();
        });
      }
    }

    // ── Donut chart (canvas) ─────────────────────────────
    function renderDonutChart(canvas, labels, values) {
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;
      var w = canvas.parentElement.clientWidth - 48;
      var h = 300;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      var total = values.reduce(function(a, b) { return a + b; }, 0) || 1;
      var cx = w * 0.35;
      var cy = h / 2;
      var outerR = Math.min(cx - 20, cy - 20);
      var innerR = outerR * 0.6;

      var startAngle = -Math.PI / 2;

      values.forEach(function(val, i) {
        var sliceAngle = (val / total) * Math.PI * 2;

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fill();

        startAngle += sliceAngle;
      });

      // Center text
      ctx.fillStyle = '#e8e8ed';
      ctx.font = 'bold 24px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(total.toLocaleString(), cx, cy - 8);
      ctx.font = '11px Inter';
      ctx.fillStyle = '#55556a';
      ctx.fillText('total', cx, cy + 14);

      // Legend
      var legendX = w * 0.65;
      var legendY = 30;
      labels.forEach(function(label, i) {
        var pct = Math.round((values[i] / total) * 100);

        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fillRect(legendX, legendY + i * 28, 12, 12);

        ctx.fillStyle = '#e8e8ed';
        ctx.font = '12px Inter';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, legendX + 20, legendY + i * 28);

        ctx.fillStyle = '#8b8b9e';
        ctx.fillText(values[i].toLocaleString() + ' (' + pct + '%)', legendX + 20, legendY + i * 28 + 14);
      });
    }

    // ── Helpers ──────────────────────────────────────────
    function escapeHtml(s) {
      var div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }

    // Submit on Ctrl/Cmd+Enter
    document.getElementById('queryInput').addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runQuery();
      }
    });
    </script>
    `,
  })
}
