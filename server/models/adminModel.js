const { getDb } = require('../config/mongodb');
const memoryStore = require('./dataStore');
const ADMINS = 'admins';

async function findByUsername(username) {
  const db = getDb();
  if (!db) {
    return memoryStore.admins.find(a => a.username === username) || null;
  }
  return await db.collection(ADMINS).findOne({ username });
}

async function getAllAdmins() {
  const db = getDb();
  if (!db) {
    return memoryStore.admins.map(({ passwordHash, password, ...rest }) => rest);
  }
  return await db.collection(ADMINS).find({}).project({ password: 0, passwordHash: 0 }).toArray();
}

async function insertAdmin(doc) {
  const db = getDb();
  if (!db) {
    const _id = 'admin_' + Date.now();
    const newAdmin = { _id, ...doc, createdAt: new Date() };
    memoryStore.admins.push(newAdmin);
    return { insertedId: _id };
  }
  return await db.collection(ADMINS).insertOne(doc);
}

module.exports = { findByUsername, getAllAdmins, insertAdmin };
