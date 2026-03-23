// ---------------------------------------------------------------------------
// Score History Sparkline — client-side SVG chart
//
// Fetches history from /_data/history/github/:owner/:repo
// and renders a pure SVG sparkline with hover tooltips.
//
// Reads owner/repo from data attributes on #historyContainer:
//   <div id="historyContainer" data-owner="vercel" data-repo="next.js">
// ---------------------------------------------------------------------------

(function () {
  function renderChart(data) {
    var container = document.getElementById('historyContainer');
    if (!container) return;

    var history = data.history || [];

    // Need at least 3 data points for a meaningful chart
    if (history.length < 3) {
      container.style.display = 'none';
      return;
    }

    // Take last 30 data points max
    var points = history.slice(-30);
    var scores = points.map(function (p) { return p.score; });
    var minScore = Math.min.apply(null, scores);
    var maxScore = Math.max.apply(null, scores);
    var range = maxScore - minScore || 1;

    // Chart dimensions
    var width = 800;
    var height = 40;
    var padding = 4;
    var chartWidth = width - padding * 2;
    var chartHeight = height - padding * 2;

    // Build SVG path
    var pathPoints = points.map(function (p, i) {
      var x = padding + (i / (points.length - 1)) * chartWidth;
      var y = padding + chartHeight - ((p.score - minScore) / range) * chartHeight;
      return { x: x, y: y, score: p.score, date: p.date };
    });

    var pathD = pathPoints.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
    }).join(' ');

    // Gradient fill path (closed polygon)
    var fillD = pathD + ' L' + pathPoints[pathPoints.length - 1].x.toFixed(1) + ',' + (height - padding) + ' L' + pathPoints[0].x.toFixed(1) + ',' + (height - padding) + ' Z';

    // Score color
    var lastScore = scores[scores.length - 1];
    var color;
    if (lastScore >= 80) color = '#22c55e';
    else if (lastScore >= 60) color = '#eab308';
    else if (lastScore >= 40) color = '#f97316';
    else color = '#ef4444';

    // Date labels
    var firstDate = points[0].date;
    var lastDate = points[points.length - 1].date;

    // Build tooltip circles (invisible, shown on hover via CSS)
    var circles = pathPoints.map(function (p) {
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="' + color + '" opacity="0" class="history-dot"><title>' + p.date + ': ' + p.score + '/100</title></circle>';
    }).join('');

    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">'
      + '<defs><linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.15"/>'
      + '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>'
      + '</linearGradient></defs>'
      + '<path d="' + fillD + '" fill="url(#histGrad)" />'
      + '<path d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />'
      + circles
      + '</svg>';

    var dateRow = '<div class="history-dates">'
      + '<span>' + firstDate + '</span>'
      + '<span>' + lastDate + '</span>'
      + '</div>';

    container.innerHTML = '<div class="history-bar">'
      + svg + dateRow
      + '</div>';

    // Add hover interactivity
    container.querySelectorAll('.history-dot').forEach(function (dot) {
      dot.addEventListener('mouseenter', function () { dot.setAttribute('opacity', '1'); });
      dot.addEventListener('mouseleave', function () { dot.setAttribute('opacity', '0'); });
    });
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
        // Non-critical — hide chart silently
        if (container) container.style.display = 'none';
      });
  }

  loadHistory();
})();
