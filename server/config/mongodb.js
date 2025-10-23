const { MongoClient } = require('mongodb');
const uri = "mongodb://localhost:27017";
const DBNAME = "disasterdb";
const client = new MongoClient(uri, {});
let db;

async function connectMongo() {
  await client.connect();
  db = client.db(DBNAME);
  await db.collection('resources').createIndex({ location: "2dsphere" });
  return db;
}
function getDb() {
  if (!db) throw new Error('MongoDB not yet connected!');
  return db;
}
module.exports = { connectMongo, getDb };
