const { findByUsername: findAdmin, getAllAdmins, insertAdmin } = require('../models/adminModel');
const userModel = require('../models/userModel');
const { getRedis } = require('../config/redis');
const { getDb } = require('../config/mongodb');
const memoryStore = require('../models/dataStore');
const { ObjectId } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { buildLocationPoint, validateDistrictState } = require('../../utils/geoHelpers');

const SESSION_TTL = 86400; // 24 hours
const SESSION_COOKIE_NAME = "dm_session";

async function login(req, res) {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const account = await userModel.findByUsername(username) || await findAdmin(username);
    if (!account) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    const validPassword = account.passwordHash
      ? await bcrypt.compare(password, account.passwordHash)
      : account.password === password;

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
    }

    const accountRole = account.role || 'admin';
    if (role && role !== accountRole) {
      return res.status(403).json({ error: `These credentials belong to a ${accountRole} account, not ${role}.` });
    }

    // Block pending/rejected volunteers from logging in
    if (account.status && account.status === 'pending') {
      return res.status(403).json({
        error: 'Your volunteer application is still under review. Government staff will approve your account shortly.',
        status: 'pending'
      });
    }
    if (account.status && account.status === 'rejected') {
      return res.status(403).json({
        error: 'Your volunteer application was not approved. Please contact the district authority.',
        status: 'rejected'
      });
    }

    const accountIdStr = account._id ? account._id.toString() : account.id;

    const token = uuidv4();
    const sessionData = {
      userId: accountIdStr,
      adminId: accountIdStr,
      username: account.username,
      name: account.name,
      role: accountRole,
      department: account.department || null,
      district: account.district || null,
      expiresAt: Date.now() + SESSION_TTL * 1000,
    };

    await getRedis().setEx(`session:${token}`, SESSION_TTL, JSON.stringify(sessionData));

    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: SESSION_TTL * 1000
    });

    res.json({
      ok: true,
      token,
      user: {
        id: accountIdStr,
        username: account.username,
        name: account.name,
        role: accountRole,
        department: account.department || null,
        district: account.district || null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
}

async function logout(req, res) {
  const token = req.token || req.cookies?.[SESSION_COOKIE_NAME];
  if (token) {
    await getRedis().del(`session:${token}`);
  }
  res.clearCookie(SESSION_COOKIE_NAME);
  res.json({ ok: true });
}

async function me(req, res) {
  if (!req.session) {
    return res.json({ user: null });
  }
  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      name: req.session.name,
      role: req.session.role,
      department: req.session.department,
      district: req.session.district || 'All Districts'
    }
  });
}

// Public endpoint: check volunteer application status by username
async function checkVolunteerStatus(req, res) {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    const user = await userModel.findByUsername(username);
    if (!user || user.role !== 'volunteer') {
      return res.status(404).json({ error: 'No volunteer application found for this username.' });
    }

    // Find the application record
    const db = getDb();
    let application = null;
    if (db) {
      const applicantId = user._id || user.id;
      application = await db.collection('volunteerApplications').findOne({
        $or: [{ applicantId }, { applicantId: applicantId?.toString() }]
      });
    } else {
      const userId = user._id ? user._id.toString() : user.id;
      application = memoryStore.volunteerApplications.find(a => a.applicantId === userId || a.applicantId?.toString() === userId);
    }

    res.json({
      ok: true,
      status: user.status || 'pending',
      name: user.name,
      district: user.district || 'Kamrup',
      appliedAt: application?.createdAt || user.createdAt,
      reviewedAt: application?.reviewedAt || user.reviewedAt || null
    });
  } catch (err) {
    console.error('checkVolunteerStatus error:', err);
    res.status(500).json({ error: 'Failed to check application status.' });
  }
}

