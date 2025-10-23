const resourceModel = require('../models/resourceModel');
const { ObjectId } = require('mongodb');

async function getNearbyResources(req, res) {
  const { lat, lng, radius } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "Missing lat/lng" });
  const radiusMeters = parseInt(radius) || 5000;
  const resources = await resourceModel.getNearby(Number(lat), Number(lng), radiusMeters);
  res.json({ resources });
}

async function createResource(req, res) {
  const { name, type, phones, address, location } = req.body;
  if (!name || !type || !location 
      || !location.coordinates 
      || location.type !== "Point") {
    return res.status(400).json({ error: "Invalid resource payload" });
  }
  const doc = { name, type, phones, address, location };
  await resourceModel.insertResource(doc);
  res.json({ ok: true });
}

async function updateResource(req, res) {
  const id = new ObjectId(req.params.id);
  const updates = req.body;
  delete updates._id;
  if (updates.location && updates.location.type !== "Point") {
    return res.status(400).json({ error: "Location must be GeoJSON Point" });
  }
  await resourceModel.updateResource(id, updates);
  res.json({ ok: true });
}

async function deleteResource(req, res) {
  const id = new ObjectId(req.params.id);
  await resourceModel.deleteResource(id);
  res.json({ ok: true });
}

async function getAllResources(req, res) {
  try {
    const resources = await resourceModel.getAll();
    res.json({ resources });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resources' });
  }
}

module.exports = { getNearbyResources, createResource, updateResource, deleteResource, getAllResources };
