export const mapHtml = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
    #map { height: 100%; width: 100%; }
    .custom-popup .leaflet-popup-content-wrapper {
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      padding: 0;
    }
    .custom-popup .leaflet-popup-content { margin: 10px 14px; font-family: -apple-system, sans-serif; }
    .custom-popup .leaflet-popup-tip { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .popup-title { font-weight: 700; font-size: 13px; color: #1F2937; margin-bottom: 4px; }
    .popup-status { font-size: 11px; color: #6B7280; }
    .status-badge { font-weight: 700; border-radius: 4px; padding: 1px 5px; margin-left: 4px; }
    .popup-status-closed { color: #059669; }
    .popup-status-inprogress { color: #D97706; }
    .popup-status-pending { color: #2563EB; }
    .popup-cat { font-size: 11px; color: #6B7280; margin-top: 2px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
  (function () {
    var map;
    var reportMarkerLayer = L.layerGroup();
    var canalLayer        = L.layerGroup();
    var userLocationLayer = L.layerGroup();

    var FEATURE_COLORS = {
      main_canal: '#2563EB', lateral: '#7C3AED',
      farm_ditch: '#06B6D4', pipeline: '#F59E0B',
      canal: '#74A5A8', other: '#6B7280',
    };
    var FEATURE_STROKE = {
      main_canal: 6, lateral: 5, farm_ditch: 2, pipeline: 4, canal: 4, other: 4
    };
    var CATEGORY_COLORS = {
      inspection: '#3B82F6', maintenance: '#F59E0B',
      cleaning: '#06B6D4', issue: '#EF4444', other: '#6B7280'
    };

    function statusColor(status) {
      if (status === 'closed')      return '#10B981';
      if (status === 'in_progress') return '#EF4444';
      if (status === 'rejected')    return '#EF4444';
      return '#F59E0B';
    }
    var STATUS_LABEL = {
      pending: 'Pending', in_progress: 'In Progress', closed: 'Closed', rejected: 'Rejected'
    };

    function drawFlagBody(ctx, color, progress, w, h, poleW, flagW, tipX) {
      var restCX  = Math.max(poleW + 3, tipX - 4);
      var waveCX  = Math.max(poleW + 8, tipX + 4);
      var ctrlX   = restCX + (waveCX - restCX) * progress;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(poleW, 2);
      ctx.lineTo(ctrlX, 2);
      ctx.quadraticCurveTo(ctrlX, h * 0.46, tipX, h * 0.54);
      ctx.lineTo(poleW, h * 0.58);
      ctx.closePath();
      ctx.fill();
    }
    function drawFlagPole(ctx, poleColor, w, h, poleW, poleX) {
      ctx.strokeStyle = poleColor;
      ctx.lineWidth   = poleW;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(poleX, 2);
      ctx.lineTo(poleX, h * 0.78);
      ctx.stroke();
    }
    function drawFlag(ctx, color, poleColor, size, frame) {
      var w = size, h = size * 1.14;
      var cs = ctx.canvas;
      cs.width = w; cs.height = h;
      ctx.clearRect(0, 0, w, h);
      var poleW = w * 0.058, flagW  = w * 0.68;
      var tipX  = flagW - poleW, poleX = poleW / 2;
      var cycle = 2200;
      var t     = ((Date.now() + frame * 16) % cycle) / cycle;
      var progress = t < 0.38 ? t / 0.38
                    : t < 0.50 ? 1
                    : t < 0.88 ? (0.88 - t) / 0.38
                    : 0;
      drawFlagBody(ctx, color, progress, w, h, poleW, flagW, tipX);
      drawFlagPole(ctx, poleColor, w, h, poleW, poleX);
    }

    function drawTeardropBody(ctx, color, cx, cy, r, svgH) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, svgH);
      ctx.quadraticCurveTo(cx - r * 1.05, svgH * 0.72, cx - r, cy);
      ctx.arc(cx - 0.001, cy, r, Math.PI, Math.PI * 2);
      ctx.quadraticCurveTo(cx + r * 1.05, svgH * 0.72, cx, svgH);
      ctx.closePath();
      ctx.fill();
    }
    function drawTeardropInnerCircle(ctx, cx, cy, r) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx, cy * 0.88, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
    function drawTeardropCategoryIconPath(ctx, category, cx, cy, r, scale) {
      var paths = {
        inspection:  'M9.5 2.5a.75.75 0 0 0-1.5 0v2.25a.75.75 0 0 0 .08.43l1.72 2.72a.75.75 0 0 0 .36.19h3.8a.75.75 0 0 0 .6-.7l.07-1.35A.75.75 0 0 0 13 5.3l-.29-.28-1.7 1.7a.75.75 0 0 0 1.06 1.06L14 7.06a.75.75 0 0 0-.36.19l-2.05 1.74a.25.25 0 0 1-.09.14.25.25 0 0 1-.14.09H9.26a.25.25 0 0 1-.17-.07.25.25 0 0 1-.08-.16V3.94a.25.25 0 0 1 .25-.25h1a.25.25 0 0 1 .25.25V8.5a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5V3.06a.75.75 0 0 0-1.5 0v3.31a.25.25 0 0 1-.17.07.25.25 0 0 1-.17-.09l-.88-.75A.75.75 0 0 0 9.5 5.1V2.5z M10 16.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
        maintenance: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
        cleaning:    'M8 6h13 M8 12h13 M8 18h13 M3 6h1 M3 12h1 M3 18h1',
        issue:       'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z M12 9v4 M12 17h.01',
      };
      var defaultPath = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z';
      ctx.fillStyle = 'currentColor';
      var iconScale = 0.72;
      var tx = cx - (12 * iconScale) + 1;
      var ty = (cy * 0.85) - (12 * iconScale) + 2;
      var p  = new Path2D(paths[category] || defaultPath);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(iconScale, iconScale);
      ctx.fill(p);
      ctx.restore();
    }
    function drawTeardrop(ctx, color, category, status, createdAt, size, frame) {
      var w = size, h = Math.ceil(size * 1.15);
      var cs = ctx.canvas;
      cs.width = w; cs.height = h;
      ctx.clearRect(0, 0, w, h);
      var opacity = 1;
      if (status === 'closed') {
        if (createdAt) {
          var created = new Date(createdAt);
          if (!isNaN(created.getTime())) {
            var daysOld = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
            if (daysOld > 7) opacity = 0;
            else opacity = Math.max(0.2, (7 - daysOld) / 3);
          }
        }
      } else if (status === 'pending') { opacity = 0.45; }
      ctx.globalAlpha = opacity;
      var cx = w / 2, cy = h * 0.40, r = w * 0.44;
      drawTeardropBody(ctx, color, cx, cy, r, h);
      drawTeardropInnerCircle(ctx, cx, cy, r);
      drawTeardropCategoryIconPath(ctx, category, cx, cy, r, 0.72);
      ctx.globalAlpha = 1;
    }

    var _iconFrame  = 0;
    function makeFlagIconLive(color, size) {
      var c = document.createElement('canvas');
      c.width  = size;
      c.height = Math.ceil(size * 1.14);
      var ctx = c.getContext('2d');
      function render() { drawFlag(ctx, color, '#6B7280', size, _iconFrame++); }
      render();
      var t = setInterval(render, 50);
      return L.icon({
        iconUrl: c.toDataURL(),
        iconSize: [size, Math.ceil(size * 1.14)],
        iconAnchor: [size * 0.5, Math.ceil(size * 1.14)],
        popupAnchor: [0, -Math.ceil(size * 1.14)],
      });
    }

    function makeTeardropIconLive(color, category, status, createdAt, size) {
      var c = document.createElement('canvas');
      c.width  = size;
      c.height = Math.ceil(size * 1.15);
      var ctx = c.getContext('2d');
      function render() { drawTeardrop(ctx, color, category, status, createdAt, size, 0); }
      render();
      var t = setInterval(render, 20);
      return L.icon({
        iconUrl: c.toDataURL(),
        iconSize: [size, Math.ceil(size * 1.15)],
        iconAnchor: [size * 0.5, Math.ceil(size * 1.15)],
        popupAnchor: [0, -Math.ceil(size * 1.15)],
      });
    }

    function buildCanals(canals) {
      canalLayer.clearLayers();
      canals.forEach(function (feat, idx) {
        try {
          var g = feat.geometry, p = feat.properties || {};
          if (!g || !g.coordinates) return;
          var color     = (FEATURE_COLORS[p.feature_type] || FEATURE_COLORS.canal);
          var strokeCol = 'rgba(' + parseInt(color.slice(1, 3), 16) + ',' +
                                   parseInt(color.slice(3, 5), 16) + ',' +
                                   parseInt(color.slice(5, 7), 16) + ',0.82)';
          var sw = FEATURE_STROKE[p.feature_type] || 4;
          if (g.type === 'MultiLineString') {
            g.coordinates.forEach(function (line, li) {
              if (!line || line.length < 2) return;
              var coords = line.map(function (c) { return [c[1], c[0]]; });
              L.polyline(coords, { color: strokeCol, weight: sw, lineJoin: 'round', opacity: 0.88 }).addTo(canalLayer);
            });
          } else if (g.type === 'LineString') {
            if (!g.coordinates || g.coordinates.length < 2) return;
            var coords = g.coordinates.map(function (c) { return [c[1], c[0]]; });
            L.polyline(coords, { color: strokeCol, weight: sw, lineJoin: 'round', opacity: 0.88 }).addTo(canalLayer);
          }
        } catch (e) { /* skip bad feature */ }
      });
      if (!canalLayer._map) canalLayer.addTo(map);
    }

    function buildMarkers(reports) {
      reportMarkerLayer.clearLayers();
      reports.forEach(function (feat) {
        var props  = feat.properties || {};
        var geom   = feat.geometry && feat.geometry.coordinates;
        if (!geom || geom.length < 2) return;
        if (props.is_valid === false) return;
        var lat    = geom[1], lng = geom[0];
        var reportId = String(props.id || feat.id || '');
        var hasTicketId  = !!props.ticket_id;
        var isStandalone = !hasTicketId;
        if (hasTicketId) {
          var status = props.status || 'pending';
          var color  = statusColor(status);
          var cat    = props.category || 'other';
          var icon   = makeFlagIconLive(color, 40);
          var marker = L.marker([lat, lng], { icon: icon }).addTo(reportMarkerLayer);
          marker.featureId = reportId;
          var popupHtml = '<div class="popup-title">Ticket \\u2013 ' +
                          (props.location_name || ('#' + reportId.slice(0, 8))) + '</div>' +
                          '<div class="popup-status">Status: ' +
                          '<span class="status-badge ' + (status === 'closed' ? 'popup-status-closed' :
                                                          status === 'in_progress' ? 'popup-status-inprogress' : 'popup-status-pending') + '">' +
                          (STATUS_LABEL[status] || status) + '</span></div>' +
                          '<div class="popup-cat">Category: ' + (cat || '?').toUpperCase() + '</div>';
          marker.bindPopup(popupHtml, { className: 'custom-popup' });
          marker.on('click', function () { post('markerClick', { reportId: reportId }); });
        } else if (isStandalone) {
          var cat2    = (props.category || 'other');
          if (cat2 === 'issue') return;
          var color2  = CATEGORY_COLORS[cat2] || CATEGORY_COLORS.other;
          var status2 = props.status || 'pending';
          var icon2   = makeTeardropIconLive(color2, cat2, status2, props.createdAt || props.created_at, 44);
          var marker2 = L.marker([lat, lng], { icon: icon2 }).addTo(reportMarkerLayer);
          marker2.featureId = reportId;
          var popupHtml2 = '<div class="popup-title">' +
                           (props.location_name || ('#' + reportId.slice(0, 8))) + '</div>' +
                           '<div class="popup-cat">' + (STATUS_LABEL[cat2] || cat2) + ' \\u2013 No Ticket</div>';
          marker2.bindPopup(popupHtml2, { className: 'custom-popup' });
          marker2.on('click', function () { post('markerClick', { reportId: reportId }); });
        }
      });
    }

    function post(type, payload) {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
      } catch (e) { /* ignored */ }
    }

    window.addEventListener('message', function (e) {
      try {
        var msg = JSON.parse(e.data);
      } catch (err) { return; }
      if (msg.type === 'updateMap') {
        var data = msg.payload || {};
        var reportsData = data.reports || [];
        if (data.reportsResult) {
          reportsData = data.reportsResult.data && data.reportsResult.data.features || [];
        }
        var canalsData  = (data.canals || []);
        if (Array.isArray(canalsData) && canalsData[0] && canalsData[0].type === 'FeatureCollection') {
          canalsData = canalsData.flatMap(function (fc) { return fc.features || []; });
        }
        var filteredCanals = canalsData;
        if (data.filters && data.filters.feature_type) {
          filteredCanals = (canalsData || []).filter(function (f) {
            return (f.properties || {}).feature_type === data.filters.feature_type;
          });
        }
        var filteredReports = reportsData || [];
        if (data.filters) {
          var f = data.filters;
          filteredReports = filteredReports.filter(function (feat) {
            var p = feat.properties || {};
            if (p.is_valid === false) return false;
            if (f.feature_type && (p.area_type || p.feature_type || '') !== f.feature_type) return false;
            return true;
          });
        }
        reportMarkerLayer.clearLayers();
        if (!map.hasLayer(canalLayer)) canalLayer.addTo(map);
        buildMarkers(filteredReports);
        buildCanals(filteredCanals);
      }
      if (msg.type === 'panTo') {
        var lat = msg.lat, lng = msg.lng;
        if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 15));
      }
      if (msg.type === 'panToLocation') {
        var lat = msg.lat, lng = msg.lng, zoom = msg.zoom || 17;
        if (lat != null && lng != null) map.setView([lat, lng], zoom);
      }
      if (msg.type === 'setUserLocation') {
        var lat = msg.lat, lng = msg.lng;
        userLocationLayer.clearLayers();
        if (lat != null && lng != null) {
          L.circle([lat, lng], { radius: 22, color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.18, weight: 2 })
            .addTo(userLocationLayer);
          L.circleMarker([lat, lng], { radius: 7, color: '#fff', fillColor: '#2563EB', fillOpacity: 1, weight: 3 })
            .addTo(userLocationLayer);
        }
      }
    });

    document.addEventListener('message', function (e) {
      window.dispatchEvent(new MessageEvent('message', { data: e.data }));
    });

    map = L.map('map', {
      center: [6.5, 125.0],
      zoom:   10,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    reportMarkerLayer.addTo(map);
    canalLayer.addTo(map);
    userLocationLayer.addTo(map);

    post('mapReady');
  })();
  </script>
</body>
</html>`;
