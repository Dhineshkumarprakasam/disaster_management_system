// =====================================================================
// National Disaster Management System (NDMS) - Automated UI Controller
// =====================================================================

let currentUser = null;
const mapPickers = {};
const defaultMapCenter = [26.1445, 91.7362];
let adminDashboardPollTimer = null;
let adminDashboardLoading = false;
let resourceItems = [];

console.log('[main.js] Script loaded successfully - showMessage modal system is ready');

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
    
    // Show modal
    const modal = document.getElementById('messageAlertModal');
    if (modal) {
      console.log('[showMessage] Modal element found');
      
      // Ensure display is not none
      modal.style.removeProperty('display');
      
      // Add active class
      modal.classList.add('active');
      
      // Force display with inline styles
      modal.style.display = 'flex';
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.zIndex = '10000';
      
      console.log('[showMessage] Modal displayed successfully');
    } else {
      console.error('[showMessage] messageAlertModal element not found in DOM');
    }
  } catch (e) {
    console.error('[showMessage] Error:', e);
  }
}

function closeMessageAlert() {
  try {
    const modal = document.getElementById('messageAlertModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
      console.log('[closeMessageAlert] Modal closed');
    }
  } catch (e) {
    console.error('[closeMessageAlert] Error:', e);
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
  if (key === 'resource') {
    $('#resource-map-status').text(`Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  } else {
    reverseGeocode(key, lat, lng);
  }
  if (key === 'dir') loadDirectoryVolunteers({ lat, lng });
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
  refreshServingInstance();
  window.setInterval(refreshServingInstance, 10000);
  loadPublicIncidents();
  loadPublicResources();
  initSseStream();

  $('#resource-form-reset, #resource-cancel').on('click', resetAdminResourceForm);
  $('#resource-form').on('submit', async function (event) {
    event.preventDefault();
    const coordinates = mapPickers.resource?.coordinates;
    if (!coordinates) {
      showMessage('Location required', 'Click the map to pin the resource location.');
      return;
    }
    const id = $('#resource-id').val();
    const payload = {
      name: $('#resource-name').val().trim(),
      type: $('#resource-type').val(),
      district: $('#resource-district').val().trim(),
      state: $('#resource-state').val().trim(),
      address: $('#resource-address').val().trim(),
      phones: $('#resource-phones').val().split(',').map(phone => phone.trim()).filter(Boolean),
      location: { type: 'Point', coordinates: [coordinates.lng, coordinates.lat] }
    };
    try {
      await $.ajax({
        url: id ? `/api/admin/resources/${encodeURIComponent(id)}` : '/api/admin/resources',
        method: id ? 'PUT' : 'POST',
        contentType: 'application/json',
        data: JSON.stringify(payload)
      });
      resetAdminResourceForm();
      loadAdminResources();
      showMessage('Saved', id ? 'Emergency resource updated.' : 'Emergency resource added.');
    } catch (error) {
      showMessage('Error', error.responseJSON?.error || 'Unable to save resource.');
    }
  });
});

async function refreshServingInstance() {
  const indicator = document.getElementById('instance-indicator');
  if (!indicator) return;

  try {
    const response = await fetch('/api/instance', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Instance endpoint returned ${response.status}`);
    const data = await response.json();
    if (typeof data.instanceId !== 'string' || !data.instanceId) {
      throw new Error('Instance endpoint returned no instance ID');
    }
    indicator.textContent = `Serving instance: ${data.instanceId.slice(0, 12)}`;
    indicator.title = `Gateway container: ${data.instanceId}`;
  } catch (error) {
    console.error('Could not determine the serving gateway instance:', error);
    indicator.textContent = 'Serving instance: unavailable';
    indicator.removeAttribute('title');
  }
}

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
  stopAdminDashboardUpdates();
  $('.view-section').hide();
  $('#portal-guest').show();

  $('#auth-nav-container').html(`
    <button class="btn btn-primary" onclick="openLoginModal()">Admin / Volunteer Sign In</button>
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
    startAdminDashboardUpdates();
    loadAdminResources();
    initMapPicker('resource');
    // Show/hide district row based on role selection
    $('#acc-role').off('change').on('change', function () {
      if ($(this).val() === 'admin') {
        $('#acc-district-row').hide();
      } else {
        $('#acc-district-row').show();
      }
    });
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

function stopAdminDashboardUpdates() {
  if (adminDashboardPollTimer) {
    clearInterval(adminDashboardPollTimer);
    adminDashboardPollTimer = null;
  }
  adminDashboardLoading = false;
}

function startAdminDashboardUpdates() {
  if (adminDashboardPollTimer) return;
  loadAdminDisasterDashboard();
  adminDashboardPollTimer = setInterval(function () {
    if (!document.hidden) loadAdminDisasterDashboard();
  }, 5000);
}

function formatAdminDashboardTime(value) {
  const timestamp = String(value || '').replace(' ', 'T');
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(timestamp) ? timestamp : `${timestamp}Z`);
  return Number.isNaN(date.getTime()) ? String(value || '—') : date.toLocaleString();
}

function renderAdminDashboardBreakdown(selector, rows, label) {
  const container = $(selector).empty();
  if (!rows.length) {
    container.text('No disaster data yet.');
    return;
  }

  const maximum = Math.max(...rows.map(item => Number(item.count) || 0), 1);
  rows.forEach(function (item) {
    const line = $('<div style="margin-bottom:8px;">');
    const labels = $('<div style="display:flex; justify-content:space-between;">')
      .append($('<span>').text(label(item)))
      .append($('<span>').text(item.count));
    const track = $('<div style="height:6px; background:#e5e7eb; border-radius:4px; overflow:hidden;">');
    track.append($('<div style="height:100%; background:#1f5c92;">')
      .css('width', `${Math.max(2, (Number(item.count) || 0) / maximum * 100)}%`));
    line.append(labels, track);
    container.append(line);
  });
}

function renderAdminDisasterDashboard(data) {
  const metrics = data.metrics || {};
  $('#admin-dashboard-total').text(metrics.total ?? 0);
  $('#admin-dashboard-incidents').text(metrics.incidents ?? 0);
  $('#admin-dashboard-sos').text(metrics.sos_requests ?? 0);
  $('#admin-dashboard-verified').text(metrics.verified ?? 0);
  $('#admin-dashboard-pending').text(metrics.pending ?? 0);
  $('#admin-dashboard-rejected').text(metrics.rejected ?? 0);
  $('#admin-dashboard-published').text(metrics.published ?? 0);

  renderAdminDashboardBreakdown('#admin-dashboard-severity', data.severity || [],
    item => item.severity || 'Unknown');
  renderAdminDashboardBreakdown('#admin-dashboard-districts', data.districts || [],
    item => [item.district, item.state].filter(Boolean).join(', ') || 'Unknown location');

  const daily = data.daily || [];
  const maximumDaily = Math.max(...daily.map(item => Number(item.count) || 0), 1);
  const dailyContainer = $('#admin-dashboard-daily').empty();
  daily.forEach(function (item) {
    const count = Number(item.count) || 0;
    const column = $('<div style="display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; flex:1;">');
    column.append($('<span style="font-size:0.75rem;">').text(count));
    column.append($('<div style="width:100%; min-height:2px; background:#1f5c92; border-radius:4px 4px 0 0; margin-top:4px;">')
      .css('height', `${Math.max(2, count / maximumDaily * 76)}px`));
    column.append($('<span style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">')
      .text(String(item.date || '').slice(5)));
    dailyContainer.append(column);
  });
  if (!daily.length) dailyContainer.text('No disaster data for this period.');

  const recentContainer = $('#admin-dashboard-recent').empty();
  (data.recent || []).forEach(function (item) {
    const row = $('<tr>');
    [
      formatAdminDashboardTime(item.event_time),
      item.record_type === 'sos' ? 'SOS request' : 'Incident report',
      String(item.event_type || '').replace(/-/g, ' '),
      item.title,
      item.category,
      item.severity,
      [item.district, item.state].filter(Boolean).join(', '),
      item.volunteer_status || item.status
    ].forEach(value => row.append($('<td>').text(value || '—')));
    recentContainer.append(row);
  });
  if (!data.recent?.length) {
    recentContainer.append($('<tr>').append(
      $('<td colspan="8" style="text-align:center; padding:14px; color:var(--text-muted);">')
        .text('No disaster activity has been recorded yet.')
    ));
  }
  $('#admin-dashboard-status')
    .css('color', 'var(--text-muted)')
    .text(`Live · updated ${new Date().toLocaleTimeString()}`);
}

function loadAdminDisasterDashboard() {
  if (adminDashboardLoading) return;
  adminDashboardLoading = true;
  $.get('/api/admin/disaster-dashboard')
    .done(renderAdminDisasterDashboard)
    .fail(function (xhr) {
      $('#admin-dashboard-status')
        .css('color', '#b91c1c')
        .text(xhr.responseJSON?.error || 'Unable to load disaster analytics.');
    })
    .always(function () {
      adminDashboardLoading = false;
    });
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

function resourceCoordinates(resource) {
  const coordinates = resource?.location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [lng, lat] = coordinates.map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function renderAdminResources() {
  const list = $('#admin-resources-list').empty();
  if (!resourceItems.length) {
    list.append($('<tr>').append($('<td colspan="6" class="text-center text-muted">').text('No emergency resources have been added.')));
    return;
  }

  resourceItems.forEach(resource => {
    const row = $('<tr>');
    [resource.name, resource.type, [resource.district, resource.state].filter(Boolean).join(', '), resource.address,
      Array.isArray(resource.phones) ? resource.phones.join(', ') : resource.phones]
      .forEach(value => row.append($('<td>').text(value || '—')));
    const actions = $('<td>');
    actions.append($('<button type="button" class="btn btn-outline btn-sm me-1">').text('Edit')
      .on('click', () => editAdminResource(resource._id)));
    actions.append($('<button type="button" class="btn btn-danger btn-sm">').text('Remove')
      .on('click', () => removeAdminResource(resource._id)));
    row.append(actions);
    list.append(row);
  });
}

function loadAdminResources() {
  $('#admin-resources-status').text('Loading emergency resources...');
  $.get('/api/admin/resources')
    .done(data => {
      resourceItems = Array.isArray(data) ? data : data.resources || [];
      renderAdminResources();
      $('#admin-resources-status').text(`${resourceItems.length} resource${resourceItems.length === 1 ? '' : 's'}`);
    })
    .fail(xhr => $('#admin-resources-status').text(xhr.responseJSON?.error || 'Unable to load resources.'));
}

function resetAdminResourceForm() {
  $('#resource-form')[0].reset();
  $('#resource-id').val('');
  $('#resource-submit').text('Save Resource');
  $('#resource-cancel').prop('hidden', true);
  const picker = mapPickers.resource;
  if (picker?.marker) picker.map.removeLayer(picker.marker);
  if (picker) {
    picker.marker = null;
    picker.coordinates = null;
    picker.map.setView(defaultMapCenter, 11);
  }
  $('#resource-map-status').text('Click the map to set the resource location.');
}

function editAdminResource(id) {
  const resource = resourceItems.find(item => String(item._id) === String(id));
  if (!resource) return;
  $('#resource-id').val(resource._id);
  $('#resource-name').val(resource.name || '');
  $('#resource-type').val(resource.type || 'other');
  $('#resource-district').val(resource.district || '');
  $('#resource-state').val(resource.state || '');
  $('#resource-address').val(resource.address || '');
  $('#resource-phones').val(Array.isArray(resource.phones) ? resource.phones.join(', ') : resource.phones || '');
  $('#resource-submit').text('Update Resource');
  $('#resource-cancel').prop('hidden', false);
  const coordinates = resourceCoordinates(resource);
  if (coordinates) setMapPoint('resource', coordinates.lat, coordinates.lng);
  $('#resource-name').trigger('focus');
}

function removeAdminResource(id) {
  if (!window.confirm('Remove this emergency resource?')) return;
  $.ajax({ url: `/api/admin/resources/${encodeURIComponent(id)}`, method: 'DELETE' })
    .done(loadAdminResources)
    .fail(xhr => showMessage('Error', xhr.responseJSON?.error || 'Unable to remove resource.'));
}

function getTaskCoordinates(task) {
  const point = task.locationPoint || (task.location?.type === 'Point' ? task.location : null);
  if (point?.coordinates?.length === 2) {
    const [lng, lat] = point.coordinates.map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const lat = Number(task.lat);
  const lng = Number(task.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function taskDirectionsUrl(task) {
  const coordinates = getTaskCoordinates(task);
  const destination = coordinates
    ? `${coordinates.lat},${coordinates.lng}`
    : [task.area, task.address, task.location, task.district, task.state].filter(value => typeof value === 'string' && value.trim()).join(', ');
  const query = coordinates ? 'destination' : 'query';
  return `https://www.google.com/maps/${coordinates ? 'dir' : 'search'}/?api=1&${query}=${encodeURIComponent(destination)}`;
}

async function loadTaskResources(task, containerId) {
  const container = $(`#${containerId}`);
  const coordinates = getTaskCoordinates(task);
  try {
    let resources = [];
    if (coordinates) {
      const response = await $.get('/api/resources/nearby', { lat: coordinates.lat, lng: coordinates.lng, radius: 10000 });
      resources = response.resources || [];
    } else {
      const response = await $.get('/api/admin/resources');
      const allResources = response.resources || [];
      const district = String(task.district || '').toLowerCase();
      const districtResources = allResources.filter(resource => !district || String(resource.district || '').toLowerCase().includes(district));
      resources = districtResources.length ? districtResources : allResources;
    }
    if (!resources.length) {
      container.text('No nearby emergency centers are listed yet.');
      return;
    }
    resources.slice(0, 4).forEach(resource => {
      const coordinates = resourceCoordinates(resource);
      const destination = coordinates
        ? `${coordinates.lat},${coordinates.lng}`
        : [resource.address, resource.district, resource.state].filter(Boolean).join(', ');
      const link = $('<a target="_blank" rel="noopener noreferrer">')
        .attr('href', `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`)
        .text(`${resource.name || 'Emergency center'}${resource.type ? ` · ${resource.type}` : ''}`);
      container.append($('<div class="small">').append(link));
    });
  } catch (error) {
    container.text('Nearby centers could not be loaded.');
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

async function openVolunteersDirectoryModal() {
  $('#modal-volunteers-dir').addClass('active');
  initMapPicker('dir');
  $('#volunteers-directory-list').html('Select a location to search for volunteers.');
}

async function loadDirectoryVolunteers(coordinates) {
  const container = $('#volunteers-directory-list');
  if (!coordinates) {
    container.html('Select a location to search for volunteers.');
    return;
  }
  container.html('<div style="text-align:center; padding:20px; color:var(--text-muted);">Searching nearby volunteers...</div>');
  try {
    const res = await $.ajax({
      url: '/api/volunteers/nearby',
      method: 'GET',
      data: { lat: coordinates.lat, lng: coordinates.lng, radiusKm: 3 }
    });
    const volunteers = res.volunteers || [];
    const container = $('#volunteers-directory-list');

    if (volunteers.length === 0) {
      container.html('<div style="text-align:center; padding:20px; color:var(--text-muted);">No verified active volunteers found within 3 km.</div>');
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
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">${v.distanceKm != null ? `${v.distanceKm.toFixed(2)} km away` : `District: ${v.district || ''}`} | Blood: ${v.bloodGroup || 'O+'}</div>
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

function locateDirectoryVolunteers() {
  locateMap('dir');
}

function closeVolunteersDirectoryModal() { $('#modal-volunteers-dir').removeClass('active'); }


// --- 3. CITIZEN FORM SUBMISSIONS (Auto-Dispatched) ---

function beginFormSubmission(form, message) {
  if (!form || form.dataset.submitting === 'true') return false;

  const submitButton = form.querySelector('[type="submit"]');
  if (!submitButton) return false;

  form.dataset.submitting = 'true';
  form.setAttribute('aria-busy', 'true');
  submitButton.dataset.originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Please wait...';

  const overlay = document.getElementById('submission-loading');
  document.getElementById('submission-loading-message').textContent = message;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  return true;
}

function endFormSubmission(form) {
  if (!form) return;

  const submitButton = form.querySelector('[type="submit"]');
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = submitButton.dataset.originalText || submitButton.textContent;
    delete submitButton.dataset.originalText;
  }

  delete form.dataset.submitting;
  form.removeAttribute('aria-busy');
  const overlay = document.getElementById('submission-loading');
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
}

async function submitReportForm(e) {
  e.preventDefault();
  const coordinates = getMapCoordinates('rep');
  if (!coordinates) return showMessage('Input Required', 'Select the exact incident location on the map first.');
  const form = document.getElementById('report-form');
  if (!beginFormSubmission(form, 'Submitting your incident report for validation...')) return;

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
  } finally {
    endFormSubmission(form);
  }
}

async function submitSosForm(e) {
  e.preventDefault();
  const coordinates = getMapCoordinates('sos');
  if (!coordinates) return showMessage('Input Required', 'Select the exact SOS location on the map first.');
  const form = document.getElementById('sos-form');
  if (!beginFormSubmission(form, 'Sending your urgent SOS request...')) return;

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
  } finally {
    endFormSubmission(form);
  }
}

async function submitVolApplyForm(e) {
  e.preventDefault();
  const coordinates = getMapCoordinates('vol');
  if (!coordinates) return showMessage('Input Required', 'Select your exact operating location on the map first.');
  const form = document.getElementById('vol-apply-form');
  if (!beginFormSubmission(form, 'Submitting your volunteer application...')) return;

  const payload = {
    name: $('#vapp-name').val(),
    phone: $('#vapp-phone').val(),
    username: $('#vapp-user').val(),
    password: $('#vapp-pass').val(),
    district: $('#vapp-district').val(),
    state: $('#vapp-state').val(),
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
  } finally {
    endFormSubmission(form);
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

async function handleCreateAccount(e) {
  e.preventDefault();
  const roleType = $('#acc-role').val();
  const endpoint = '/api/admin/create-admin';
  const payload = {
    name: $('#acc-name').val(),
    username: $('#acc-username').val(),
    password: $('#acc-password').val(),
    department: $('#acc-dept').val()
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
          <div style="font-size:0.8rem; color:var(--text-muted);">District: ${a.district || ''}</div>
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

    container.empty();
    incidents.forEach((incident, index) => appendVolunteerTask(container, incident, 'incident', index));
    sos.forEach((request, index) => appendVolunteerTask(container, request, 'sos', index));
  } catch (err) {
    console.error('Failed to load volunteer tasks:', err);
  }
}

function appendVolunteerTask(container, task, type, index) {
  const isSos = type === 'sos';
  const taskTitle = isSos ? `SOS: ${String(task.type || 'request').toUpperCase()}` : `Incident: ${task.title || 'Emergency response'}`;
  const location = isSos
    ? task.location || task.address || [task.district, task.state].filter(Boolean).join(', ')
    : task.area || task.address || [task.district, task.state].filter(Boolean).join(', ');
  const card = $('<article class="volunteer-task-card" style="padding:12px; border-bottom:1px solid var(--goi-border);">');
  card.append($('<strong>').text(taskTitle));
  card.append($('<span class="badge badge-info ms-2">')
    .text(isSos ? task.status || 'assigned' : task.volunteerStatus || 'assigned'));
  card.append($('<p style="font-size:0.85rem; color:var(--text-main); margin:4px 0;">')
    .text(isSos ? task.details || '' : task.description || ''));
  if (location) card.append($('<div class="small text-muted mb-2">').text(`Location: ${location}`));
  if (isSos && task.contact) card.append($('<div class="small text-muted mb-2">').text(`Contact: ${task.contact}`));

  const actions = $('<div class="d-flex flex-wrap gap-2 mt-2">');
  actions.append($('<a class="btn btn-primary btn-sm" target="_blank" rel="noopener noreferrer">')
    .attr('href', taskDirectionsUrl(task)).text('Navigate to location'));
  const enRoute = $('<button type="button" class="btn btn-outline btn-sm">').text('En Route')
    .on('click', () => updateTask(task._id, isSos ? 'en route' : 'En Route', type));
  const complete = $('<button type="button" class="btn btn-success btn-sm">').text(isSos ? 'Mark Fulfilled' : 'Completed')
    .on('click', () => updateTask(task._id, isSos ? 'fulfilled' : 'Fulfilled', type));
  actions.append(enRoute, complete);
  card.append(actions);

  const nearby = $('<div class="mt-2">').append($('<strong class="small">').text('Nearby emergency centers and shelters'));
  const nearbyList = $('<div class="small text-muted" aria-live="polite">').text('Finding nearby centers...');
  nearby.append(nearbyList);
  card.append(nearby);
  container.append(card);
  loadTaskResources(task, nearbyList);
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
      const isTargeted = data?.type === 'volunteer_notification';
      const isForCurrentVolunteer = !isTargeted || (currentUser?.role === 'volunteer' && data.targetVolunteerIds?.includes(String(currentUser.id)));
      if (data && data.title && isForCurrentVolunteer) {
        $('#alert-ticker').text(`${data.title}: ${data.body}`);
        loadPublicIncidents();
        if (isTargeted && currentUser?.role === 'volunteer') loadVolunteerTasks();
      }
    };
  } catch (e) {}
}
