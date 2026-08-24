const { getDb } = require('../config/mongodb');
const memoryStore = require('../models/dataStore');
const { publishMessage } = require('../services/redisService');
const userModel = require('../models/userModel');
const {
  matchDistrict,
  matchLocation,
  validateDistrictState,
  resolveGeoInput,
  buildGeoScopeFilter,
  filterByGeoScope,
  getCoordinates,
  haversineDistance,
  countActiveAssignments,
  localityMatch,
  normalizeDistrict,
  normalizeState,
  isWithinVolunteerRadius,
  VOLUNTEER_ASSIGNMENT_RADIUS_KM
} = require('../../utils/geoHelpers');

// --- Helper Functions for DB vs Memory Store ---
function getCollection(name) {
  const db = getDb();
  if (db) return db.collection(name);
  return null;
}

async function fetchActiveAssignments(db) {
  if (db) {
    const [incidents, sosRequests] = await Promise.all([
      db.collection('disasterReports').find({ assignedVolunteerId: { $ne: null } }).toArray(),
      db.collection('resourceRequests').find({ assignedVolunteerId: { $ne: null } }).toArray()
    ]);
    return { incidents, sosRequests };
  }
  return {
    incidents: memoryStore.incidents.filter(i => i.assignedVolunteerId),
    sosRequests: memoryStore.resourceRequests.filter(r => r.assignedVolunteerId)
  };
}

function isAvailableVolunteer(volunteer) {
  const availability = String(volunteer.availability || '').toLowerCase();
  return !['unavailable', 'inactive', 'on leave'].some(value => availability.includes(value));
}

function checkVolunteerProximity(target, volunteer) {
  const proximity = isWithinVolunteerRadius(target, volunteer);
  if (!proximity.eligible) {
    const distance = proximity.distanceKm === null ? 'unknown' : `${proximity.distanceKm.toFixed(2)} km`;
    return { error: `Volunteer cannot be assigned: exact coordinates are required and the volunteer is ${distance} away. Assignments are limited to ${VOLUNTEER_ASSIGNMENT_RADIUS_KM} km.` };
  }
  return null;
}

// -------------------------------------------------------------
// AUTOMATED DISPATCH & VOLUNTEER MATCHING ENGINE
// -------------------------------------------------------------

async function autoMatchAndAssignVolunteer(targetType, targetDoc) {
  try {
    const district = normalizeDistrict(targetDoc.district);
    const state = normalizeState(targetDoc.state);
    const category = (targetDoc.category || targetDoc.type || '').toLowerCase();

    if (!district || !state) {
      console.log('AUTO-MATCH SKIP: Missing state or district on target');
      return null;
    }

    const db = getDb();
    let approvedVolunteers = [];
    if (db) {
      approvedVolunteers = await db.collection('users').find({ role: 'volunteer', status: 'approved' }).toArray();
    } else {
      approvedVolunteers = memoryStore.users.filter(u => u.role === 'volunteer' && u.status === 'approved');
    }

    if (!approvedVolunteers.length) return null;

    const { incidents, sosRequests } = await fetchActiveAssignments(db);
    const targetArea = targetDoc.area || targetDoc.address || (typeof targetDoc.location === 'string' ? targetDoc.location : '');

    const ranked = approvedVolunteers
      .filter(vol => isAvailableVolunteer(vol) && matchLocation(vol, { district, state }))
      .map(vol => {
        let score = 0;
        let distanceKm = null;

        if (normalizeDistrict(vol.district) === district) score += 40;
        else score += 20;

        if (localityMatch(targetArea, vol.location)) score += 30;

        const proximity = isWithinVolunteerRadius(targetDoc, vol);
        distanceKm = proximity.distanceKm;
        if (proximity.eligible) score += 35;

        const skills = (vol.skills || []).map(s => s.toLowerCase());
        if (category.includes('flood') || category.includes('rescue') || category.includes('water')) {
          if (skills.some(s => s.includes('boat') || s.includes('rescue') || s.includes('search') || s.includes('flood'))) score += 25;
        } else if (category.includes('medical')) {
          if (skills.some(s => s.includes('medical') || s.includes('first aid') || s.includes('doctor') || s.includes('nursing'))) score += 25;
        } else if (category.includes('fire')) {
          if (skills.some(s => s.includes('fire') || s.includes('rescue'))) score += 25;
        } else if (category.includes('food') || category.includes('shelter')) {
          if (skills.some(s => s.includes('food') || s.includes('shelter') || s.includes('relief'))) score += 25;
        }

        const volId = vol._id ? vol._id.toString() : vol.id;
        const workload = countActiveAssignments(volId, incidents, sosRequests);
        score -= workload * 12;

        return { vol, score, distanceKm };
      })
      .filter(entry => entry.distanceKm !== null && entry.distanceKm <= VOLUNTEER_ASSIGNMENT_RADIUS_KM);

    ranked.sort((a, b) => b.score - a.score || (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));

    const bestMatch = ranked[0]?.vol;
    if (!bestMatch) {
      console.log(`AUTO-MATCH SKIP: No volunteers within ${VOLUNTEER_ASSIGNMENT_RADIUS_KM} km of the target`);
      return null;
    }

    const volunteerId = bestMatch._id ? bestMatch._id.toString() : bestMatch.id;
    const volunteerName = bestMatch.name;
    const volunteerPhone = bestMatch.phone;
    const volunteerSkills = (bestMatch.skills || []).join(', ');

    // Update target document with auto-assigned volunteer details
    if (targetType === 'sos') {
      const col = getCollection('resourceRequests');
      const updates = {
        assignedVolunteerId: volunteerId,
        assignedVolunteerName: volunteerName,
        assignedVolunteerPhone: volunteerPhone,
        assignedVolunteerSkills: volunteerSkills,
        autoAssigned: true,
        status: 'assigned',
        updatedAt: new Date()
      };

      if (col) {
        const { ObjectId } = require('mongodb');
        const queryId = ObjectId.isValid(targetDoc._id) ? new ObjectId(targetDoc._id) : targetDoc._id;
        await col.updateOne({ _id: queryId }, { $set: updates });
      } else {
        Object.assign(targetDoc, updates);
      }
    } else {
      // Incident
      const col = getCollection('disasterReports');
      const updates = {
        assignedVolunteerId: volunteerId,
        assignedVolunteerName: volunteerName,
        assignedVolunteerPhone: volunteerPhone,
        assignedVolunteerSkills: volunteerSkills,
        autoAssigned: true,
        updatedAt: new Date()
      };

      if (col) {
        const { ObjectId } = require('mongodb');
        const queryId = ObjectId.isValid(targetDoc._id) ? new ObjectId(targetDoc._id) : targetDoc._id;
        await col.updateOne({ _id: queryId }, { $set: updates });
      } else {
        Object.assign(targetDoc, updates);
      }
    }

    console.log(`🤖 AUTO-MATCH SUCCESS: Assigned Volunteer ${volunteerName} (${volunteerPhone}) to ${targetType.toUpperCase()} in ${district}, ${state}`);
    return { volunteerId, volunteerName, volunteerPhone, volunteerSkills };
  } catch (err) {
    console.error('autoMatchAndAssignVolunteer error:', err);
    return null;
  }
}

