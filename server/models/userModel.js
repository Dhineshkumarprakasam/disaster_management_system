const { getDb } = require('../config/mongodb');
const memoryStore = require('./dataStore');
const { ObjectId } = require('mongodb');
const USERS = 'users';

function toMongoId(id) {
  return typeof id === 'string' && ObjectId.isValid(id) ? new ObjectId(id) : id;
}

async function findByUsername(username) {
  const db = getDb();
  if (!db) {
    return memoryStore.users.find(u => u.username === username) || null;
  }
  return getDb().collection(USERS).findOne({ username });
}

async function findById(_id) {
  const db = getDb();
  if (!db) {
    const idStr = typeof _id === 'object' && _id ? _id.toString() : _id;
    return memoryStore.users.find(u => u._id === idStr) || null;
  }
  return getDb().collection(USERS).findOne({ _id: toMongoId(_id) });
}

async function insertUser(doc) {
  const db = getDb();
  if (!db) {
    const _id = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newUser = { _id, ...doc, createdAt: doc.createdAt || new Date() };
    memoryStore.users.push(newUser);
    return { insertedId: _id };
  }
  return getDb().collection(USERS).insertOne(doc);
}

async function updateUser(_id, updates) {
  const db = getDb();
  if (!db) {
    const idStr = typeof _id === 'object' && _id ? _id.toString() : _id;
    const user = memoryStore.users.find(u => u._id === idStr);
    if (user) {
      Object.assign(user, updates);
      return { matchedCount: 1, modifiedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }
  return getDb().collection(USERS).updateOne({ _id: toMongoId(_id) }, { $set: updates });
}

module.exports = { findByUsername, findById, insertUser, updateUser };