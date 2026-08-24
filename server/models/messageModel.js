const { getDb } = require('../config/mongodb');
const MESSAGES = 'messages';
const { ObjectId } = require('mongodb');
const memoryStore = require('./dataStore');

function memoryMode() {
  return !getDb();
}

function idMatches(itemId, id) {
  return itemId?.toString() === id?.toString();
}

async function insertMessage(doc) {
  doc.createdAt = doc.updatedAt = new Date();
  if (memoryMode()) {
    const message = { _id: `msg_${Date.now()}`, ...doc };
    memoryStore.messages.unshift(message);
    return { insertedId: message._id };
  }
  return await getDb().collection(MESSAGES).insertOne(doc);
}
async function updateMessage(id, updates) {
  updates.updatedAt = new Date();
  if (memoryMode()) {
    const message = memoryStore.messages.find(item => idMatches(item._id, id));
    if (!message) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(message, updates);
    return { matchedCount: 1, modifiedCount: 1 };
  }
  return await getDb().collection(MESSAGES).updateOne(
    { _id: new ObjectId(id) },
    { $set: updates }
  );
}
async function deleteMessage(id) {
  if (memoryMode()) {
    const index = memoryStore.messages.findIndex(item => idMatches(item._id, id));
    if (index === -1) return { deletedCount: 0 };
    memoryStore.messages.splice(index, 1);
    return { deletedCount: 1 };
  }
  return await getDb().collection(MESSAGES).deleteOne({ _id: new ObjectId(id) });
}
async function getAllMessages() {
  if (memoryMode()) return memoryStore.messages;
  return await getDb().collection(MESSAGES).find({}).toArray();
}
async function getActiveMessages() {
  if (memoryMode()) return memoryStore.messages.filter(message => message.active);
  return await getDb().collection(MESSAGES)
    .find({ active: true })
    .sort({ createdAt: -1 }).toArray();
}
async function findMessageById(id) {
  if (memoryMode()) return memoryStore.messages.find(item => idMatches(item._id, id)) || null;
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
