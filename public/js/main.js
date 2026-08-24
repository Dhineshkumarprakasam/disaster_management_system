// =====================================================================
// National Disaster Management System (NDMS) - Automated UI Controller
// =====================================================================

let currentUser = null;
const mapPickers = {};
const defaultMapCenter = [26.1445, 91.7362];

// Message Alert Dialog Helper
function showMessage(title, message) {
  // Set content
  const titleEl = document.getElementById('messageAlertTitle');
  const bodyEl = document.getElementById('messageAlertBody');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.textContent = message;
  
  // Show modal (using custom modal system)
  const modal = document.getElementById('messageAlertModal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeMessageAlert() {
  const modal = document.getElementById('messageAlertModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

function getCurrentCoordinates() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function setMapPoint(key, lat, lng) {
  const picker = mapPickers[key];
  if (!picker) return;
  picker.coordinates = { lat, lng };
  if (!picker.marker) {
    picker.marker = L.marker([lat, lng], { draggable: true }).addTo(picker.map);
    picker.marker.on('dragend', () => {
      const point = picker.marker.getLatLng();
      setMapPoint(key, point.lat, point.lng);
    });
  } else {
    picker.marker.setLatLng([lat, lng]);
  }
  picker.map.setView([lat, lng], Math.max(picker.map.getZoom(), 14));
  $('#' + key + '-map-status').text(`Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)}. Finding address...`);
  reverseGeocode(key, lat, lng);
}

async function reverseGeocode(key, lat, lng) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Reverse geocoding failed');
    const data = await response.json();
    const address = data.address || {};
    const district = address.state_district || address.district || address.county || '';
    const state = address.state || '';
    const displayName = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const prefix = key === 'rep' ? 'rep' : key === 'sos' ? 'sos' : 'vapp';
    if (district) $('#' + prefix + '-district').val(district);
    if ($('#' + prefix + '-state').length && state) $('#' + prefix + '-state').val(state);
    if (key === 'rep') $('#rep-area').val(displayName);
    if (key === 'sos') $('#sos-loc').val(displayName);
    $('#' + key + '-map-status').text(`${displayName} (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
  } catch (error) {
    $('#' + key + '-map-status').text(`Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)}. Address lookup unavailable; move the pin to retry.`);
  }
}

function initMapPicker(key) {
  if (mapPickers[key]) {
    mapPickers[key].map.invalidateSize();
    return;
  }
  const map = L.map(key + '-map', { preferCanvas: true }).setView(defaultMapCenter, 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  mapPickers[key] = { map, marker: null, coordinates: null };
  map.on('click', event => setMapPoint(key, event.latlng.lat, event.latlng.lng));
  setTimeout(() => map.invalidateSize(), 0);
}

async function locateMap(key) {
  initMapPicker(key);
  const coordinates = await getCurrentCoordinates();
  if (!coordinates) {
    $('#' + key + '-map-status').text('Location permission was unavailable. Click the map to choose a point.');
    return;
  }
  setMapPoint(key, coordinates.lat, coordinates.lng);
}

function getMapCoordinates(key) {
  return mapPickers[key]?.coordinates || null;
}

async function searchMapByPincode(key) {
  const pincode = $('#' + key + '-pincode').val().trim();
  const results = $('#' + key + '-map-results');
  if (!/^\d{6}$/.test(pincode)) {
    results.text('Enter a valid 6-digit Indian pincode.');
    return;
  }
  initMapPicker(key);
  results.text('Searching nearby places...');
  try {
    const query = `${pincode}, India`;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=in&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Pincode search failed');
    const places = await response.json();
    results.empty();
    if (!places.length) {
      results.text('No places found for this pincode. Try another pincode or click the map.');
      return;
    }
    places.forEach(place => {
      const button = $('<button type="button" class="map-search-result"></button>')
        .text(place.display_name)
        .on('click', () => setMapPoint(key, Number(place.lat), Number(place.lon)));
      results.append(button);
    });
  } catch (error) {
    results.text('Pincode search is temporarily unavailable. Click the map to choose a point.');
  }
}

$(document).ready(function () {
  initializeGeographyDropdowns();
  checkSession();
  loadPublicIncidents();
  loadPublicResources();
  initSseStream();
});

async function initializeGeographyDropdowns() {
  try {
    const response = await $.get('/api/geo/data');
    const stateSelect = $('#acc-state');
    const districtSelect = $('#acc-district');
    stateSelect.html('<option value="">Select state</option>');
    (response.states || []).forEach(state => stateSelect.append($('<option>').val(state).text(state)));
    stateSelect.val('Assam');
    await loadAccountDistricts('Assam');
    stateSelect.on('change', function () { loadAccountDistricts(this.value); });
    districtSelect.on('change', function () { $('#acc-state').prop('disabled', false); });
  } catch (error) {
    $('#acc-state').html('<option value="">Unable to load states</option>');
    $('#acc-district').html('<option value="">Unable to load districts</option>');
  }
}

async function loadAccountDistricts(state) {
  const districtSelect = $('#acc-district');
  districtSelect.html('<option value="">Loading districts...</option>').prop('disabled', true);
  if (!state) {
    districtSelect.html('<option value="">Select state first</option>').prop('disabled', false);
    return;
  }
  try {
    const response = await $.get('/api/geo/districts', { state });
    districtSelect.html('<option value="">Select district</option>');
    (response.districts || []).forEach(district => districtSelect.append($('<option>').val(district).text(district)));
  } catch (error) {
    districtSelect.html('<option value="">Unable to load districts</option>');
  } finally {
    districtSelect.prop('disabled', false);
  }
}

// --- Session & View Management ---

async function checkSession() {
  try {
    const res = await $.ajax({ url: '/api/auth/me', method: 'GET' });
    if (res && res.user) {
      currentUser = res.user;
      renderAuthenticatedView(currentUser);
    } else {
      currentUser = null;
      renderGuestView();
    }
  } catch (err) {
    currentUser = null;
    renderGuestView();
  }
}

function renderGuestView() {
  $('.view-section').hide();
  $('#portal-guest').show();

  $('#auth-nav-container').html(`
    <button class="btn btn-primary" onclick="openLoginModal()">Official / Staff Sign In</button>
  `);

  loadPublicIncidents();
  loadPublicResources();
}

function renderAuthenticatedView(user) {
  $('.view-section').hide();

  $('#auth-nav-container').html(`
    <div style="display:flex; align-items:center; gap:10px;">
      <span style="font-size:0.85rem; font-weight:600; color:var(--goi-navy);">${user.name} (${(user.role || 'USER').toUpperCase()})</span>
      <button class="btn btn-outline btn-sm" onclick="handleLogout()">Sign Out</button>
    </div>
  `);

  if (user.role === 'admin') {
    $('#portal-admin').show();
    $('#admin-welcome-text').text(`Super Admin Workspace - ${user.name}`);
    // Show/hide district row based on role selection
    $('#acc-role').off('change').on('change', function () {
      if ($(this).val() === 'admin') {
        $('#acc-district-row').hide();
      } else {
        $('#acc-district-row').show();
      }
    });
    loadOfficialOfficers();
  } else if (user.role === 'government') {
    $('#portal-government').show();
    $('#govt-welcome-text').text(`Government Official Command Center - ${user.name}`);

    // District scope enforcement — show officer's district clearly
    const officerDistrict = user.district || 'All Districts';
    $('#govt-district-badge').html(
      `Scoped to district: <strong style="background:rgba(255,255,255,0.25); padding:2px 8px; border-radius:4px;">${officerDistrict}</strong> &nbsp;|&nbsp; You can only view &amp; act on data within your assigned district.`
    );
    $('#govt-district-scope-badge').text(officerDistrict);

    loadGovtPendingIncidents();
    loadGovtVolunteerApps();
    populateGovtDropdowns();
  } else if (user.role === 'volunteer') {
    $('#portal-volunteer').show();
    $('#vol-welcome-text').text(`Volunteer Operations Portal - ${user.name}`);
    loadVolunteerTasks();
  } else {
    renderGuestView();
  }
}

async function handleLogout() {
  try {
    await $.ajax({ url: '/api/auth/logout', method: 'POST' });
  } catch (e) {}
  currentUser = null;
  showMessage('Success', 'Signed out successfully.');
  renderGuestView();
}


// --- 1. PUBLIC GUEST PORTAL DATA LOADERS (With Auto-Assigned Volunteer Call Details) ---

async function loadPublicIncidents() {
  try {
    const res = await $.ajax({ url: '/api/incidents/published', method: 'GET' });
    const incidents = res.incidents || [];
    const container = $('#public-incidents-container');

    if (incidents.length === 0) {
      container.html('<div style="text-align:center; padding:15px; color:var(--text-muted);">No active published disaster alerts.</div>');
      return;
    }

    let html = '';
    incidents.forEach(inc => {
      const sevBadge = inc.severity === 'critical' ? 'badge-critical' : 'badge-warning';
      const depts = (inc.dispatchedDepts || []).map(d => `<span class="badge badge-info" style="margin-right:4px;">⚡ ${d}</span>`).join('');

      html += `
        <div style="padding:14px; border-bottom:1px solid var(--goi-border); margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <strong style="color:var(--goi-navy); font-size:0.98rem;">${inc.title}</strong>
            <span class="badge ${sevBadge}">${(inc.severity || 'WARNING').toUpperCase()}</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-main); margin-top:4px;">${inc.description}</p>
          <div style="margin-top:6px;">${depts}</div>
          <div style="font-size:0.78rem; color:var(--text-muted); margin-top:6px;">Area: ${inc.area || ''}, ${inc.district || ''}</div>
        </div>
      `;
    });

    container.html(html);
  } catch (err) {
    console.error('Failed to load published incidents:', err);
  }
}

async function loadPublicResources() {
  try {
    const res = await $.ajax({ url: '/api/admin/resources', method: 'GET' });
    const resources = res.resources || [];
    const container = $('#public-resources-container');

    if (resources.length === 0) {
      container.html('<div style="text-align:center; padding:15px; color:var(--text-muted);">No nearby resources found.</div>');
      return;
    }

    let html = '';
    resources.forEach(r => {
      const icon = '';
      const phones = Array.isArray(r.phones) ? r.phones.join(', ') : r.phones;

      html += `
        <div style="padding:10px; border-bottom:1px solid var(--goi-border);">
          <strong style="color:var(--goi-navy); font-size:0.9rem;">${icon} ${r.name}</strong>
          <div style="font-size:0.8rem; color:var(--text-muted);">${r.address || ''} • ${phones}</div>
        </div>
      `;
    });

    container.html(html);
  } catch (err) {
    console.error('Failed to load resources:', err);
  }
}


// --- 2. MODAL DIALOGS ---

function openReportModal() { $('#modal-report').addClass('active'); initMapPicker('rep'); }
function closeReportModal() { $('#modal-report').removeClass('active'); }

function openSosModal() { $('#modal-sos').addClass('active'); initMapPicker('sos'); }
function closeSosModal() { $('#modal-sos').removeClass('active'); }

function openVolunteerApplyModal() { $('#modal-vol-apply').addClass('active'); initMapPicker('vol'); }
function closeVolunteerApplyModal() { $('#modal-vol-apply').removeClass('active'); }

function openLoginModal() { $('#modal-login').addClass('active'); }
function closeLoginModal() { $('#modal-login').removeClass('active'); }

function openAddOfficerModal() { $('#modal-add-officer').addClass('active'); }
function closeAddOfficerModal() { $('#modal-add-officer').removeClass('active'); }

async function openVolunteersDirectoryModal() {
  $('#modal-volunteers-dir').addClass('active');
  try {
    const res = await $.ajax({ url: '/api/volunteers/nearby', method: 'GET' });
    const volunteers = res.volunteers || [];
    const container = $('#volunteers-directory-list');

    if (volunteers.length === 0) {
      container.html('<div style="text-align:center; padding:20px; color:var(--text-muted);">No verified active volunteers listed.</div>');
      return;
    }

    let html = '';
    volunteers.forEach(v => {
      const skills = (v.skills || []).join(', ');
      html += `
        <div style="padding:12px; border-bottom:1px solid var(--goi-border);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:var(--goi-navy);">${v.name}</strong>
            <span class="badge badge-success">VERIFIED</span>
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">District: ${v.district || ''} | Blood: ${v.bloodGroup || 'O+'}</div>
          <div style="font-size:0.8rem; color:var(--goi-navy); margin-top:2px;">⚡ Skills: ${skills}</div>
          <div style="margin-top:6px;"><a href="tel:${v.phone}" class="btn btn-success btn-sm">Direct Call ${v.phone}</a></div>
        </div>
      `;
    });

    container.html(html);
  } catch (err) {
    console.error('Failed to load volunteers directory:', err);
  }
}

function closeVolunteersDirectoryModal() { $('#modal-volunteers-dir').removeClass('active'); }


// --- 3. CITIZEN FORM SUBMISSIONS (Auto-Dispatched) ---

async function submitReportForm(e) {
  e.preventDefault();
  const coordinates = getMapCoordinates('rep');
  if (!coordinates) return showMessage('Input Required', 'Select the exact incident location on the map first.');
  const payload = {
    title: $('#rep-title').val(),
    category: $('#rep-cat').val(),
    severity: $('#rep-sev').val(),
    district: $('#rep-district').val(),
    state: $('#rep-state').val(),
    area: $('#rep-area').val(),
    contact: $('#rep-phone').val(),
    description: $('#rep-desc').val(),
    ...(coordinates || {})
  };

  try {
    const res = await $.ajax({
      url: '/api/reports',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
    if (res.ok) {
      showMessage('Success', res.message);
      closeReportModal();
      $('#report-form')[0].reset();
      loadPublicIncidents();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Failed to submit report.');
  }
}

async function submitSosForm(e) {
  e.preventDefault();
  const coordinates = getMapCoordinates('sos');
  if (!coordinates) return showMessage('Input Required', 'Select the exact SOS location on the map first.');
  const payload = {
    type: $('#sos-type').val(),
    requesterName: $('#sos-name').val(),
    contact: $('#sos-phone').val(),
    location: $('#sos-loc').val(),
    district: $('#sos-district').val(),
    state: $('#sos-state').val(),
    details: $('#sos-details').val(),
    ...(coordinates || {})
  };

  try {
    const res = await $.ajax({
      url: '/api/requests',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
    if (res.ok) {
      showMessage('Success', res.message);
      closeSosModal();
      $('#sos-form')[0].reset();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Failed to submit SOS request.');
  }
}

async function submitVolApplyForm(e) {
  e.preventDefault();
  const coordinates = getMapCoordinates('vol');
  if (!coordinates) return showMessage('Input Required', 'Select your exact operating location on the map first.');
  const payload = {
    name: $('#vapp-name').val(),
    phone: $('#vapp-phone').val(),
    username: $('#vapp-user').val(),
    password: $('#vapp-pass').val(),
    district: $('#vapp-district').val(),
    state: $('#vapp-state').val(),
    idProofNumber: $('#vapp-idnum').val(),
    skills: $('#vapp-skills').val(),
    ...(coordinates || {})
  };

  try {
    const res = await $.ajax({
      url: '/api/auth/volunteer/apply',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
    if (res.ok) {
      showMessage('Success', res.message);
      closeVolunteerApplyModal();
      $('#vol-apply-form')[0].reset();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Volunteer registration failed.');
  }
}

async function submitLoginForm(e) {
  e.preventDefault();
  const role = $('#log-role').val();
  const username = $('#log-username').val();
  const password = $('#log-password').val();

  try {
    const res = await $.ajax({
      url: '/api/auth/login',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ username, password, role })
    });
    if (res.ok) {
      showMessage('Success', `Welcome back, ${res.user.name}!`);
      closeLoginModal();
      checkSession();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Sign in failed. Invalid credentials.');
  }
}


// --- 4. SUPER ADMIN WORKSPACE ACTIONS ---

async function loadOfficialOfficers() {
  try {
    const res = await $.ajax({ url: '/api/admin/officers', method: 'GET' });
    const officers = res.officers || [];
    const tbody = $('#admin-officers-tbody');

    if (officers.length === 0) {
      tbody.html('<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No official officers registered.</td></tr>');
      return;
    }

    let html = '';
    officers.forEach(o => {
      html += `
        <tr>
          <td><strong>${o.name}</strong></td>
          <td><span class="badge badge-info">${o.department}</span></td>
          <td>${o.designation || 'Officer'}</td>
          <td>${o.phone}</td>
          <td><button class="btn btn-danger btn-sm" onclick="removeOfficer('${o._id}')">Remove</button></td>
        </tr>
      `;
    });

    tbody.html(html);
  } catch (err) {
    console.error('Failed to load official officers:', err);
  }
}

async function submitOfficerForm(e) {
  e.preventDefault();
  const payload = {
    name: $('#off-name').val(),
    department: $('#off-dept').val(),
    designation: $('#off-rank').val(),
    phone: $('#off-phone').val()
  };

  try {
    const res = await $.ajax({
      url: '/api/admin/officers',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
    if (res.ok) {
      showMessage('Success', res.message);
      closeAddOfficerModal();
      loadOfficialOfficers();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Failed to add officer.');
  }
}

async function removeOfficer(id) {
  if (!confirm('Remove this official officer?')) return;
  try {
    const res = await $.ajax({ url: `/api/admin/officers/${id}`, method: 'DELETE' });
    if (res.ok) {
      showMessage('Success', res.message);
      loadOfficialOfficers();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Failed to remove officer.');
  }
}

async function handleCreateAccount(e) {
  e.preventDefault();
  const roleType = $('#acc-role').val();
  const endpoint = roleType === 'admin' ? '/api/admin/create-admin' : '/api/admin/create-government';
  const payload = {
    name: $('#acc-name').val(),
    username: $('#acc-username').val(),
    password: $('#acc-password').val(),
    department: $('#acc-dept').val(),
    district: roleType === 'admin' ? undefined : $('#acc-district').val(),
    state: roleType === 'admin' ? undefined : $('#acc-state').val()
  };

  try {
    const res = await $.ajax({
      url: endpoint,
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
    if (res.ok) {
      showMessage('Success', res.message);
      $('#create-account-form')[0].reset();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Account creation failed.');
  }
}


// --- 5. GOVERNMENT OFFICIAL ACTIONS ---

async function loadGovtPendingIncidents() {
  try {
    const res = await $.ajax({ url: '/api/government/reports', method: 'GET' });
    const reports = res.reports || [];
    const pending = reports.filter(r => r.status === 'pending');
    const container = $('#govt-pending-incidents');

    if (pending.length === 0) {
      container.html('<div style="text-align:center; padding:15px; color:var(--text-muted);">No pending incidents awaiting validation.</div>');
      return;
    }

    let html = '';
    pending.forEach(r => {
      html += `
        <div style="padding:10px; border-bottom:1px solid var(--goi-border);">
          <strong style="color:var(--goi-navy);">${r.title}</strong>
          <p style="font-size:0.82rem; color:var(--text-main); margin-top:2px;">${r.description}</p>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button class="btn btn-success btn-sm" onclick="reviewIncident('${r._id}', 'verified')">✓ Validate & Auto-Dispatch</button>
            <button class="btn btn-danger btn-sm" onclick="reviewIncident('${r._id}', 'rejected')">✕ Reject</button>
          </div>
        </div>
      `;
    });

    container.html(html);
  } catch (err) {
    console.error('Failed to load pending incidents:', err);
  }
}

async function reviewIncident(id, status) {
  try {
    const res = await $.ajax({
      url: `/api/government/reports/${id}`,
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ status })
    });
    if (res.ok) {
      showMessage('Success', res.message);
      loadGovtPendingIncidents();
      populateGovtDropdowns();
      loadPublicIncidents();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Failed to review report.');
  }
}

async function loadGovtVolunteerApps() {
  try {
    const res = await $.ajax({ url: '/api/government/volunteers', method: 'GET' });
    const apps = res.applications || [];
    const pending = apps.filter(a => a.status === 'pending');
    const container = $('#govt-volunteer-apps');

    if (pending.length === 0) {
      container.html('<div style="text-align:center; padding:15px; color:var(--text-muted);">No pending volunteer applications.</div>');
      return;
    }

    let html = '';
    pending.forEach(a => {
      html += `
        <div style="padding:10px; border-bottom:1px solid var(--goi-border);">
          <strong style="color:var(--goi-navy);">${a.name}</strong> (${a.phone})
          <div style="font-size:0.8rem; color:var(--text-muted);">District: ${a.district || ''} | ID: ${a.idProofNumber || ''}</div>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button class="btn btn-success btn-sm" onclick="reviewVolApp('${a._id}', 'approved')">✓ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="reviewVolApp('${a._id}', 'rejected')">✕ Reject</button>
          </div>
        </div>
      `;
    });

    container.html(html);
  } catch (err) {
    console.error('Failed to load volunteer apps:', err);
  }
}

async function reviewVolApp(id, status) {
  try {
    const res = await $.ajax({
      url: `/api/government/volunteers/${id}`,
      method: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({ status })
    });
    if (res.ok) {
      showMessage('Success', res.message);
      loadGovtVolunteerApps();
      populateGovtDropdowns();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Failed to review application.');
  }
}

async function handleDispatchSubmit(e) {
  e.preventDefault();
  const payload = {
    incidentId: $('#dispatch-inc-select').val(),
    department: $('#dispatch-dept-select').val()
  };

  try {
    const res = await $.ajax({
      url: '/api/government/dispatch',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
    if (res.ok) {
      showMessage('Success', res.message);
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Dispatch failed.');
  }
}

async function populateGovtDropdowns() {
  try {
    const incRes = await $.ajax({ url: '/api/government/reports', method: 'GET' });
    const sosRes = await $.ajax({ url: '/api/government/requests', method: 'GET' });
    const volRes = await $.ajax({
      url: `/api/volunteers/nearby?district=${encodeURIComponent(currentUser?.district || '')}`,
      method: 'GET'
    });

    const incidents = (incRes.reports || []).filter(i => i.status === 'verified' && i.published === true);
    const sos = sosRes.requests || [];
    const volunteers = volRes.volunteers || [];

    let dispatchOpts = '<option value="">Select Target Published Incident</option>';
    incidents.forEach(i => { dispatchOpts += `<option value="${i._id}">${i.title} (${i.district || ''})</option>`; });
    $('#dispatch-inc-select').html(dispatchOpts);

    let targetOpts = '<option value="">Select Target Incident / SOS Request</option>';
    incidents.forEach(i => { targetOpts += `<option value="inc_${i._id}">INCIDENT: ${i.title}</option>`; });
    sos.forEach(s => { targetOpts += `<option value="sos_${s._id}">🆘 SOS: ${s.type.toUpperCase()} (${s.contact})</option>`; });
    $('#assign-target').html(targetOpts);

    let volOpts = '<option value="">Select Volunteer (Override Auto-Match)</option>';
    volunteers.forEach(v => { volOpts += `<option value="${v._id}">${v.name} (${v.district || ''})</option>`; });
    $('#assign-vol').html(volOpts);
  } catch (err) {
    console.error('Failed to populate dropdowns:', err);
  }
}

async function handleAssignSubmit(e) {
  e.preventDefault();
  const val = $('#assign-target').val();
  const volunteerId = $('#assign-vol').val();

  if (!val || !volunteerId) return showMessage('Input Required', 'Select both target and volunteer.');
  const targetType = val.startsWith('sos_') ? 'sos' : 'incident';
  const targetId = val.replace('sos_', '').replace('inc_', '');

  try {
    const res = await $.ajax({
      url: '/api/government/assign-volunteer',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ targetType, targetId, volunteerId })
    });
    if (res.ok) showMessage('Success', res.message);
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Assignment failed.');
  }
}


// --- 6. VOLUNTEER WORKSPACE ACTIONS ---

async function loadVolunteerTasks() {
  try {
    const res = await $.ajax({ url: '/api/volunteer/tasks', method: 'GET' });
    const incidents = res.incidents || [];
    const sos = res.sosRequests || [];
    const container = $('#volunteer-tasks-container');

    if (incidents.length === 0 && sos.length === 0) {
      container.html('<div style="text-align:center; padding:20px; color:var(--text-muted);">No active emergency tasks assigned to your account.</div>');
      return;
    }

    let html = '';
    incidents.forEach(i => {
      html += `
        <div style="padding:12px; border-bottom:1px solid var(--goi-border);">
          <strong style="color:var(--goi-navy);">AUTO-ASSIGNED INCIDENT: ${i.title}</strong>
          <p style="font-size:0.85rem; color:var(--text-main); margin-top:2px;">${i.description}</p>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button class="btn btn-outline btn-sm" onclick="updateTask('${i._id}', 'En Route', 'incident')">En Route</button>
            <button class="btn btn-success btn-sm" onclick="updateTask('${i._id}', 'Fulfilled', 'incident')">✓ Completed</button>
          </div>
        </div>
      `;
    });

    sos.forEach(s => {
      html += `
        <div style="padding:12px; border-bottom:1px solid var(--goi-border);">
          <strong style="color:var(--goi-navy);">AUTO-ASSIGNED SOS: ${s.type.toUpperCase()}</strong> (${s.contact})
          <p style="font-size:0.85rem; color:var(--text-main); margin-top:2px;">${s.details}</p>
          <div style="margin-top:8px; display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="updateTask('${s._id}', 'en route', 'sos')">En Route</button>
            <button class="btn btn-success btn-sm" onclick="updateTask('${s._id}', 'fulfilled', 'sos')">✓ Mark Fulfilled</button>
          </div>
        </div>
      `;
    });

    container.html(html);
  } catch (err) {
    console.error('Failed to load volunteer tasks:', err);
  }
}

async function updateTask(id, status, type) {
  try {
    const res = await $.ajax({
      url: `/api/volunteer/tasks/${id}/status`,
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ status, type })
    });
    if (res.ok) {
      showMessage('Success', res.message);
      loadVolunteerTasks();
    }
  } catch (err) {
    showMessage('Error', err.responseJSON?.error || 'Task status update failed.');
  }
}


// --- 7. REAL-TIME SSE STREAM ---

function initSseStream() {
  if (!window.EventSource) return;
  try {
    const source = new EventSource('/events');
    source.onmessage = function (e) {
      const data = JSON.parse(e.data);
      if (data && data.title) {
        $('#alert-ticker').text(`${data.title}: ${data.body}`);
        loadPublicIncidents();
      }
    };
  } catch (e) {}
}
