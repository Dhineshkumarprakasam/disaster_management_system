const { connectMongo } = require('./config/mongodb');
const { ObjectId } = require('mongodb');

async function seed() {
  await connectMongo();
  const db = require('./config/mongodb').getDb();

  // ===== Admin =====
  await db.collection('admins').deleteMany({});
  await db.collection('admins').insertOne({
    _id: new ObjectId(),
    username: "admin",
    password: "admin123", // WARNING: Stored as plain text!
    name: "Admin User",
    phone: "+91111222333",
    createdAt: new Date(),
  });

  // ===== Resources =====
  await db.collection('resources').deleteMany({});
  await db.collection('resources').insertMany([
    {
      name: "Government Vellore Medical College Hospital",
      type: "hospital",
      phones: ["0416-1234567"],
      address: "Bagayam, Vellore, Tamil Nadu",
      location: { type: "Point", coordinates: [79.1325, 12.9165] },
      createdAt: new Date()
    },
    {
      name: "Christian Medical College Hospital",
      type: "hospital",
      phones: ["0416-2282000"],
      address: "Ida Scudder Rd, Vellore, Tamil Nadu",
      location: { type: "Point", coordinates: [79.1320, 12.9200] },
      createdAt: new Date()
    },
    {
      name: "Vellore Fire and Rescue Dept",
      type: "rescue",
      phones: ["101", "+91416-2256789"],
      address: "Police Station Rd, Vellore",
      location: { type: "Point", coordinates: [79.1280, 12.9180] },
      createdAt: new Date()
    },
    {
      name: "Vellore City Shelter",
      type: "shelter",
      phones: ["+91416-2300000"],
      address: "Near Anna Park, Vellore",
      location: { type: "Point", coordinates: [79.1295, 12.9150] },
      createdAt: new Date()
    },
    {
      name: "Kalasalingam Rescue & Relief Center",
      type: "rescue",
      phones: ["+91416-2312345"],
      address: "Kalasalingam Nagar, Vellore",
      location: { type: "Point", coordinates: [79.1400, 12.9120] },
      createdAt: new Date()
    }
  ]);

  // ===== Disaster Messages =====
  await db.collection('messages').deleteMany({});
  const admin = await db.collection('admins').findOne({ username: "admin" });
  await db.collection('messages').insertOne({
    title: "Heavy rainfall alert",
    body: "Move to higher ground if living in low areas. Follow local rescue instructions.",
    severity: "warning",
    area: "Vellore city and nearby areas",
    active: true,
    authorId: admin._id,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log("Seeded Vellore district data with admin, resources, and message.");
  process.exit(0);
}

seed();