async function autoTriggerDepartmentDispatches(reportDoc) {
  try {
    const category = (reportDoc.category || '').toLowerCase();
    const deptsToDispatch = [];

    if (category.includes('flood') || category.includes('water')) {
      deptsToDispatch.push('NDRF (National Disaster Response Force)', 'Fire & Rescue Service');
    } else if (category.includes('fire')) {
      deptsToDispatch.push('Fire & Rescue Service', 'Police Department');
    } else if (category.includes('medical') || category.includes('hazard')) {
      deptsToDispatch.push('Ambulance & Medical Emergency');
    } else if (category.includes('cyclone') || category.includes('storm')) {
      deptsToDispatch.push('NDRF (National Disaster Response Force)', 'Indian Coast Guard');
    } else {
      deptsToDispatch.push('NDRF (National Disaster Response Force)');
    }

    const col = getCollection('departmentDispatches');

    for (const dept of deptsToDispatch) {
      const dispatchDoc = {
        _id: 'disp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        incidentId: reportDoc._id,
        department: dept,
        officerInCharge: 'Automated Emergency Dispatch System',
        teamSize: reportDoc.severity === 'critical' ? 25 : 12,
        equipment: 'Automated Emergency Rescue Response Unit',
        status: 'Dispatched & Active',
        autoDispatched: true,
        dispatchedAt: new Date()
      };

      if (col) {
        await col.insertOne(dispatchDoc);
      } else {
        memoryStore.dispatches.unshift(dispatchDoc);
      }
    }

    const repCol = getCollection('disasterReports');
    if (repCol) {
      const { ObjectId } = require('mongodb');
      const queryId = ObjectId.isValid(reportDoc._id) ? new ObjectId(reportDoc._id) : reportDoc._id;
      await repCol.updateOne({ _id: queryId }, { $set: { dispatchedDepts: deptsToDispatch } });
    } else {
      reportDoc.dispatchedDepts = deptsToDispatch;
    }

    console.log(`🤖 AUTO-DISPATCH SUCCESS: Dispatched ${deptsToDispatch.join(', ')} for Incident: ${reportDoc.title}`);
  } catch (err) {
    console.error('autoTriggerDepartmentDispatches error:', err);
  }
}


// -------------------------------------------------------------
// 1. ADMIN - OFFICIAL OFFICERS MANAGEMENT (Add & Remove Officers)
// -------------------------------------------------------------

