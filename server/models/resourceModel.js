const { getDb } = require('../config/mongodb');
const { haversineDistance } = require('../../utils/geoHelpers');
const COLLECTION = 'resources';
const memoryStore = require('./dataStore');

function memoryMode() {
  return !getDb();
}

function idMatches(itemId, id) {
  return itemId?.toString() === id?.toString();
}

async function insertResource(doc) {
  doc.createdAt = new Date();
  if (memoryMode()) {
    const resource = { _id: `res_${Date.now()}`, ...doc };
    memoryStore.resources.unshift(resource);
    return { insertedId: resource._id };
  }
  return await getDb().collection(COLLECTION).insertOne(doc);
}
async function updateResource(id, updates) {
  if (memoryMode()) {
    const resource = memoryStore.resources.find(item => idMatches(item._id, id));
    if (!resource) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(resource, updates);
    return { matchedCount: 1, modifiedCount: 1 };
  }
  return await getDb().collection(COLLECTION).updateOne(
    { _id: id },
    { $set: updates }
  );
}
async function deleteResource(id) {
  if (memoryMode()) {
    const index = memoryStore.resources.findIndex(item => idMatches(item._id, id));
    if (index === -1) return { deletedCount: 0 };
    memoryStore.resources.splice(index, 1);
    return { deletedCount: 1 };
  }
  return await getDb().collection(COLLECTION).deleteOne({ _id: id });
}
async function getNearby(lat, lng, radius = 5000) {
  if (memoryMode()) {
    return memoryStore.resources
      .map(resource => {
        const coordinates = resource.location?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
        const [resourceLng, resourceLat] = coordinates.map(Number);
        const distanceKm = haversineDistance(lat, lng, resourceLat, resourceLng);
        return Number.isFinite(distanceKm) ? { resource, distanceKm } : null;
      })
      .filter(item => item && item.distanceKm <= radius / 1000)
      .sort((first, second) => first.distanceKm - second.distanceKm)
      .map(item => item.resource);
  }
  return await getDb().collection(COLLECTION).find({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radius,
      }
    }
  }).toArray();
}
async function getAll() {
  if (memoryMode()) return memoryStore.resources;
  return await getDb().collection(COLLECTION).find({}).toArray();
}
module.exports = { insertResource, updateResource, deleteResource, getNearby, getAll };
