const { getDb } = require('../config/mongodb');
const ADMINS = 'admins';

async function findByUsername(username) {
  return await getDb().collection(ADMINS).findOne({ username });
}
async function findById(_id) {
  return await getDb().collection(ADMINS).findOne({ _id });
}
async function getAllAdmins() {
  return await getDb().collection(ADMINS).find({}).project({ password: 0 }).toArray();
}
async function insertAdmin(doc) {
  return await getDb().collection(ADMINS).insertOne(doc);
}
module.exports = { findByUsername, findById, getAllAdmins, insertAdmin };
