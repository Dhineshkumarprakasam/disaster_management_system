const resourceModel = require('../models/resourceModel');
const { ObjectId } = require('mongodb');
const { buildLocationPoint } = require('../../utils/geoHelpers');

async function getNearbyResources(req, res) {
  const { lat, lng, radius } = req.query;
  if (lat == null || lng == null) return res.status(400).json({ error: "Missing lat/lng" });
  const point = buildLocationPoint(lat, lng);
  const radiusMeters = radius == null ? 5000 : Number(radius);
  if (!point || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return res.status(400).json({ error: "Invalid coordinates or radius" });
  const resources = await resourceModel.getNearby(point.coordinates[1], point.coordinates[0], radiusMeters);
  res.json({ resources });
}

async function createResource(req, res) {
  const { name, type, phones, address, district, state, location } = req.body;
  if (!name || !type || !location || location.type !== "Point" || !buildLocationPoint(location.coordinates?.[1], location.coordinates?.[0])) {
    return res.status(400).json({ error: "Invalid resource payload" });
  }
  const doc = { name, type, phones, address, district, state, location };
  await resourceModel.insertResource(doc);
  res.json({ ok: true });
}

async function updateResource(req, res) {
  const id = ObjectId.isValid(req.params.id) ? new ObjectId(req.params.id) : req.params.id;
  const updates = req.body;
  delete updates._id;
  if (updates.location && (updates.location.type !== "Point" || !buildLocationPoint(updates.location.coordinates?.[1], updates.location.coordinates?.[0]))) {
    return res.status(400).json({ error: "Location must be GeoJSON Point" });
  }
  await resourceModel.updateResource(id, updates);
  res.json({ ok: true });
}

async function deleteResource(req, res) {
  const id = ObjectId.isValid(req.params.id) ? new ObjectId(req.params.id) : req.params.id;
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
