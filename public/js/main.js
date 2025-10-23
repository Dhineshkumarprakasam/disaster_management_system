$(function () {
  // Fixed test coordinates (example: Central District Hospital location from seed data)
  const fixedLat = 12.9165;
  const fixedLng = 79.1325;
  
  success({ coords: { latitude: fixedLat, longitude: fixedLng } });

  function success(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    $.getJSON(`/api/resources/nearby?lat=${lat}&lng=${lng}`, function (resp) {
      displayResources(resp.resources, lat, lng);
    }).fail(function () {
      $('#location-status').text("Error loading resources.");
    });

    // Load current active disaster messages
    $.getJSON("/api/messages", function (resp) {
      showMessages(resp.messages);
    });
  }

  function displayResources(list, lat, lng) {
    if (!list.length) {
      $('#resources-table').addClass('d-none');
      $('#no-resources').removeClass('d-none');
      return;
    }
    $('#resources-table').removeClass('d-none');
    $('#no-resources').addClass('d-none');
    $('#resources-body').empty();
    list.forEach(function (r) {
      const dist = calcDistance(lat, lng, r.location.coordinates[1], r.location.coordinates[0]);
      $('#resources-body').append(
        `<tr>
          <td>${r.name}</td>
          <td>${r.type}</td>
          <td>${r.phones ? r.phones.join('<br>') : ""}</td>
          <td>${r.address || ""}</td>
          <td>${Math.round(dist)}</td>
        </tr>`
      );
    });
  }

  function deg2rad(d) { return d * Math.PI / 180; }

  // Haversine formula to calculate distance between two lat/lng points in meters
  function calcDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2)
      + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Show disaster messages as Bootstrap alerts
  function showMessages(msgs) {
    $('#messages-area').empty();
    msgs.forEach(function (m) {
      $('#messages-area').append(
        `<div class="alert alert-${alertClass(m.severity)} alert-dismissible fade show" role="alert">
          <b>${m.severity.toUpperCase()}:</b> ${escapeHtml(m.title)}<br>${escapeHtml(m.body)}
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>`
      );
    });
  }

  // Map severity to alert color
  function alertClass(severity) {
    if (severity === 'critical') return 'danger';
    if (severity === 'warning') return 'warning';
    return 'info';
  }

  // Prevent HTML injection
  function escapeHtml(text) {
    return $('<div>').text(text).html();
  }

  // Setup Server-Sent Events connection to receive live disaster messages
  if (window.EventSource) {
    const ev = new EventSource('/events');
    ev.addEventListener('message', function (e) {
      try {
        const msg = JSON.parse(e.data);
        showMessages([msg]);
      } catch {}
    });
  }
});
