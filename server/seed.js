const { connectMongo, getDb } = require('./config/mongodb');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

async function seed() {
  await connectMongo();
  const db = getDb();

  if (!db) {
    console.log("✅ In-Memory Data Store engine active. Initial demo accounts & disaster data loaded automatically.");
    console.log("ℹ️  Testing credentials available in testing.txt file.");
    process.exit(0);
    return;
  }

  // ===== Admin =====
  await db.collection('admins').deleteMany({});
  const adminId = new ObjectId();
  await db.collection('admins').insertOne({
    _id: adminId,
    username: "admin",
    passwordHash: await bcrypt.hash("admin123", 10),
    name: "Director General NDMA",
    phone: "+91 11 2436 3260",
    email: "dg@ndma.gov.in",
    role: "admin",
    createdAt: new Date(),
  });

  // ===== Users (Approved Volunteer) =====
  await db.collection('users').deleteMany({});
  await db.collection('users').insertMany([
    {
      username: "volunteer",
      passwordHash: await bcrypt.hash("volunteer123", 10),
      name: "Aarav Sharma",
      phone: "+91 91234 56789",
      email: "aarav.sharma@gmail.com",
      role: "volunteer",
      status: "approved",
      skills: ["Medical First Aid", "Search & Rescue", "Boat Operations"],
      availability: "Immediate (24/7)",
      bloodGroup: "O+",
      idProofType: "Aadhaar",
      idProofNumber: "XXXX-XXXX-4920",
      district: "Kamrup Metropolitan (Guwahati)",
      state: "Assam",
      locationPoint: { type: "Point", coordinates: [91.6980, 26.1600] },
      createdAt: new Date()
    }
  ]);

  // ===== Resources =====
  await db.collection('resources').deleteMany({});
  await db.collection('resources').insertMany([
    {
      name: "Guwahati Medical College & Hospital (GMCH)",
      type: "hospital",
      phones: ["0361-2529457"],
      address: "Bhangagarh, Guwahati, Assam",
      district: "Kamrup Metropolitan (Guwahati)",
      capacity: 850,
      availableBeds: 120,
      location: { type: "Point", coordinates: [91.7780, 26.1550] },
      createdAt: new Date()
    },
    {
      name: "Sarusajai Stadium Emergency Relief Camp",
      type: "shelter",
      phones: ["0361-2800100"],
      address: "Lokhra, Guwahati, Assam",
      district: "Kamrup Metropolitan (Guwahati)",
      capacity: 1500,
      availableBeds: 450,
      location: { type: "Point", coordinates: [91.7450, 26.1120] },
      createdAt: new Date()
    }
  ]);

  // ===== Disaster Messages & Reports =====
  await db.collection('messages').deleteMany({});
  await db.collection('messages').insertOne({
    title: "Brahmaputra Flood Alert - High Water Levels in Guwahati",
    body: "Brahmaputra river water level crossed danger mark in Kamrup district. Low-lying areas evacuated.",
    severity: "critical",
    area: "Guwahati, Assam",
    district: "Kamrup Metropolitan (Guwahati)",
    active: true,
    authorId: adminId,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  await db.collection('disasterReports').deleteMany({});
  await db.collection('disasterReports').insertOne({
    title: "Brahmaputra Flood Overflow at Jalukbari Ghat",
    description: "Severe embankment breach near Jalukbari. Over 150 households inundated.",
    severity: "critical",
    area: "Jalukbari, Guwahati",
    district: "Kamrup Metropolitan (Guwahati)",
    location: { type: "Point", coordinates: [91.6980, 26.1600] },
    contact: "+91 94351 00000",
    status: "verified",
    published: true,
    createdAt: new Date()
  });

  await db.collection('resourceRequests').deleteMany({});
  await db.collection('volunteerApplications').deleteMany({});
  await db.collection('departmentDispatches').deleteMany({});

  try {
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('disasterReports').createIndex({ status: 1, createdAt: -1 });
  } catch (e) {}

  console.log("✅ Seeded MongoDB database successfully with Super Admin, Volunteers, Resources, and Incidents.");
  process.exit(0);
}

seed();
