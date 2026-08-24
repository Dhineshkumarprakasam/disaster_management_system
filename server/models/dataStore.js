const bcrypt = require('bcryptjs');

// In-Memory Data Store fallback for standalone execution
class MemoryStore {
  constructor() {
    this.admins = [];
    this.users = []; // includes govt staff, volunteers
    this.officers = []; // official officers (police, fire, NDRF, etc.)
    this.incidents = []; // disaster reports
    this.messages = []; // published alerts
    this.resources = []; // shelters, hospitals, relief camps
    this.volunteerApplications = [];
    this.resourceRequests = []; // SOS help requests
    this.dispatches = []; // official department dispatches
    this.ready = this.initSeedData();
  }

  async initSeedData() {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const govtHash = await bcrypt.hash('official123', 10);
    const volHash = await bcrypt.hash('volunteer123', 10);

    // ── Super Admin ──
    this.admins = [
      {
        _id: 'admin_1',
        username: 'admin',
        passwordHash,
        name: 'Director General, SDMA Assam',
        phone: '+91 361 2237219',
        email: 'dg@sdma.assam.gov.in',
        role: 'admin',
        createdAt: new Date('2026-01-01')
      }
    ];

    // ── Government Staff & Approved Volunteers ──
    this.users = [
      {
        _id: 'user_govt_1',
        username: 'official',
        passwordHash: govtHash,
        name: 'Shri Rajesh Baruah (IAS)',
        phone: '+91 98640 11223',
        email: 'rajesh.baruah@kamrup.assam.gov.in',
        department: 'Kamrup District Disaster Management Authority',
        role: 'government',
        status: 'approved',
        district: 'Kamrup',
        state: 'Assam',
        createdAt: new Date('2026-01-10')
      },
      {
        _id: 'user_vol_1',
        username: 'volunteer',
        passwordHash: volHash,
        name: 'Aarav Sharma',
        phone: '+91 91234 56789',
        email: 'aarav.sharma@gmail.com',
        role: 'volunteer',
        status: 'approved',
        skills: ['Medical First Aid', 'Search & Rescue', 'Boat Operations'],
        availability: 'Immediate (24/7)',
        bloodGroup: 'O+',
        idProofType: 'Aadhaar',
        idProofNumber: 'XXXX-XXXX-4920',
        district: 'Kamrup',
        state: 'Assam',
        location: 'Guwahati, Jalukbari',
        locationPoint: { type: 'Point', coordinates: [91.6980, 26.1600] },
        createdAt: new Date('2026-02-01')
      },
      {
        _id: 'user_vol_2',
        username: 'priya_rescue',
        passwordHash: volHash,
        name: 'Priya Deka',
        phone: '+91 98111 22334',
        email: 'priya.deka@redcross.in',
        role: 'volunteer',
        status: 'approved',
        skills: ['Emergency Medical Care', 'Counseling & Relief Distribution'],
        availability: 'Weekdays & Evenings',
        bloodGroup: 'B+',
        idProofType: 'Voter ID',
        idProofNumber: 'EL-AS-00347182',
        district: 'Kamrup',
        state: 'Assam',
        location: 'Guwahati, Dispur',
        locationPoint: { type: 'Point', coordinates: [91.7800, 26.1400] },
        createdAt: new Date('2026-02-15')
      },
      {
        _id: 'user_vol_3',
        username: 'bikram_ndrf',
        passwordHash: volHash,
        name: 'Bikram Kalita',
        phone: '+91 94350 77889',
        email: 'bikram.kalita@gmail.com',
        role: 'volunteer',
        status: 'approved',
        skills: ['Drone Surveillance', 'Radio Communication', 'Flood Rescue'],
        availability: 'Immediate',
        bloodGroup: 'A+',
        idProofType: 'Aadhaar',
        idProofNumber: 'XXXX-XXXX-9012',
        district: 'Kamrup',
        state: 'Assam',
        location: 'Guwahati, Paltan Bazar',
        locationPoint: { type: 'Point', coordinates: [91.7500, 26.1800] },
        createdAt: new Date('2026-03-01')
      },
      {
        _id: 'user_vol_4',
        username: 'mrinali_health',
        passwordHash: volHash,
        name: 'Mrinali Borah',
        phone: '+91 97060 55443',
        email: 'mrinali.borah@volunteer.in',
        role: 'volunteer',
        status: 'approved',
        skills: ['Nursing & Patient Care', 'Food Distribution', 'Shelter Management'],
        availability: 'Weekend & Evenings',
        bloodGroup: 'AB+',
        idProofType: 'Aadhaar',
        idProofNumber: 'XXXX-XXXX-5531',
        district: 'Kamrup',
        state: 'Assam',
        location: 'Guwahati, Narengi',
        locationPoint: { type: 'Point', coordinates: [91.8100, 26.2000] },
        createdAt: new Date('2026-03-05')
      }
    ];

    // ── Official Officers (Added by Admin) ──
    this.officers = [
      {
        _id: 'off_1',
        name: 'Inspector Debajit Das',
        department: 'Police Department',
        designation: 'Station House Officer, Jalukbari PS',
        phone: '+91 99887 11223',
        district: 'Kamrup',
        badgeNo: 'POL-AS-8492',
        addedBy: 'admin_1',
        createdAt: new Date('2026-03-01')
      },
      {
        _id: 'off_2',
        name: 'Commandant Ranjit Gogoi',
        department: 'NDRF (National Disaster Response Force)',
        designation: '1st Battalion Commander, Patgaon',
        phone: '+91 94350 11223',
        district: 'Kamrup',
        badgeNo: 'NDRF-BN1-091',
        addedBy: 'admin_1',
        createdAt: new Date('2026-03-02')
      },
      {
        _id: 'off_3',
        name: 'Dr. Barnali Pathak',
        department: 'Ambulance & Medical Emergency (108)',
        designation: 'Chief Medical Coordinator',
        phone: '+91 97654 32109',
        district: 'Kamrup',
        badgeNo: 'MED-108-402',
        addedBy: 'admin_1',
        createdAt: new Date('2026-03-03')
      },
      {
        _id: 'off_4',
        name: 'Chief Officer Hemen Bora',
        department: 'Fire & Rescue Service',
        designation: 'Divisional Fire Officer, Guwahati',
        phone: '+91 98220 54321',
        district: 'Kamrup',
        badgeNo: 'FIRE-DFO-119',
        addedBy: 'admin_1',
        createdAt: new Date('2026-03-04')
      }
    ];

    // ── Published Verified Alerts ──
    this.messages = [
      {
        _id: 'msg_1',
        title: 'Brahmaputra Flood Alert — Danger Level Crossed at Guwahati',
        body: 'Brahmaputra river water level has crossed the danger mark at North Guwahati and Pandu. Low-lying areas in Jalukbari, Lokhra, and Azara are inundated. Emergency relief camps established at Sarusajai Stadium.',
        severity: 'critical',
        area: 'Jalukbari, Lokhra, North Guwahati',
        district: 'Kamrup',
        active: true,
        sourceReportId: 'rep_1',
        createdAt: new Date('2026-08-20T08:30:00Z')
      },
      {
        _id: 'msg_2',
        title: 'Landslide Risk Alert — NH-27 near Sonapur',
        body: 'Heavy overnight rainfall has caused soil saturation on the Guwahati-Shillong road near Sonapur. IMD has issued a warning for further landslides. Motorists advised to use alternate routes.',
        severity: 'warning',
        area: 'Sonapur, Kamrup East',
        district: 'Kamrup',
        active: true,
        sourceReportId: 'rep_2',
        createdAt: new Date('2026-08-22T10:15:00Z')
      }
    ];

    // ── Incident Reports ──
    this.incidents = [
      {
        _id: 'rep_1',
        title: 'Brahmaputra Embankment Breach — Jalukbari Ghat',
        category: 'Flood',
        description: 'Severe embankment breach near Jalukbari Ghat. Over 200 households inundated. Immediate boat evacuation required for approximately 50 elderly and disabled residents.',
        severity: 'critical',
        area: 'Jalukbari, Guwahati',
        district: 'Kamrup',
        state: 'Assam',
        location: { type: 'Point', coordinates: [91.6980, 26.1600] },
        contact: '+91 94351 00000',
        status: 'verified',
        published: true,
        verifiedBy: 'user_govt_1',
        verifiedAt: new Date('2026-08-20T08:00:00Z'),
        assignedVolunteerId: 'user_vol_1',
        assignedVolunteerName: 'Aarav Sharma',
        assignedVolunteerPhone: '+91 91234 56789',
        assignedVolunteerSkills: 'Medical First Aid, Search & Rescue, Boat Operations',
        autoAssigned: true,
        dispatchedDepts: ['NDRF (National Disaster Response Force)', 'Fire & Rescue Service'],
        createdAt: new Date('2026-08-20T07:00:00Z'),
        updatedAt: new Date('2026-08-20T08:10:00Z')
      },
      {
        _id: 'rep_2',
        title: 'NH-27 Landslide Blocking Traffic near Sonapur',
        category: 'Landslide',
        description: 'Rockslide has blocked both lanes of NH-27 near the 8th km of the Guwahati-Shillong road at Sonapur. Approximately 35 vehicles stranded. PWD teams needed for clearing.',
        severity: 'warning',
        area: 'Sonapur, Kamrup East',
        district: 'Kamrup',
        state: 'Assam',
        contact: '+91 97060 22222',
        status: 'verified',
        published: true,
        verifiedBy: 'user_govt_1',
        verifiedAt: new Date('2026-08-22T09:45:00Z'),
        assignedVolunteerId: 'user_vol_3',
        assignedVolunteerName: 'Bikram Kalita',
        assignedVolunteerPhone: '+91 94350 77889',
        autoAssigned: true,
        dispatchedDepts: ['Police Department'],
        createdAt: new Date('2026-08-22T09:00:00Z'),
        updatedAt: new Date('2026-08-22T09:45:00Z')
      },
      {
        _id: 'rep_3',
        title: 'Flash Flood — Beltola, Guwahati Residential Area',
        category: 'Flood',
        description: 'Sudden flash flood in Beltola residential colony after sustained 6-hour rainfall. Ground floor units submerged. Residents moving to upper floors, request immediate evacuation team.',
        severity: 'critical',
        area: 'Beltola, Guwahati',
        district: 'Kamrup',
        state: 'Assam',
        contact: '+91 86386 12345',
        status: 'pending',
        published: false,
        dispatchedDepts: [],
        createdAt: new Date('2026-08-23T06:00:00Z'),
        updatedAt: new Date('2026-08-23T06:00:00Z')
      }
    ];

    // ── Emergency Resources ──
    this.resources = [
      {
        _id: 'res_1',
        name: 'Gauhati Medical College & Hospital (GMCH)',
        type: 'hospital',
        phones: ['0361-2529457', '+91 98640 12345'],
        address: 'Bhangagarh, Guwahati — 781032',
        district: 'Kamrup',
        capacity: 850,
        availableBeds: 120,
        location: { type: 'Point', coordinates: [91.7780, 26.1550] }
      },
      {
        _id: 'res_2',
        name: 'Sarusajai Stadium Emergency Relief Camp',
        type: 'shelter',
        phones: ['0361-2800100', '1078'],
        address: 'Lokhra, Guwahati — 781040',
        district: 'Kamrup',
        capacity: 2000,
        availableBeds: 650,
        location: { type: 'Point', coordinates: [91.7450, 26.1120] }
      },
      {
        _id: 'res_3',
        name: 'NDRF 1st Battalion — Patgaon Base',
        type: 'rescue',
        phones: ['0361-2840001', '1078'],
        address: 'Patgaon, Rani, Kamrup — 781131',
        district: 'Kamrup',
        capacity: 300,
        availableBeds: 200,
        location: { type: 'Point', coordinates: [91.6200, 26.0800] }
      },
      {
        _id: 'res_4',
        name: 'Dispur Government Relief Camp',
        type: 'shelter',
        phones: ['0361-2237219'],
        address: 'Dispur, Guwahati — 781006',
        district: 'Kamrup',
        capacity: 800,
        availableBeds: 320,
        location: { type: 'Point', coordinates: [91.8119, 26.1397] }
      }
    ];

    // ── Volunteer Applications Queue ──
    this.volunteerApplications = [
      {
        _id: 'app_1',
        applicantId: 'user_vol_1',
        name: 'Aarav Sharma',
        phone: '+91 91234 56789',
        email: 'aarav.sharma@gmail.com',
        skills: ['Medical First Aid', 'Search & Rescue', 'Boat Operations'],
        availability: 'Immediate (24/7)',
        bloodGroup: 'O+',
        idProofType: 'Aadhaar',
        idProofNumber: 'XXXX-XXXX-4920',
        district: 'Kamrup',
        state: 'Assam',
        status: 'approved',
        reviewedBy: 'user_govt_1',
        reviewedAt: new Date('2026-02-03'),
        createdAt: new Date('2026-02-01')
      },
      {
        _id: 'app_2',
        applicantId: 'user_vol_2',
        name: 'Priya Deka',
        phone: '+91 98111 22334',
        email: 'priya.deka@redcross.in',
        skills: ['Emergency Medical Care', 'Counseling & Relief Distribution'],
        availability: 'Weekdays & Evenings',
        bloodGroup: 'B+',
        idProofType: 'Voter ID',
        idProofNumber: 'EL-AS-00347182',
        district: 'Kamrup',
        state: 'Assam',
        status: 'approved',
        reviewedBy: 'user_govt_1',
        reviewedAt: new Date('2026-02-17'),
        createdAt: new Date('2026-02-15')
      },
      {
        _id: 'app_3',
        applicantId: 'user_vol_3',
        name: 'Bikram Kalita',
        phone: '+91 94350 77889',
        email: 'bikram.kalita@gmail.com',
        skills: ['Drone Surveillance', 'Radio Communication', 'Flood Rescue'],
        availability: 'Immediate',
        bloodGroup: 'A+',
        idProofType: 'Aadhaar',
        idProofNumber: 'XXXX-XXXX-9012',
        district: 'Kamrup',
        state: 'Assam',
        status: 'approved',
        reviewedBy: 'user_govt_1',
        createdAt: new Date('2026-03-01')
      },
      {
        _id: 'app_4',
        applicantId: 'user_vol_4',
        name: 'Mrinali Borah',
        phone: '+91 97060 55443',
        email: 'mrinali.borah@volunteer.in',
        skills: ['Nursing & Patient Care', 'Food Distribution', 'Shelter Management'],
        availability: 'Weekend & Evenings',
        bloodGroup: 'AB+',
        idProofType: 'Aadhaar',
        idProofNumber: 'XXXX-XXXX-5531',
        district: 'Kamrup',
        state: 'Assam',
        status: 'approved',
        reviewedBy: 'user_govt_1',
        createdAt: new Date('2026-03-05')
      },
      {
        _id: 'app_5',
        applicantId: 'user_pending_1',
        name: 'Rituraj Nath',
        phone: '+91 86010 33221',
        email: 'rituraj.nath@gmail.com',
        skills: ['Logistics & Supply Chain', 'Ham Radio Operator'],
        availability: 'Weekends',
        bloodGroup: 'O-',
        idProofType: 'Driving License',
        idProofNumber: 'AS-01-2024-1122',
        district: 'Kamrup',
        state: 'Assam',
        status: 'pending',
        createdAt: new Date('2026-08-23T04:15:00Z')
      }
    ];

    // ── SOS Citizen Requests ──
    this.resourceRequests = [
      {
        _id: 'req_1',
        type: 'rescue',
        quantity: 'Family of 6',
        location: 'House 42, Jalukbari Flooded Zone, near Jalukbari Bypass',
        district: 'Kamrup',
        details: 'Elderly grandmother on oxygen support trapped on rooftop due to 4-foot water level in ground floor. Urgently need inflatable rescue boat and medical assistance.',
        contact: '+91 98641 55443',
        requesterName: 'Deepak Saikia',
        status: 'assigned',
        assignedVolunteerId: 'user_vol_1',
        assignedVolunteerName: 'Aarav Sharma',
        assignedVolunteerPhone: '+91 91234 56789',
        createdAt: new Date('2026-08-21T09:00:00Z'),
        updatedAt: new Date('2026-08-21T09:05:00Z')
      },
      {
        _id: 'req_2',
        type: 'medical',
        quantity: '10 First Aid Kits & Insulin Supply',
        location: 'Primary School Relief Camp, Jalukbari',
        district: 'Kamrup',
        details: 'Diabetic patients at the relief camp require insulin vials and sterile bandage packs. Camp medical staff overwhelmed.',
        contact: '+91 97061 11223',
        requesterName: 'Meenakshi Hazarika',
        status: 'pending',
        assignedVolunteerId: null,
        createdAt: new Date('2026-08-23T05:30:00Z'),
        updatedAt: new Date('2026-08-23T05:30:00Z')
      }
    ];

    // ── Official Dispatches ──
    this.dispatches = [
      {
        _id: 'disp_1',
        incidentId: 'rep_1',
        department: 'NDRF (National Disaster Response Force)',
        officerInCharge: 'Commandant Ranjit Gogoi',
        teamSize: 25,
        equipment: '4 Inflatable Boats, Life Jackets, Satellite Comms Unit',
        status: 'Dispatched & Active',
        autoDispatched: false,
        dispatchedBy: 'user_govt_1',
        dispatchedAt: new Date('2026-08-20T08:15:00Z')
      },
      {
        _id: 'disp_2',
        incidentId: 'rep_1',
        department: 'Fire & Rescue Service',
        officerInCharge: 'Chief Officer Hemen Bora',
        teamSize: 12,
        equipment: 'High Capacity Dewatering Pumps (3 units)',
        status: 'Dispatched & Active',
        autoDispatched: false,
        dispatchedBy: 'user_govt_1',
        dispatchedAt: new Date('2026-08-20T08:45:00Z')
      }
    ];
  }
}

const memoryStore = new MemoryStore();
module.exports = memoryStore;
