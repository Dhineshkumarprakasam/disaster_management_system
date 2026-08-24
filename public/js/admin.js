// Message Alert Dialog Helper
function showMessage(title, message) {
  try {
    console.log('[showMessage] called with:', title, message);
    
    // Set content
    const titleEl = document.getElementById('messageAlertTitle');
    const bodyEl = document.getElementById('messageAlertBody');
    
    if (titleEl) {
      titleEl.textContent = title;
      console.log('[showMessage] Title element found and updated');
    } else {
      console.warn('[showMessage] Title element not found');
    }
    
    if (bodyEl) {
      bodyEl.textContent = message;
      console.log('[showMessage] Body element found and updated');
    } else {
      console.warn('[showMessage] Body element not found');
    }
    
    // Show modal using Bootstrap
    const modal = document.getElementById('messageAlertModal');
    if (modal) {
      console.log('[showMessage] Modal element found');
      try {
        // Try Bootstrap modal API
        const bsModal = new bootstrap.Modal(modal, { backdrop: 'static', keyboard: false });
        bsModal.show();
        console.log('[showMessage] Bootstrap modal shown successfully');
      } catch (bootstrapError) {
        console.warn('[showMessage] Bootstrap modal error, trying jQuery:', bootstrapError);
        try {
          // Fallback to jQuery Bootstrap modal
          $('#messageAlertModal').modal('show');
          console.log('[showMessage] jQuery modal shown successfully');
        } catch (jqueryError) {
          console.error('[showMessage] jQuery modal error:', jqueryError);
        }
      }
    } else {
      console.error('[showMessage] messageAlertModal element not found in DOM');
    }
  } catch (e) {
    console.error('[showMessage] Unexpected error:', e);
  }
}

let isLoggedIn = false;
let adminInfo = null;
let resourceMap = null;
let resourceMarker = null;
let resourceCoordinates = null;