// Volunteer applies with full details
async function applyVolunteer(req, res) {
  try {
    const { username, password, name, phone, email, skills, availability, bloodGroup, idProofType, idProofNumber, district, state, location, lat, lng } = req.body;
    if (!username || !password || !name || !phone) {
      return res.status(400).json({ error: 'Username, password, full name, and phone are required.' });
    }

    if (await userModel.findByUsername(username) || await findAdmin(username)) {
      return res.status(409).json({ error: 'Username already exists. Please choose another username.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const parsedSkills = Array.isArray(skills) ? skills : (skills ? skills.split(',').map(s => s.trim()) : ['General Emergency Relief']);
    const locationPoint = buildLocationPoint(lat, lng);
    if (!locationPoint) {
      return res.status(400).json({ error: 'Select your exact operating location on the map.' });
    }
    const geo = validateDistrictState(district, state);
    if (!geo.valid) {
      return res.status(400).json({ error: geo.error });
    }

    const userDoc = {
      username,
      passwordHash,
      name,
      phone,
      email: email || '',
      role: 'volunteer',
      status: 'pending',
      skills: parsedSkills,
      availability: availability || 'Immediate',
      bloodGroup: bloodGroup || 'O+',
      idProofType: idProofType || 'Aadhaar',
      idProofNumber: idProofNumber || '',
      district: geo.district,
      state: geo.state,
      location: location || '',
      locationPoint,
      createdAt: new Date()
    };

    const userResult = await userModel.insertUser(userDoc);
    const userId = userResult.insertedId;

    const appDoc = {
      _id: 'app_' + Date.now(),
      applicantId: userId,
      name,
      phone,
      email: email || '',
      skills: parsedSkills,
      availability: availability || 'Immediate',
      bloodGroup: bloodGroup || 'O+',
      idProofType: idProofType || 'Aadhaar',
      idProofNumber: idProofNumber || '',
      district: geo.district,
      state: geo.state,
      status: 'pending',
      createdAt: new Date()
    };

    const db = getDb();
    if (db) {
      await db.collection('volunteerApplications').insertOne(appDoc);
    } else {
      memoryStore.volunteerApplications.push(appDoc);
    }

    res.status(201).json({
      ok: true,
      id: userId,
      message: 'Volunteer application submitted! Government staff will review and approve your account. You can check your status using your username.'
    });
  } catch (err) {
    console.error('Apply volunteer error:', err);
    res.status(500).json({ error: 'Failed to submit volunteer application.' });
  }
}

// Admin creates Government Staff
async function createGovernment(req, res) {
  try {
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Super Admin can create Government Staff accounts.' });
    }

    const { username, password, name, phone, email, department, district, state } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and full name are required.' });
    }

    if (await userModel.findByUsername(username) || await findAdmin(username)) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await userModel.insertUser({
      username,
      passwordHash,
      name,
      phone: phone || '',
      email: email || '',
      department: department || 'Kamrup District Disaster Management Authority',
      district: district || 'Kamrup',
      state: state || 'Assam',
      role: 'government',
      status: 'approved',
      createdBy: req.session.userId,
      createdAt: new Date()
    });

    res.status(201).json({ ok: true, id: result.insertedId, message: `Government Staff account for "${name}" created successfully and assigned to ${district || 'Kamrup'} district.` });
  } catch (err) {
    console.error('Create govt error:', err);
    res.status(500).json({ error: 'Failed to create Government Staff account.' });
  }
}

// Admin creates another Admin
async function createAdmin(req, res) {
  try {
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Super Admin can create other Admin accounts.' });
    }

    const { username, password, name, phone, email } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and full name are required.' });
    }

    if (await userModel.findByUsername(username) || await findAdmin(username)) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await insertAdmin({
      username,
      passwordHash,
      name,
      phone: phone || '',
      email: email || '',
      role: 'admin',
      createdBy: req.session.userId,
      createdAt: new Date()
    });

    res.status(201).json({ ok: true, id: result.insertedId, message: `Super Admin account "${name}" created successfully.` });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ error: 'Failed to create Admin account.' });
  }
}

async function listAdmins(req, res) {
  const list = await getAllAdmins();
  res.json({ admins: list });
}

// Admin: list all government staff accounts
async function listGovernmentStaff(req, res) {
  try {
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const db = getDb();
    if (db) {
      const staff = await db.collection('users').find({ role: 'government' }, { projection: { passwordHash: 0, password: 0 } }).sort({ createdAt: -1 }).toArray();
      return res.json({ staff });
    }

    const staff = memoryStore.users
      .filter(u => u.role === 'government')
      .map(({ passwordHash, password, ...rest }) => rest);
    return res.json({ staff });
  } catch (err) {
    console.error('listGovernmentStaff error:', err);
    res.status(500).json({ error: 'Failed to list government staff.' });
  }
}

module.exports = { login, logout, me, listAdmins, applyVolunteer, createGovernment, createAdmin, listGovernmentStaff, checkVolunteerStatus };
