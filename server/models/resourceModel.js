const { getDb } = require('../config/mongodb');
const COLLECTION = 'resources';

async function insertResource(doc) {
  doc.createdAt = new Date();
  return await getDb().collection(COLLECTION).insertOne(doc);
}
async function updateResource(id, updates) {
  return await getDb().collection(COLLECTION).updateOne(
    { _id: id },
    { $set: updates }
  );
}
async function deleteResource(id) {
  return await getDb().collection(COLLECTION).deleteOne({ _id: id });
}
async function getById(id) {
  return await getDb().collection(COLLECTION).findOne({ _id: id });
}
async function getNearby(lat, lng, radius = 5000) {
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
  return await getDb().collection(COLLECTION).find({}).toArray();
}
module.exports = { insertResource, updateResource, deleteResource, getById, getNearby, getAll };