function setResourcePoint(lat, lng) {
  resourceCoordinates = { lat, lng };
  if (!resourceMarker) {
    resourceMarker = L.marker([lat, lng], { draggable: true }).addTo(resourceMap);
    resourceMarker.on('dragend', function () {
      const point = resourceMarker.getLatLng();
      setResourcePoint(point.lat, point.lng);
    });
  } else {
    resourceMarker.setLatLng([lat, lng]);
  }
  resourceMap.setView([lat, lng], Math.max(resourceMap.getZoom(), 14));
  $('#resource-map-status').text(`Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
}

function initResourceMap() {
  if (resourceMap) {
    resourceMap.invalidateSize();
    return;
  }
  resourceMap = L.map('resource-map').setView([26.1445, 91.7362], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(resourceMap);
  resourceMap.on('click', event => setResourcePoint(event.latlng.lat, event.latlng.lng));
  setTimeout(() => resourceMap.invalidateSize(), 0);
}

$(function () {
  const loginConfig = {
    '/admin/login': { role: 'admin', url: '/api/auth/admin/login', title: 'Administrator sign in', copy: 'Platform administration, official account management, and system oversight.', button: 'Sign in as administrator', className: 'btn-primary' },
    '/government/login': { role: 'government', url: '/api/auth/government/login', title: 'Government official sign in', copy: 'Verify incidents, approve volunteers, coordinate resources, and manage active response.', button: 'Sign in as government official', className: 'btn-success' },
    '/volunteer/login': { role: 'volunteer', url: '/api/auth/volunteer/login', title: 'Volunteer sign in', copy: 'View assigned relief requests and report completed response work.', button: 'Sign in as volunteer', className: 'btn-warning' }
  };
  const config = loginConfig[window.location.pathname] || loginConfig['/admin/login'];
  $('#login-copy').html(`<h3>${config.title}</h3><p class="text-muted">${config.copy}</p>`);
  $('#login-submit').text(config.button).addClass(config.className);
  $('#login-switcher').html(`<span class="text-muted">Other access:</span> <a href="/admin/login">Administrator</a> <a href="/government/login">Government official</a> <a href="/volunteer/login">Volunteer</a>`);
  checkSession();

  function checkSession() {
    $.get('/api/auth/me')
      .done(function (data) {
      adminInfo = data.user;
        isLoggedIn = true;
        $('#login-section').addClass('d-none');
        $('#admin-dashboard').removeClass('d-none');
        $('#admin-logout').removeClass('d-none');
        $('#role-banner').text(`Signed in as ${adminInfo.name} (${adminInfo.role})`);
        if (adminInfo.role === 'admin') $('#government-form-card').removeClass('d-none');
        if (adminInfo.role === 'admin' || adminInfo.role === 'government') {
          $('#workflow-section').removeClass('d-none');
          loadWorkflows();
        }
        if (adminInfo.role === 'volunteer') {
          $('#btn-add-message, #btn-add-resource, #messages-table, #resources-table, #admins-table').addClass('d-none');
          loadVolunteerRequests();
        }
        if (adminInfo.role !== 'volunteer') loadAll();
      })
      .fail(function () {
        $('#login-section').removeClass('d-none');
        $('#admin-dashboard').addClass('d-none');
      });
  }

  // Login form
  $('#login-form').submit(function (e) {
    e.preventDefault();
    const form = $(this);
    const username = $('#username').val();
    const password = $('#password').val();
    $.ajax({
      type: 'POST',
      url: config.url,
      data: JSON.stringify({ username, password, role: config.role }),
      contentType: 'application/json'
    }).done(function (data) {
      isLoggedIn = true;
      $('#login-error').addClass('d-none');
      checkSession();
    }).fail(function (xhr) {
      $('#login-error').removeClass('d-none').text(xhr.responseJSON?.error || "Login failed");
    });
  });

  $('#admin-logout').click(function () {
    $.post('/api/admin/logout').always(function () {
      location.reload();
    });
  });

  function loadAll() {
    loadMessages();
    loadResources();
    loadAdmins();
  }

  // Messages CRUD
  function loadMessages() {
    $.get('/api/admin/messages', function (data) {
      const msgs = data.messages || [];
      $('#messages-body').empty();
      msgs.forEach(function (m) {
        $('#messages-body').append(
          `<tr>
            <td>${m.title}</td>
            <td>${m.severity}</td>
            <td>${m.area || ""}</td>
            <td>${m.active ? "Yes" : "No"}</td>
            <td>
              <button class="btn btn-sm btn-warning me-2 btn-edit-message" data-id="${m._id}">Edit</button>
              <button class="btn btn-sm btn-danger btn-del-message" data-id="${m._id}">Delete</button>
            </td>
          </tr>`
        );
      });
    });
  }

  $('#btn-add-message').click(function () {
    $('#message-form')[0].reset();
    $('#msg-id').val('');
    $('#messageModalLabel').text('Add New Message');
    $('#messageModal').modal('show');
  });

  $('#messages-table').on('click', '.btn-edit-message', function () {
    const id = $(this).data('id');
    $.get('/api/admin/messages', function (data) {
      const m = (data.messages || []).find(x => x._id === id);
      if (!m) return;
      $('#msg-id').val(m._id);
      $('#msg-title').val(m.title);
      $('#msg-body').val(m.body);
      $('#msg-severity').val(m.severity);
      $('#msg-area').val(m.area);
      $('#msg-active').prop('checked', !!m.active);
      $('#messageModalLabel').text('Edit Message');
      $('#messageModal').modal('show');
    });
  });

  $('#messages-table').on('click', '.btn-del-message', function () {
    if (confirm('Delete this message?')) {
      const id = $(this).data('id');
      $.ajax({ type: 'DELETE', url: '/api/admin/messages/' + id }).done(loadMessages);
    }
  });

  $('#message-form').submit(function (e) {
    e.preventDefault();
    const id = $('#msg-id').val();
    const obj = {
      title: $('#msg-title').val(),
      body: $('#msg-body').val(),
      severity: $('#msg-severity').val(),
      area: $('#msg-area').val(),
      active: $('#msg-active').is(':checked')
    };
    if (id) {
      $.ajax({
        type: 'PUT',
        url: '/api/admin/messages/' + id,
        data: JSON.stringify(obj),
        contentType: 'application/json'
      }).done(() => {
        $('#messageModal').modal('hide');
        loadMessages();
      });
    } else {
      $.ajax({
        type: 'POST',
        url: '/api/admin/messages',
        data: JSON.stringify(obj),
        contentType: 'application/json'
      }).done(() => {
        $('#messageModal').modal('hide');
        loadMessages();
      });
    }
  });

  // Resource CRUD
  function loadResources() {
  $.get('/api/admin/resources', function (data) {
    const list = Array.isArray(data) ? data : data.resources || [];
    $('#resources-body').empty();
    list.forEach(function (r) {
      $('#resources-body').append(
        `<tr>
          <td>${r.name}</td>
          <td>${r.type}</td>
          <td>${(r.phones || []).join('<br>')}</td>
          <td>
            <button class="btn btn-sm btn-warning me-2 btn-edit-resource" data-id="${r._id}">Edit</button>
            <button class="btn btn-sm btn-danger btn-del-resource" data-id="${r._id}">Delete</button>
          </td>
        </tr>`
      );
    });
  });
}

  $('#btn-add-resource').click(function () {
    $('#resource-form')[0].reset();
    $('#res-id').val('');
    if (resourceMarker) resourceMap.removeLayer(resourceMarker);
    resourceCoordinates = null;
    resourceMarker = null;
    $('#resourceModalLabel').text('Add Resource');
    $('#resourceModal').modal('show');
    setTimeout(initResourceMap, 50);
  });

  $('#resource-locate').click(function () {
    initResourceMap();
    if (!navigator.geolocation) return $('#resource-map-status').text('Location is unavailable. Click the map to choose a point.');
    navigator.geolocation.getCurrentPosition(
      position => setResourcePoint(position.coords.latitude, position.coords.longitude),
      () => $('#resource-map-status').text('Location permission was unavailable. Click the map to choose a point.'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });

  $('#resources-table').on('click', '.btn-edit-resource', function () {
    const id = $(this).data('id');
    resourceCoordinates = null;
    if (resourceMarker) resourceMap.removeLayer(resourceMarker);
    resourceMarker = null;
    $.get('/api/admin/resources', function (data) {
      const r = (data.resources || []).find(x => x._id === id);
      if (!r) return;
      $('#res-id').val(r._id);
      $('#res-name').val(r.name);
      $('#res-type').val(r.type);
      $('#res-phones').val((r.phones || []).join(','));
      $('#res-address').val(r.address);
      if (r.location && r.location.coordinates) {
        resourceCoordinates = { lng: Number(r.location.coordinates[0]), lat: Number(r.location.coordinates[1]) };
      }
      $('#resourceModalLabel').text('Edit Resource');
      $('#resourceModal').modal('show');
      setTimeout(function () {
        initResourceMap();
        if (resourceCoordinates) setResourcePoint(resourceCoordinates.lat, resourceCoordinates.lng);
      }, 50);
    });
  });

  $('#resources-table').on('click', '.btn-del-resource', function () {
    if (confirm('Delete this resource?')) {
      const id = $(this).data('id');
      $.ajax({ type: 'DELETE', url: '/api/admin/resources/' + id }).done(loadResources);
    }
  });

  $('#resource-form').submit(function (e) {
    e.preventDefault();
    const id = $('#res-id').val();
    if (!resourceCoordinates) return showMessage('Input Required', 'Pin the exact resource location on the map first.');
    const obj = {
      name: $('#res-name').val(),
      type: $('#res-type').val(),
      phones: $('#res-phones').val().split(',').map(x=>x.trim()).filter(Boolean),
      address: $('#res-address').val(),
      location: { type: "Point", coordinates: [resourceCoordinates.lng, resourceCoordinates.lat] }
    };
    if (id) {
      $.ajax({
        type: 'PUT',
        url: '/api/admin/resources/' + id,
        data: JSON.stringify(obj),
        contentType: 'application/json'
      }).done(() => {
        $('#resourceModal').modal('hide');
        loadResources();
      });
    } else {
      $.ajax({
        type: 'POST',
        url: '/api/admin/resources',
        data: JSON.stringify(obj),
        contentType: 'application/json'
      }).done(() => {
        $('#resourceModal').modal('hide');
        loadResources();
      });
    }
  });

  function loadAdmins() {
    $.get('/api/admin/admins', function (data) {
      const list = data.admins || [];
      $('#admins-body').empty();
      list.forEach(function (a) {
        $('#admins-body').append(
          `<tr>
            <td>${a.username}</td>
            <td>${a.name}</td>
            <td>${a.phone || ""}</td>
            <td>${a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}</td>
          </tr>`
        );
      });
    });
  }

  $('#government-form').submit(function (event) {
    event.preventDefault();
    const payload = {};
    $(this).serializeArray().forEach(field => { payload[field.name] = field.value; });
    $.ajax({ type: 'POST', url: '/api/admin/government', data: JSON.stringify(payload), contentType: 'application/json' })
      .done(() => $('#government-result').removeClass('text-danger').addClass('text-success').text('Official account created.'))
      .fail(xhr => $('#government-result').removeClass('text-success').addClass('text-danger').text(xhr.responseJSON?.error || 'Could not create account.'));
  });

  function loadWorkflows() {
    $.get('/api/government/volunteers', data => {
      $('#volunteers-list').empty();
      (data.applications || []).forEach(item => $('#volunteers-list').append(`<div class="border p-2 mb-2"><b>${item.name}</b> <span class="badge bg-secondary">${item.status}</span><br>${item.skills || ''}${item.status === 'pending' ? ` <button class="btn btn-sm btn-success review-volunteer" data-id="${item._id}" data-status="approved">Approve</button> <button class="btn btn-sm btn-outline-danger review-volunteer" data-id="${item._id}" data-status="rejected">Reject</button>` : ''}</div>`));
    });
    $.get('/api/government/reports', data => {
      $('#reports-list').empty();
      (data.reports || []).forEach(item => $('#reports-list').append(`<div class="border p-2 mb-2"><b>${item.title}</b> <span class="badge bg-secondary">${item.status}</span><br>${item.description}${item.status === 'pending' ? ` <button class="btn btn-sm btn-success review-report" data-id="${item._id}" data-status="verified">Verify</button> <button class="btn btn-sm btn-outline-danger review-report" data-id="${item._id}" data-status="rejected">Reject</button>` : ''}</div>`));
    });
    $.get('/api/government/requests', data => {
      $('#requests-list').empty();
      (data.requests || []).forEach(item => $('#requests-list').append(`<div class="border p-2 mb-2"><b>${item.type}</b> <span class="badge bg-secondary">${item.status}</span><br>${item.details}${item.status === 'pending' ? ` <button class="btn btn-sm btn-success review-request" data-id="${item._id}" data-status="approved">Approve</button> <button class="btn btn-sm btn-outline-danger review-request" data-id="${item._id}" data-status="rejected">Reject</button>` : ''}</div>`));
    });
  }

  function loadVolunteerRequests() {
    $('#workflow-section').removeClass('d-none');
    $('#role-banner').after('<h4 id="volunteer-queue-title">My Assigned Requests</h4><div id="volunteer-requests-list"></div>');
    $.get('/api/volunteer/requests', data => {
      $('#volunteer-requests-list').empty();
      (data.requests || []).forEach(item => $('#volunteer-requests-list').append(`<div class="border p-2 mb-2"><b>${item.type}</b> <span class="badge bg-secondary">${item.status}</span><br>${item.details}${item.status === 'assigned' ? ` <button class="btn btn-sm btn-success fulfill-request" data-id="${item._id}">Mark fulfilled</button>` : ''}</div>`));
    });
  }

  $('#workflow-section').on('click', '.review-volunteer', function () { review(`/api/government/volunteers/${$(this).data('id')}`, $(this).data('status')); });
  $('#workflow-section').on('click', '.review-report', function () { review(`/api/government/reports/${$(this).data('id')}`, $(this).data('status')); });
  $('#workflow-section').on('click', '.review-request', function () { review(`/api/government/requests/${$(this).data('id')}`, $(this).data('status')); });
  $('#admin-dashboard').on('click', '.fulfill-request', function () { $.ajax({ type: 'PUT', url: `/api/volunteer/requests/${$(this).data('id')}/fulfill` }).done(loadVolunteerRequests); });
  function review(url, status) { $.ajax({ type: 'PUT', url, data: JSON.stringify({ status }), contentType: 'application/json' }).done(loadWorkflows); }
});