async function listOfficialOfficers(req, res) {
  try {
    const sessionDistrict = (req.session?.role === 'government') ? req.session.district : null;
    const col = getCollection('officialOfficers');

    if (col) {
      const query = sessionDistrict ? buildGeoScopeFilter(sessionDistrict, req.session?.state) : {};
      const officers = await col.find(query).sort({ createdAt: -1 }).toArray();
      return res.json({ officers });
    }

    let officers = memoryStore.officers;
    if (sessionDistrict) {
      officers = filterByGeoScope(officers, sessionDistrict, req.session?.state);
    }
    return res.json({ officers });
  } catch (err) {
    console.error('listOfficialOfficers error:', err);
    res.status(500).json({ error: 'Failed to fetch official officers' });
  }
}

async function addOfficialOfficer(req, res) {
  try {
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Super Admin can add official officers.' });
    }

    const { name, department, designation, phone, district, badgeNo } = req.body;
    if (!name || !department || !phone) {
      return res.status(400).json({ error: 'Name, department, and phone are required.' });
    }

    const officerDoc = {
      _id: 'off_' + Date.now(),
      name,
      department,
      designation: designation || 'Officer in Charge',
      phone,
      district: district || 'Kamrup Metropolitan (Guwahati)',
      badgeNo: badgeNo || `GOI-OFF-${Math.floor(1000 + Math.random() * 9000)}`,
      addedBy: req.session.userId,
      createdAt: new Date()
    };

    const col = getCollection('officialOfficers');
    if (col) {
      const resDb = await col.insertOne(officerDoc);
      officerDoc._id = resDb.insertedId;
    } else {
      memoryStore.officers.unshift(officerDoc);
    }

    res.status(201).json({ ok: true, officer: officerDoc, message: `Official officer "${name}" added successfully.` });
  } catch (err) {
    console.error('addOfficialOfficer error:', err);
    res.status(500).json({ error: 'Failed to add official officer' });
  }
}

async function removeOfficialOfficer(req, res) {
  try {
    if (req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Super Admin can remove official officers.' });
    }

    const officerId = req.params.id;
    const col = getCollection('officialOfficers');
    if (col) {
      const { ObjectId } = require('mongodb');
      const queryId = ObjectId.isValid(officerId) ? new ObjectId(officerId) : officerId;
      await col.deleteOne({ _id: queryId });
    } else {
      const idx = memoryStore.officers.findIndex(o => o._id.toString() === officerId.toString());
      if (idx !== -1) {
        memoryStore.officers.splice(idx, 1);
      }
    }

    res.json({ ok: true, message: 'Official officer removed successfully.' });
  } catch (err) {
    console.error('removeOfficialOfficer error:', err);
    res.status(500).json({ error: 'Failed to remove official officer' });
  }
}


// -------------------------------------------------------------
// 2. CITIZEN INCIDENT REPORTING & GOVT STAFF VALIDATION/PUBLISHING
// -------------------------------------------------------------

async function applyReport(req, res) {
  try {
    const { title, category, description, severity, area, district, state, location, contact, lat, lng } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Incident title and description are required.' });
    }
    if (!district || !state) {
      return res.status(400).json({ error: 'State and district are required for accurate assignment.' });
    }

    const geo = resolveGeoInput({ district, state, lat, lng, area, location });
    if (!geo.valid) {
      return res.status(400).json({ error: geo.error });
    }
    if (!geo.location) {
      return res.status(400).json({ error: 'Select the exact incident location on the map.' });
    }

    const reportDoc = {
      _id: 'rep_' + Date.now(),
      title,
      category: category || 'Flood',
      description,
      severity: severity || 'warning',
      area: area || 'Local Area',
      district: geo.district,
      state: geo.state,
      address: geo.address,
      location: geo.location,
      contact: contact || '',
      reporterId: req.session?.userId || null,
      status: 'pending',
      published: false,
      dispatchedDepts: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const col = getCollection('disasterReports');
    if (col) {
      const resDb = await col.insertOne(reportDoc);
      reportDoc._id = resDb.insertedId;
    } else {
      memoryStore.incidents.unshift(reportDoc);
    }

    res.status(201).json({
      ok: true,
      id: reportDoc._id,
      message: 'Incident reported! Submitted for government verification. Volunteers will be auto-assigned after approval.'
    });
  } catch (err) {
    console.error('applyReport error:', err);
    res.status(500).json({ error: 'Failed to submit incident report' });
  }
}

