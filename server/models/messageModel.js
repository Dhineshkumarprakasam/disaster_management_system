const { getDb } = require('../config/mongodb');
const MESSAGES = 'messages';
const { ObjectId } = require('mongodb');

async function insertMessage(doc) {
  doc.createdAt = doc.updatedAt = new Date();
  return await getDb().collection(MESSAGES).insertOne(doc);
}
async function updateMessage(id, updates) {
  updates.updatedAt = new Date();
  return await getDb().collection(MESSAGES).updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  );
}
async function deleteMessage(id) {
  return await getDb().collection(MESSAGES).deleteOne({ _id: new ObjectId(id) });
}
async function getAllMessages() {
  return await getDb().collection(MESSAGES).find({}).toArray();
}
async function getActiveMessages() {
  return await getDb().collection(MESSAGES)
    .find({ active: true })
    .sort({ createdAt: -1 }).toArray();
}
async function findMessageById(id) {
  return await getDb().collection(MESSAGES).findOne({ _id: new ObjectId(id) });
}
module.exports = {
  insertMessage,
  updateMessage,
  deleteMessage,
  getAllMessages,
  getActiveMessages,
  findMessageById
};
