const messageModel = require('../models/messageModel');
const { ObjectId } = require('mongodb');
const { publishMessage } = require('../services/redisService');

async function getActiveMessages(req, res) {
  const messages = await messageModel.getActiveMessages();
  res.json({ messages });
}

async function createMessage(req, res) {
  const { title, body, severity, area, active } = req.body;
  const authorId = req.session.adminId;
  if (!title || !body || !severity) return res.status(400).json({ error: "Required fields" });
  const doc = {
    title, body, severity, area,
    active: !!active,
    authorId: new ObjectId(authorId)
  };
  const ret = await messageModel.insertMessage(doc);
  if (doc.active) {
    await publishMessage({ ...doc, _id: ret.insertedId, createdAt: doc.createdAt });
  }
  res.json({ ok: true, id: ret.insertedId });
}

async function updateMessage(req, res) {
  const id = req.params.id;
  const updates = req.body;
  const message = await messageModel.findMessageById(id);
  if (!message) return res.status(404).json({ error: "Not found" });
  await messageModel.updateMessage(id, updates);
  if (('active' in updates && updates.active) || message.active) {
    const doc = await messageModel.findMessageById(id);
    await publishMessage(doc);
  }
  res.json({ ok: true });
}

async function deleteMessage(req, res) {
  const id = req.params.id;
  await messageModel.deleteMessage(id);
  res.json({ ok: true });
}

module.exports = { getActiveMessages, createMessage, updateMessage, deleteMessage };
