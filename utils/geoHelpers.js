const { INDIAN_DISTRICTS, STATE_ALIASES, findDistrictRecord } = require('./geoData');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeState(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (STATE_ALIASES[lower]) return STATE_ALIASES[lower];
  const match = INDIAN_DISTRICTS.find(d => d.state.toLowerCase() === lower);
  return match ? match.state : trimmed;
}

function normalizeDistrict(input) {
  if (!input) return null;
  const record = findDistrictRecord(input);
  return record ? record.name : input.trim();
}

function validateDistrictState(district, state) {
  const normDistrict = normalizeDistrict(district);
  const normState = normalizeState(state);
  const record = findDistrictRecord(district);
  if (!record) {
    if (!normDistrict || !normState) {
      return { valid: false, error: 'A district and state are required.' };
    }
    return { valid: true, district: normDistrict, state: normState };
  }
  if (normState && record.state.toLowerCase() !== normState.toLowerCase()) {
    return {
      valid: false,
      error: `District "${normDistrict}" belongs to ${record.state}, not ${normState}.`
    };
  }
  return { valid: true, district: normDistrict, state: record.state };
}

function matchDistrict(itemDistrict, filterDistrict) {
  if (!filterDistrict) return true;
  if (!itemDistrict) return false;
  const a = normalizeDistrict(itemDistrict).toLowerCase();
  const b = normalizeDistrict(filterDistrict).toLowerCase();
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function matchState(itemState, filterState) {
  if (!filterState) return true;
  if (!itemState) return false;
  return normalizeState(itemState).toLowerCase() === normalizeState(filterState).toLowerCase();
}

function matchLocation(item, { district, state }) {
  if (!district && !state) return true;
  const stateOk = matchState(item.state, state);
  const districtOk = matchDistrict(item.district, district);
  return stateOk && districtOk;
}

function getCoordinates(doc) {
  const point = doc?.locationPoint || doc?.location;
  if (point?.type === 'Point' && Array.isArray(point.coordinates) && point.coordinates.length === 2) {
    const [lng, lat] = point.coordinates.map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lng, lat };
    }
  }
  if (doc?.lat != null && doc?.lng != null) {
    const lat = Number(doc.lat);
    const lng = Number(doc.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lng, lat };
    }
  }
  return null;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getMatchingDistrictPatterns(district) {
  if (!district) return [];
  const record = findDistrictRecord(district);
  const patterns = new Set([district, normalizeDistrict(district)]);
  if (record) {
    patterns.add(record.name);
    record.aliases.forEach(a => patterns.add(a));
  }
  INDIAN_DISTRICTS.forEach(d => {
    if (matchDistrict(d.name, district)) {
      patterns.add(d.name);
      d.aliases.forEach(a => patterns.add(a));
    }
  });
  return [...patterns].filter(Boolean);
}

function buildGeoScopeFilter(district, state) {
  if (!district && !state) return {};
  const conditions = [];
  if (state) {
    const normState = normalizeState(state);
    conditions.push({ state: new RegExp(`^${escapeRegex(normState)}$`, 'i') });
  }
  if (district) {
    const patterns = getMatchingDistrictPatterns(district);
    conditions.push({
      $or: patterns.map(p => ({ district: new RegExp(escapeRegex(p), 'i') }))
    });
  }
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}

function filterByGeoScope(items, district, state) {
  if (!district && !state) return items;
  return items.filter(item => matchLocation(item, { district, state }));
}

function countActiveAssignments(volunteerId, incidents, sosRequests) {
  const id = volunteerId?.toString();
  const activeIncidentStatuses = new Set(['assigned', 'en route', 'En Route']);
  const activeSosStatuses = new Set(['assigned', 'en route']);
  let count = 0;
  for (const inc of incidents) {
    if (inc.assignedVolunteerId?.toString() === id) {
      const status = (inc.volunteerStatus || 'assigned').toLowerCase();
      if (!status.includes('fulfilled') && !status.includes('completed')) count++;
    }
  }
  for (const sos of sosRequests) {
    if (sos.assignedVolunteerId?.toString() === id) {
      const status = (sos.status || 'assigned').toLowerCase();
      if (status !== 'fulfilled') count++;
    }
  }
  return count;
}

function localityMatch(targetArea, volunteerLocation) {
  if (!targetArea || !volunteerLocation) return false;
  const area = targetArea.toLowerCase().trim();
  const loc = volunteerLocation.toLowerCase().trim();
  const areaPart = area.split(',')[0].trim();
  const locPart = loc.split(',')[0].trim();
  return area.includes(locPart) || loc.includes(areaPart);
}

function buildLocationPoint(lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return null;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return null;
  return { type: 'Point', coordinates: [parsedLng, parsedLat] };
}

const VOLUNTEER_ASSIGNMENT_RADIUS_KM = 3;

function isWithinVolunteerRadius(target, volunteer, radiusKm = VOLUNTEER_ASSIGNMENT_RADIUS_KM) {
  const targetCoords = getCoordinates(target);
  const volunteerCoords = getCoordinates(volunteer);
  if (!targetCoords || !volunteerCoords) return { eligible: false, distanceKm: null };
  const distanceKm = haversineDistance(targetCoords.lat, targetCoords.lng, volunteerCoords.lat, volunteerCoords.lng);
  return { eligible: distanceKm <= radiusKm, distanceKm };
}

function resolveGeoInput({ district, state, lat, lng, area, location }) {
  const validation = validateDistrictState(district, state);
  if (!validation.valid) return validation;
  const hasLat = lat != null && lat !== '';
  const hasLng = lng != null && lng !== '';
  if (hasLat !== hasLng) return { valid: false, error: 'Both latitude and longitude are required together.' };
  const locationPoint = buildLocationPoint(lat, lng);
  if (hasLat && !locationPoint) return { valid: false, error: 'Invalid latitude or longitude.' };
  return {
    valid: true,
    district: validation.district,
    state: validation.state,
    location: locationPoint,
    address: [area, location].filter(Boolean).join(', ') || ''
  };
}

module.exports = {
  escapeRegex,
  normalizeState,
  normalizeDistrict,
  validateDistrictState,
  matchDistrict,
  matchState,
  matchLocation,
  getCoordinates,
  haversineDistance,
  getMatchingDistrictPatterns,
  buildGeoScopeFilter,
  filterByGeoScope,
  countActiveAssignments,
  localityMatch,
  buildLocationPoint,
  resolveGeoInput,
  VOLUNTEER_ASSIGNMENT_RADIUS_KM,
  isWithinVolunteerRadius
};
