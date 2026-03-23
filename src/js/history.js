// ---------------------------------------------------------------------------
// Score History Bar Chart — client-side SVG
//
// Fixed 30-day window, 0-100 y-axis, one bar per day.
// Empty days rendered as subtle dashed placeholders.
// Legend with "Score" label and 0/100 markers.
//
// Reads owner/repo from data attributes on #historyContainer.
// ---------------------------------------------------------------------------

(function () {
  var DAYS = 30;

  function scoreColor(s) {
    if (s >= 80) return '#22c55e';
    if (s >= 60) return '#eab308';
    if (s >= 40) return '#f97316';
    if (s >= 20) return '#ef4444';
    return '#6b7280';
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function renderChart(data) {
    var container = document.getElementById('historyContainer');
    if (!container) return;

    var history = data.history || [];

    // Build a map of date → score (latest per day)
    var scoreMap = {};
    history.forEach(function (p) {
      var day = p.date.split('T')[0];
      scoreMap[day] = p.score;
    });

    // Build fixed 30-day window ending today
    var today = new Date();
    var days = [];
    for (var i = DAYS - 1; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var key = formatDate(d);
      days.push({ date: key, score: scoreMap[key] !== undefined ? scoreMap[key] : null });
    }

    var hasAnyData = days.some(function (d) { return d.score !== null; });

    // Chart dimensions
    var width = 800;
    var height = 44;
    var leftPad = 28;  // room for 100/0 labels
    var rightPad = 4;
    var topPad = 2;
    var bottomPad = 2;
    var chartW = width - leftPad - rightPad;
    var chartH = height - topPad - bottomPad;
    var barGap = 2;
    var barW = (chartW - barGap * (DAYS - 1)) / DAYS;

    var bars = '';
    days.forEach(function (day, i) {
      var x = leftPad + i * (barW + barGap);

      if (day.score !== null) {
        var barH = (day.score / 100) * chartH;
        var y = topPad + chartH - barH;
        var color = scoreColor(day.score);
        bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" rx="1" fill="' + color + '" opacity="0.85">'
          + '<title>' + day.date + ': ' + day.score + '/100</title></rect>';
      } else {
        // Empty day — subtle dashed placeholder
        var ph = chartH * 0.15;
        bars += '<rect x="' + x.toFixed(1) + '" y="' + (topPad + chartH - ph).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + ph.toFixed(1) + '" rx="1" fill="currentColor" opacity="0.08">'
          + '<title>' + day.date + ': no data</title></rect>';
      }
    });

    // Y-axis labels
    var yLabels = '<text x="' + (leftPad - 4) + '" y="' + (topPad + 6) + '" text-anchor="end" font-size="7" fill="currentColor" opacity="0.3">100</text>';
    yLabels += '<text x="' + (leftPad - 4) + '" y="' + (topPad + chartH) + '" text-anchor="end" font-size="7" fill="currentColor" opacity="0.3">0</text>';

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" style="color: var(--text-primary)">'
      + yLabels + bars
      + '</svg>';

    // Date labels below
    var firstDate = days[0].date;
    var lastDate = days[days.length - 1].date;
    var dateRow = '<div class="history-dates">'
      + '<span>' + firstDate + '</span>'
      + '<span style="flex:1; text-align:center; font-size: 0.6rem; opacity:0.5">Score History · 30 days</span>'
      + '<span>' + lastDate + '</span>'
      + '</div>';

    // Empty state message
    var emptyMsg = '';
    if (!hasAnyData) {
      emptyMsg = '<div style="text-align:center;font-size:0.72rem;color:var(--text-muted);padding:4px 0 2px;">📊 Collecting data — scores will appear as the repo is checked daily</div>';
    }

    container.innerHTML = '<div class="history-bar">'
      + svg + dateRow + emptyMsg
      + '</div>';
  }

  function loadHistory() {
    var container = document.getElementById('historyContainer');
    if (!container) return;

    var owner = container.getAttribute('data-owner');
    var repo = container.getAttribute('data-repo');
    if (!owner || !repo) return;

    fetch('/_data/history/github/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(renderChart)
      .catch(function () {
        // Still show empty chart on error
        renderChart({ history: [] });
      });
  }

  loadHistory();
})();
