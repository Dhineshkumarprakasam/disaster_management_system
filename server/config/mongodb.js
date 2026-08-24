const { MongoClient } = require('mongodb');
const DBNAME = "disasterdb";

let db = null;
let useMemoryStore = false;

async function tryConnect(targetUri) {
  const client = new MongoClient(targetUri, { serverSelectionTimeoutMS: 2000 });
  await client.connect();
  const database = client.db(DBNAME);
  try {
    await database.collection('resources').createIndex({ location: "2dsphere" });
  } catch (e) {}
  return database;
}

async function connectMongo() {
  const urisToTry = [];
  if (process.env.MONGODB_URI) urisToTry.push(process.env.MONGODB_URI);
  urisToTry.push("mongodb://mongo:27017", "mongodb://127.0.0.1:27017");

  for (const uri of urisToTry) {
    try {
      db = await tryConnect(uri);
      console.log(`✅ Connected to MongoDB successfully (${uri}).`);
      return db;
    } catch (err) {
      // try next
    }
  }

  console.warn('⚠️ MongoDB connection unavailable. Switching to In-Memory Engine for NDMS.');
  useMemoryStore = true;
  const memoryStore = require('../models/dataStore');
  await memoryStore.ready;
  return null;
}

function getDb() {
  if (useMemoryStore || !db) {
    return null;
  }
  return db;
}

module.exports = { connectMongo, getDb };
