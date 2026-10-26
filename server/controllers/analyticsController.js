const { getDisasterDashboard } = require('../services/clickHouseService');

async function getDashboard(req, res) {
  try {
    const dashboard = await getDisasterDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('Failed to load ClickHouse disaster dashboard', error);
    res.status(503).json({ error: 'Disaster analytics are temporarily unavailable' });
  }
}

module.exports = { getDashboard };
