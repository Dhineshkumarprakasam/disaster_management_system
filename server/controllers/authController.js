const { findByUsername, insertAdmin, getAllAdmins } = require('../models/adminModel');
const { getRedis } = require('../config/redis');
const { ObjectId } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const SESSION_TTL = 3600; // 1hr
const SESSION_COOKIE_NAME = "dm_session";

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Required.' });
  const admin = await findByUsername(username);
  // WARNING: Password compared as plaintext. Use bcrypt in production!
  if (!admin || admin.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = uuidv4();
  const sessionData = {
    adminId: admin._id.toHexString(),
    expiresAt: Date.now() + SESSION_TTL * 1000,
  };
  await getRedis().setEx(`session:${token}`, SESSION_TTL, JSON.stringify(sessionData));
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: SESSION_TTL * 1000
  });
  res.json({ ok: true, admin: { username: admin.username, name: admin.name } });
}

async function logout(req, res) {
  const token = req.token;
  await getRedis().del(`session:${token}`);
  res.clearCookie(SESSION_COOKIE_NAME);
  res.json({ ok: true });
}

async function me(req, res) {
  const { adminId } = req.session;
  res.json({ adminId });
}

async function listAdmins(req, res) {
  const list = await getAllAdmins();
  res.json({ admins: list });
}

module.exports = { login, logout, me, listAdmins };
