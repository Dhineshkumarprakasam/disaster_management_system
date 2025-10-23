let isLoggedIn = false;
let adminInfo = null;
$(function () {
  checkSession();

  function checkSession() {
    $.get('/api/admin/me')
      .done(function (data) {
        isLoggedIn = true;
        $('#login-section').addClass('d-none');
        $('#admin-dashboard').removeClass('d-none');
        $('#admin-logout').removeClass('d-none');
        loadAll();
      })
      .fail(function () {
        $('#login-section').removeClass('d-none');
        $('#admin-dashboard').addClass('d-none');
      });
  }

  // Login form
  $('#login-form').submit(function (e) {
    e.preventDefault();
    const username = $('#username').val();
    const password = $('#password').val();
    $.ajax({
      type: 'POST',
      url: '/api/admin/login',
      data: JSON.stringify({ username, password }),
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
    $.get('/api/messages', function (data) {
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
    $.get('/api/messages', function (data) {
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
    $('#resourceModalLabel').text('Add Resource');
    $('#resourceModal').modal('show');
  });

  $('#resources-table').on('click', '.btn-edit-resource', function () {
    const id = $(this).data('id');
    $.get('/api/resources/nearby?lat=12.9716&lng=77.5946&radius=100000', function (data) {
      const r = (data.resources || []).find(x => x._id === id);
      if (!r) return;
      $('#res-id').val(r._id);
      $('#res-name').val(r.name);
      $('#res-type').val(r.type);
      $('#res-phones').val((r.phones || []).join(','));
      $('#res-address').val(r.address);
      if (r.location && r.location.coordinates) {
        $('#res-location').val(`${r.location.coordinates[0]},${r.location.coordinates[1]}`);
      }
      $('#resourceModalLabel').text('Edit Resource');
      $('#resourceModal').modal('show');
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
    let lnglat = $('#res-location').val().split(',').map(x=>parseFloat(x.trim()));
    if (lnglat.length !== 2 || lnglat.some(isNaN)) {
      alert('Location must be "lng,lat" format.');
      return;
    }
    const obj = {
      name: $('#res-name').val(),
      type: $('#res-type').val(),
      phones: $('#res-phones').val().split(',').map(x=>x.trim()).filter(Boolean),
      address: $('#res-address').val(),
      location: { type: "Point", coordinates: [lnglat[0], lnglat[1]] }
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
});
