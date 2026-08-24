// State/district names are vendored from the public India district dataset.
// Centers are retained only for legacy matching; precise workflows use map coordinates.
const indiaStateDistrictData = require('./india-states-districts.json');
const legacyDistrictDetails = {
  'Kamrup Metropolitan (Guwahati)': { aliases: ['Kamrup', 'Guwahati', 'Kamrup Metro', 'Kamrup Metropolitan', 'Kamrup Metro (Guwahati)'], center: [91.7362, 26.1445] },
  Dibrugarh: { aliases: ['Dibrugarh District'], center: [94.9120, 27.4728] },
  Jorhat: { aliases: [], center: [94.2037, 26.7509] },
  Silchar: { aliases: ['Cachar', 'Cachar (Silchar)'], center: [92.7789, 24.8333] },
  Nagaon: { aliases: [], center: [92.6856, 26.3509] },
  Lakhimpur: { aliases: ['North Lakhimpur'], center: [94.1024, 27.2348] },
  Bongaigaon: { aliases: [], center: [90.5576, 26.4837] },
  Sonitpur: { aliases: ['Tezpur'], center: [92.7926, 26.6338] },
  Darrang: { aliases: ['Mangaldoi'], center: [92.0300, 26.6500] },
  Goalpara: { aliases: [], center: [90.6266, 26.1641] },
  'Mumbai City': { aliases: ['Mumbai', 'Greater Mumbai', 'Bombay'], center: [72.8777, 19.0760] },
  Chennai: { aliases: ['Chennai District', 'Madras'], center: [80.2707, 13.0827] },
  Kolkata: { aliases: ['Calcutta', 'Kolkata District'], center: [88.3639, 22.5726] },
  'New Delhi': { aliases: ['Delhi', 'Central Delhi', 'NDMC'], center: [77.2090, 28.6139] }
};
const INDIAN_DISTRICTS = indiaStateDistrictData.flatMap(({ stateName, districts }) => districts.map(district => ({
  name: typeof district === 'string' ? district : district.name,
  state: stateName,
  aliases: legacyDistrictDetails[typeof district === 'string' ? district : district.name]?.aliases || [],
  ...(legacyDistrictDetails[typeof district === 'string' ? district : district.name]?.center ? { center: legacyDistrictDetails[typeof district === 'string' ? district : district.name].center } : {})
})));

const STATE_ALIASES = {
  'assam': 'Assam',
  'maharashtra': 'Maharashtra',
  'tamil nadu': 'Tamil Nadu',
  'tamilnadu': 'Tamil Nadu',
  'west bengal': 'West Bengal',
  'delhi': 'Delhi',
  'nct of delhi': 'Delhi',
  'new delhi': 'Delhi',
  'odisha': 'Odisha',
  'pondicherry': 'Puducherry'
};

function getStates() {
  return [...new Set(indiaStateDistrictData.map(d => d.stateName))].sort();
}

function getDistrictsByState(state) {
  if (!state) return INDIAN_DISTRICTS.map(d => d.name).sort();
  const norm = state.trim().toLowerCase();
  return INDIAN_DISTRICTS
    .filter(d => d.state.toLowerCase() === norm || STATE_ALIASES[norm] === d.state)
    .map(d => d.name)
    .sort();
}

function findDistrictRecord(input) {
  if (!input) return null;
  const lower = input.trim().toLowerCase();
  for (const record of INDIAN_DISTRICTS) {
    if (record.name.toLowerCase() === lower) return record;
    if (record.aliases.some(a => a.toLowerCase() === lower)) return record;
    if (record.name.toLowerCase().includes(lower) || lower.includes(record.name.toLowerCase())) return record;
    if (record.aliases.some(a => a.toLowerCase().includes(lower) || lower.includes(a.toLowerCase()))) return record;
  }
  return null;
}

module.exports = { INDIAN_DISTRICTS, STATE_ALIASES, getStates, getDistrictsByState, findDistrictRecord };