// STRICT DISTRICT FILTERING FOR GOVERNMENT STAFF
async function listReports(req, res) {
  try {
    const sessionDistrict = (req.session?.role === 'government') ? req.session.district : null;
    const col = getCollection('disasterReports');

    if (col) {
      const query = sessionDistrict ? buildGeoScopeFilter(sessionDistrict, req.session?.state) : {};
      const reports = await col.find(query).sort({ createdAt: -1 }).toArray();
      return res.json({ reports, officerDistrict: sessionDistrict });
    }

    let reports = memoryStore.incidents;
    if (sessionDistrict) {
      reports = filterByGeoScope(reports, sessionDistrict, req.session?.state);
    }
    return res.json({ reports, officerDistrict: sessionDistrict });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
}

async function listPublishedIncidents(req, res) {
  try {
    const { district } = req.query;
    const col = getCollection('disasterReports');

    if (col) {
      const query = { published: true, status: 'verified' };
      if (district) Object.assign(query, buildGeoScopeFilter(district));
      const reports = await col.find(query).sort({ createdAt: -1 }).toArray();
      return res.json({ incidents: reports });
    }

    let published = memoryStore.incidents.filter(i => i.published === true && i.status === 'verified');
    if (district) {
      published = filterByGeoScope(published, district);
    }
    return res.json({ incidents: published });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch published incidents' });
  }
}

async function reviewReport(req, res) {
  try {
    if (req.session?.role !== 'government' && req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Government Staff or Admin can validate and publish incidents.' });
    }

    const { status } = req.body;
    const reportId = req.params.id;

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "verified" or "rejected"' });
    }

    let report = null;
    const col = getCollection('disasterReports');

    if (col) {
      const { ObjectId } = require('mongodb');
      const queryId = ObjectId.isValid(reportId) ? new ObjectId(reportId) : reportId;
      report = await col.findOne({ _id: queryId });
      if (!report) return res.status(404).json({ error: 'Incident report not found' });

      if (report.status === status && report.published === (status === 'verified')) {
        return res.json({ ok: true, message: `Incident is already ${status}.` });
      }

      // Ensure Officer has district authority over this incident
      if (req.session?.role === 'government' && req.session?.district) {
        if (!matchLocation(report, { district: req.session.district, state: req.session.state })) {
          return res.status(403).json({ error: `Access denied. You are assigned to ${req.session.district}, ${req.session.state || ''}, but this incident belongs to ${report.district}, ${report.state || ''}.` });
        }
      }

      const isVerified = status === 'verified';
      await col.updateOne(
        { _id: queryId },
        {
          $set: {
            status,
            published: isVerified,
            verifiedBy: req.session.userId,
            verifiedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
    } else {
      report = memoryStore.incidents.find(i => i._id.toString() === reportId.toString());
      if (!report) return res.status(404).json({ error: 'Incident report not found' });

      if (report.status === status && report.published === (status === 'verified')) {
        return res.json({ ok: true, message: `Incident is already ${status}.` });
      }

      // Ensure Officer has district authority over this incident
      if (req.session?.role === 'government' && req.session?.district) {
        if (!matchLocation(report, { district: req.session.district, state: req.session.state })) {
          return res.status(403).json({ error: `Access denied. You are assigned to ${req.session.district}, ${req.session.state || ''}, but this incident belongs to ${report.district}, ${report.state || ''}.` });
        }
      }

      report.status = status;
      report.published = (status === 'verified');
      report.verifiedBy = req.session.userId;
      report.verifiedAt = new Date();
      report.updatedAt = new Date();
    }

    // AUTOMATED ENGINE: Auto-trigger official department dispatches + Auto-assign volunteer upon validation
    if (status === 'verified') {
      await autoTriggerDepartmentDispatches(report);
      if (!report.assignedVolunteerId) {
        await autoMatchAndAssignVolunteer('incident', report);
      }

      const messageDoc = {
        _id: 'msg_' + Date.now(),
        title: report.title,
        body: report.description,
        severity: report.severity || 'warning',
        area: report.area || 'Emergency Zone',
        district: report.district || 'Kamrup Metropolitan (Guwahati)',
        active: true,
        sourceReportId: report._id,
        authorId: req.session.userId,
        createdAt: new Date()
      };

      const msgCol = getCollection('messages');
      if (msgCol) {
        await msgCol.insertOne(messageDoc);
      } else {
        memoryStore.messages.unshift(messageDoc);
      }

      await publishMessage(messageDoc);
    }

    res.json({
      ok: true,
      message: status === 'verified'
        ? 'Incident validated, auto-dispatched to official departments & published to portal!'
        : 'Incident report rejected.'
    });
  } catch (err) {
    console.error('reviewReport error:', err);
    res.status(500).json({ error: 'Failed to review report' });
  }
}


// -------------------------------------------------------------
// 3. OFFICIAL DEPARTMENT DISPATCH CONSOLE (Police, Fire, NDRF, etc.)
// -------------------------------------------------------------

async function dispatchDepartment(req, res) {
  try {
    if (req.session?.role !== 'government' && req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Government Officials can dispatch emergency departments.' });
    }

    const { incidentId, department, officerInCharge, teamSize, equipment } = req.body;
    if (!incidentId || !department) {
      return res.status(400).json({ error: 'Incident ID and department are required.' });
    }

    const reportCol = getCollection('disasterReports');
    let report;
    if (reportCol) {
      const { ObjectId } = require('mongodb');
      const queryId = ObjectId.isValid(incidentId) ? new ObjectId(incidentId) : incidentId;
      report = await reportCol.findOne({ _id: queryId });
    } else {
      report = memoryStore.incidents.find(item => item._id.toString() === incidentId.toString());
    }
    if (!report || report.status !== 'verified' || report.published !== true) {
      return res.status(409).json({ error: 'Only verified and published incidents can be dispatched.' });
    }
    if (req.session?.role === 'government' && !matchDistrict(report.district, req.session.district)) {
      return res.status(403).json({ error: 'You can only dispatch incidents within your assigned district.' });
    }

    const dispatchDoc = {
      _id: 'disp_' + Date.now(),
      incidentId,
      department,
      officerInCharge: officerInCharge || 'Department Command Officer',
      teamSize: parseInt(teamSize) || 10,
      equipment: equipment || 'Standard Emergency Rescue Gear',
      status: 'Dispatched & Active',
      dispatchedBy: req.session.userId,
      dispatchedAt: new Date()
    };

    const col = getCollection('departmentDispatches');
    if (col) {
      await col.insertOne(dispatchDoc);
      const repCol = getCollection('disasterReports');
      const { ObjectId } = require('mongodb');
      const queryId = ObjectId.isValid(incidentId) ? new ObjectId(incidentId) : incidentId;
      await repCol.updateOne({ _id: queryId }, { $addToSet: { dispatchedDepts: department } });
    } else {
      memoryStore.dispatches.unshift(dispatchDoc);
      const inc = memoryStore.incidents.find(i => i._id.toString() === incidentId.toString());
      if (inc) {
        if (!inc.dispatchedDepts) inc.dispatchedDepts = [];
        if (!inc.dispatchedDepts.includes(department)) inc.dispatchedDepts.push(department);
      }
    }

    res.status(201).json({
      ok: true,
      dispatch: dispatchDoc,
      message: `Emergency Team from "${department}" dispatched successfully!`
    });
  } catch (err) {
    console.error('dispatchDepartment error:', err);
    res.status(500).json({ error: 'Failed to dispatch official department' });
  }
}

async function listDispatches(req, res) {
  try {
    const col = getCollection('departmentDispatches');
    if (col) {
      const dispatches = await col.find({}).sort({ dispatchedAt: -1 }).toArray();
      return res.json({ dispatches });
    }
    return res.json({ dispatches: memoryStore.dispatches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dispatches' });
  }
}


// -------------------------------------------------------------
// 4. VOLUNTEER MANAGEMENT & TASK ASSIGNMENT (District-Scoped)
// -------------------------------------------------------------

async function listApplications(req, res) {
  try {
    const sessionDistrict = (req.session?.role === 'government') ? req.session.district : null;
    const col = getCollection('volunteerApplications');

    if (col) {
      const query = sessionDistrict ? buildGeoScopeFilter(sessionDistrict, req.session?.state) : {};
      const applications = await col.find(query).sort({ createdAt: -1 }).toArray();
      return res.json({ applications, officerDistrict: sessionDistrict });
    }

    let applications = memoryStore.volunteerApplications;
    if (sessionDistrict) {
      applications = filterByGeoScope(applications, sessionDistrict, req.session?.state);
    }
    return res.json({ applications, officerDistrict: sessionDistrict });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch volunteer applications' });
  }
}

async function reviewApplication(req, res) {
  try {
    if (req.session?.role !== 'government' && req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Government Staff can approve volunteer applications.' });
    }

    const { status } = req.body;
    const appId = req.params.id;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "approved" or "rejected"' });
    }

    const col = getCollection('volunteerApplications');
    if (col) {
      const { ObjectId } = require('mongodb');
      const queryId = ObjectId.isValid(appId) ? new ObjectId(appId) : appId;
      const application = await col.findOne({ _id: queryId });
      if (!application) return res.status(404).json({ error: 'Volunteer application not found' });

      // Ensure Officer has district authority over this volunteer applicant
      if (req.session?.role === 'government' && req.session?.district) {
        if (!matchLocation(application, { district: req.session.district, state: req.session.state })) {
          return res.status(403).json({ error: `Access denied. You are assigned to ${req.session.district}, but this volunteer applicant belongs to ${application.district}, ${application.state || ''}.` });
        }
      }

      await col.updateOne({ _id: queryId }, { $set: { status, reviewedBy: req.session.userId, reviewedAt: new Date() } });
      await userModel.updateUser(application.applicantId, { status, reviewedBy: req.session.userId, reviewedAt: new Date() });
    } else {
      const application = memoryStore.volunteerApplications.find(a => a._id.toString() === appId.toString());
      if (!application) return res.status(404).json({ error: 'Volunteer application not found' });

      // Ensure Officer has district authority over this volunteer applicant
      if (req.session?.role === 'government' && req.session?.district) {
        if (!matchLocation(application, { district: req.session.district, state: req.session.state })) {
          return res.status(403).json({ error: `Access denied. You are assigned to ${req.session.district}, but this volunteer applicant belongs to ${application.district}, ${application.state || ''}.` });
        }
      }

      application.status = status;
      application.reviewedBy = req.session.userId;
      application.reviewedAt = new Date();

      const user = memoryStore.users.find(u => u._id.toString() === application.applicantId.toString());
      if (user) {
        user.status = status;
        user.reviewedBy = req.session.userId;
        user.reviewedAt = new Date();
      }
    }

    res.json({ ok: true, message: `Volunteer application ${status} successfully.` });
  } catch (err) {
    console.error('reviewApplication error:', err);
    res.status(500).json({ error: 'Failed to review volunteer application' });
  }
}

async function assignVolunteer(req, res) {
  try {
    if (req.session?.role !== 'government' && req.session?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Only Government Staff can assign volunteers.' });
    }

    const { targetType, targetId, volunteerId } = req.body;
    if (!targetId || !volunteerId) {
      return res.status(400).json({ error: 'Target ID and volunteer ID are required.' });
    }

    const volunteer = await userModel.findById(volunteerId);
    if (!volunteer || volunteer.role !== 'volunteer' || volunteer.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved volunteer accounts can be assigned.' });
    }
    const volunteerName = volunteer ? volunteer.name : 'Assigned Volunteer';
    const volunteerPhone = volunteer ? volunteer.phone : '';

    if (targetType === 'sos') {
      const col = getCollection('resourceRequests');
      let sosItem;
      if (col) {
        const { ObjectId } = require('mongodb');
        const queryId = ObjectId.isValid(targetId) ? new ObjectId(targetId) : targetId;
        sosItem = await col.findOne({ _id: queryId });
        if (!sosItem) return res.status(404).json({ error: 'SOS request not found.' });
        if (req.session?.role === 'government' && !matchLocation(sosItem, { district: req.session.district, state: req.session.state })) {
          return res.status(403).json({ error: 'You can only assign volunteers to SOS requests within your assigned district and state.' });
        }
        if (!matchLocation(volunteer, { district: sosItem.district, state: sosItem.state })) {
          return res.status(400).json({ error: `Volunteer is in ${volunteer.district}, ${volunteer.state} but SOS is in ${sosItem.district}, ${sosItem.state}.` });
        }
        const proximityError = checkVolunteerProximity(sosItem, volunteer);
        if (proximityError) return res.status(400).json(proximityError);
        await col.updateOne({ _id: queryId }, { $set: { assignedVolunteerId: volunteerId, assignedVolunteerName: volunteerName, assignedVolunteerPhone: volunteerPhone, status: 'assigned', updatedAt: new Date() } });
      } else {
        sosItem = memoryStore.resourceRequests.find(r => r._id.toString() === targetId.toString());
        if (!sosItem) return res.status(404).json({ error: 'SOS request not found.' });
        if (req.session?.role === 'government' && !matchLocation(sosItem, { district: req.session.district, state: req.session.state })) {
          return res.status(403).json({ error: 'You can only assign volunteers to SOS requests within your assigned district and state.' });
        }
        if (!matchLocation(volunteer, { district: sosItem.district, state: sosItem.state })) {
          return res.status(400).json({ error: `Volunteer is in ${volunteer.district}, ${volunteer.state} but SOS is in ${sosItem.district}, ${sosItem.state}.` });
        }
        const proximityError = checkVolunteerProximity(sosItem, volunteer);
        if (proximityError) return res.status(400).json(proximityError);
        sosItem.assignedVolunteerId = volunteerId;
        sosItem.assignedVolunteerName = volunteerName;
        sosItem.assignedVolunteerPhone = volunteerPhone;
        sosItem.status = 'assigned';
        sosItem.updatedAt = new Date();
      }
    } else {
      const col = getCollection('disasterReports');
      let incident;
      if (col) {
        const { ObjectId } = require('mongodb');
        const queryId = ObjectId.isValid(targetId) ? new ObjectId(targetId) : targetId;
        incident = await col.findOne({ _id: queryId });
        if (!incident || incident.status !== 'verified' || incident.published !== true) {
          return res.status(409).json({ error: 'Only verified and published incidents can receive volunteer assignments.' });
        }
        if (req.session?.role === 'government' && !matchLocation(incident, { district: req.session.district, state: req.session.state })) {
          return res.status(403).json({ error: 'You can only assign incidents within your assigned district and state.' });
        }
        if (!matchLocation(volunteer, { district: incident.district, state: incident.state })) {
          return res.status(400).json({ error: `Volunteer is in ${volunteer.district}, ${volunteer.state} but incident is in ${incident.district}, ${incident.state}.` });
        }
        const proximityError = checkVolunteerProximity(incident, volunteer);
        if (proximityError) return res.status(400).json(proximityError);
        await col.updateOne({ _id: queryId }, { $set: { assignedVolunteerId: volunteerId, assignedVolunteerName: volunteerName, assignedVolunteerPhone: volunteerPhone, updatedAt: new Date() } });
      } else {
        const inc = memoryStore.incidents.find(i => i._id.toString() === targetId.toString());
        if (!inc || inc.status !== 'verified' || inc.published !== true) {
          return res.status(409).json({ error: 'Only verified and published incidents can receive volunteer assignments.' });
        }
        if (req.session?.role === 'government' && !matchLocation(inc, { district: req.session.district, state: req.session.state })) {
          return res.status(403).json({ error: 'You can only assign incidents within your assigned district and state.' });
        }
        if (!matchLocation(volunteer, { district: inc.district, state: inc.state })) {
          return res.status(400).json({ error: `Volunteer is in ${volunteer.district}, ${volunteer.state} but incident is in ${inc.district}, ${inc.state}.` });
        }
        const proximityError = checkVolunteerProximity(inc, volunteer);
        if (proximityError) return res.status(400).json(proximityError);
        inc.assignedVolunteerId = volunteerId;
        inc.assignedVolunteerName = volunteerName;
        inc.assignedVolunteerPhone = volunteerPhone;
        inc.updatedAt = new Date();
      }
    }

    res.json({ ok: true, message: `Volunteer "${volunteerName}" assigned to disaster task!` });
  } catch (err) {
    console.error('assignVolunteer error:', err);
    res.status(500).json({ error: 'Failed to assign volunteer' });
  }
}


// -------------------------------------------------------------
// 5. PUBLIC SOS REQUESTS & NEARBY VOLUNTEERS DIRECTORY
// -------------------------------------------------------------

async function createRequest(req, res) {
  try {
    const { type, quantity, location, district, state, details, contact, requesterName, lat, lng } = req.body;
    if (!type || !details || !contact) {
      return res.status(400).json({ error: 'Request type, details, and contact number are required.' });
    }
    if (!district || !state) {
      return res.status(400).json({ error: 'State and district are required for accurate volunteer matching.' });
    }

    const geo = resolveGeoInput({ district, state, lat, lng, location });
    if (!geo.valid) {
      return res.status(400).json({ error: geo.error });
    }
    if (!geo.location) {
      return res.status(400).json({ error: 'Select the exact SOS location on the map.' });
    }

    const reqDoc = {
      _id: 'req_' + Date.now(),
      type,
      quantity: quantity || 'Immediate Assistance Needed',
      location: location || '',
      address: geo.address,
      district: geo.district,
      state: geo.state,
      locationPoint: geo.location,
      details,
      contact,
      requesterName: requesterName || 'Citizen',
      requesterId: req.session?.userId || null,
      status: 'pending',
      assignedVolunteerId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const col = getCollection('resourceRequests');
    if (col) {
      const resDb = await col.insertOne(reqDoc);
      reqDoc._id = resDb.insertedId;
    } else {
      memoryStore.resourceRequests.unshift(reqDoc);
    }

    // AUTOMATED ENGINE: Match nearest volunteer in same district & state
    const matchTarget = { ...reqDoc, location: reqDoc.locationPoint };
    const autoMatch = await autoMatchAndAssignVolunteer('sos', matchTarget);

    res.status(201).json({
      ok: true,
      id: reqDoc._id,
      autoAssignedVolunteer: autoMatch,
      message: autoMatch
        ? `SOS Request submitted! Automatically matched & assigned local volunteer ${autoMatch.volunteerName} (${autoMatch.volunteerPhone}). You can call them directly!`
        : 'SOS Request submitted successfully! Disaster response teams & nearby volunteers have been notified.'
    });
  } catch (err) {
    console.error('createRequest error:', err);
    res.status(500).json({ error: 'Failed to submit SOS request' });
  }
}

async function listRequests(req, res) {
  try {
    const sessionDistrict = (req.session?.role === 'government') ? req.session.district : null;
    const col = getCollection('resourceRequests');

    if (col) {
      let query = {};
      if (req.session?.role === 'volunteer') {
        query = { assignedVolunteerId: req.session.userId };
      } else if (sessionDistrict) {
        query = buildGeoScopeFilter(sessionDistrict, req.session?.state);
      }
      const requests = await col.find(query).sort({ createdAt: -1 }).toArray();
      return res.json({ requests, officerDistrict: sessionDistrict });
    }

    let filterList = memoryStore.resourceRequests;
    if (req.session?.role === 'volunteer') {
      filterList = filterList.filter(r => r.assignedVolunteerId === req.session.userId);
    } else if (sessionDistrict) {
      filterList = filterByGeoScope(filterList, sessionDistrict, req.session?.state);
    }
    return res.json({ requests: filterList, officerDistrict: sessionDistrict });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SOS requests' });
  }
}

async function listNearbyVolunteers(req, res) {
  try {
    const sessionDistrict = (req.session?.role === 'government') ? req.session.district : null;
    const sessionState = (req.session?.role === 'government') ? req.session.state : null;
    const { district, state, skill } = req.query;

    const filterDistrict = district || sessionDistrict;
    const filterState = state || sessionState;

    const col = getCollection('users');
    if (col) {
      const query = { role: 'volunteer', status: 'approved', ...buildGeoScopeFilter(filterDistrict, filterState) };
      let volunteers = await col.find(query).project({ password: 0, passwordHash: 0, idProofNumber: 0 }).toArray();
      if (skill) {
        volunteers = volunteers.filter(v => v.skills && v.skills.some(s => s.toLowerCase().includes(skill.toLowerCase())));
      }
      return res.json({ volunteers, filterDistrict, filterState });
    }

    let volunteers = memoryStore.users.filter(u => u.role === 'volunteer' && u.status === 'approved');
    if (filterDistrict || filterState) {
      volunteers = filterByGeoScope(volunteers, filterDistrict, filterState);
    }
    if (skill) {
      volunteers = volunteers.filter(v => v.skills && v.skills.some(s => s.toLowerCase().includes(skill.toLowerCase())));
    }

    const safeVolunteers = volunteers.map(({ passwordHash, password, idProofNumber, ...rest }) => rest);
    res.json({ volunteers: safeVolunteers, filterDistrict, filterState });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search nearby volunteers' });
  }
}

// Volunteer Task Execution
async function listVolunteerTasks(req, res) {
  try {
    if (req.session?.role !== 'volunteer') {
      return res.status(403).json({ error: 'Access denied. Volunteer view only.' });
    }

    const volunteerId = req.session.userId;
    let assignedIncidents = [];
    let assignedSOS = [];

    const db = getDb();
    if (db) {
      assignedIncidents = await db.collection('disasterReports').find({ assignedVolunteerId: volunteerId }).toArray();
      assignedSOS = await db.collection('resourceRequests').find({ assignedVolunteerId: volunteerId }).toArray();
    } else {
      assignedIncidents = memoryStore.incidents.filter(i => i.assignedVolunteerId === volunteerId);
      assignedSOS = memoryStore.resourceRequests.filter(r => r.assignedVolunteerId === volunteerId);
    }

    res.json({ incidents: assignedIncidents, sosRequests: assignedSOS });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch volunteer tasks' });
  }
}

async function updateVolunteerTaskStatus(req, res) {
  try {
    if (req.session?.role !== 'volunteer') {
      return res.status(403).json({ error: 'Access denied. Volunteer action only.' });
    }

    const { status, type } = req.body;
    const taskId = req.params.id;
    const normalizedStatus = String(status).toLowerCase();
    const allowedStatuses = type === 'sos'
      ? ['assigned', 'en route', 'fulfilled']
      : ['assigned', 'en route', 'fulfilled'];
    if (!allowedStatuses.includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid task status.' });
    }
    const storedStatus = type === 'sos'
      ? normalizedStatus
      : (normalizedStatus === 'en route' ? 'En Route' : normalizedStatus === 'fulfilled' ? 'Fulfilled' : 'assigned');

    if (type === 'sos') {
      const col = getCollection('resourceRequests');
      if (col) {
        const { ObjectId } = require('mongodb');
        const queryId = ObjectId.isValid(taskId) ? new ObjectId(taskId) : taskId;
        await col.updateOne({ _id: queryId, assignedVolunteerId: req.session.userId }, { $set: { status: storedStatus, updatedAt: new Date() } });
      } else {
        const reqItem = memoryStore.resourceRequests.find(r => r._id.toString() === taskId.toString() && r.assignedVolunteerId === req.session.userId);
        if (reqItem) {
          reqItem.status = storedStatus;
          reqItem.updatedAt = new Date();
        }
      }
    } else {
      const col = getCollection('disasterReports');
      if (col) {
        const { ObjectId } = require('mongodb');
        const queryId = ObjectId.isValid(taskId) ? new ObjectId(taskId) : taskId;
        await col.updateOne({ _id: queryId, assignedVolunteerId: req.session.userId }, { $set: { volunteerStatus: status, updatedAt: new Date() } });
      } else {
        const inc = memoryStore.incidents.find(i => i._id.toString() === taskId.toString() && i.assignedVolunteerId === req.session.userId);
        if (inc) {
          inc.volunteerStatus = status;
          inc.updatedAt = new Date();
        }
      }
    }

    res.json({ ok: true, message: `Task status updated to "${status}"!` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task status' });
  }
}

module.exports = {
  listOfficialOfficers,
  addOfficialOfficer,
  removeOfficialOfficer,
  applyReport,
  listReports,
  listPublishedIncidents,
  reviewReport,
  dispatchDepartment,
  listDispatches,
  listApplications,
  reviewApplication,
  assignVolunteer,
  createRequest,
  listRequests,
  listNearbyVolunteers,
  listVolunteerTasks,
  updateVolunteerTaskStatus
};