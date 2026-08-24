const { getStates, getDistrictsByState, INDIAN_DISTRICTS } = require('../../utils/geoData');

function getGeoData(req, res) {
  res.json({
    states: getStates(),
    districts: INDIAN_DISTRICTS.map(d => ({ name: d.name, state: d.state }))
  });
}

function getDistrictsForState(req, res) {
  const { state } = req.query;
  if (!state) {
    return res.status(400).json({ error: 'State query parameter is required.' });
  }
  res.json({ districts: getDistrictsByState(state) });
}

module.exports = { getGeoData, getDistrictsForState };
