const { createClient } = require('@clickhouse/client');
const { randomUUID } = require('crypto');

const database = process.env.CLICKHOUSE_DATABASE || 'ndms';
const INITIALIZATION_MAX_ATTEMPTS = 12;
const INITIALIZATION_RETRY_DELAY_MS = 1000;
const INITIALIZATION_MAX_DELAY_MS = 10000;
const client = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://clickhouse:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database
});

function isTransientConnectionError(error) {
  for (let current = error; current; current = current.cause) {
    if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(current.code)) {
      return true;
    }
    if (/socket hang up|fetch failed/i.test(current.message || '')) {
      return true;
    }
  }
  return false;
}

async function initializeClickHouseOnce() {
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS disaster_events (
        event_id UUID,
        record_id String,
        record_type LowCardinality(String),
        event_type LowCardinality(String),
        event_time DateTime64(3, 'UTC'),
        created_at DateTime64(3, 'UTC'),
        title String,
        description String,
        category LowCardinality(String),
        severity LowCardinality(String),
        area String,
        district LowCardinality(String),
        state LowCardinality(String),
        latitude Nullable(Float64),
        longitude Nullable(Float64),
        status LowCardinality(String),
        published UInt8,
        suspicious UInt8,
        risk_score Nullable(Float64),
        duplicate_count UInt32,
        volunteer_assigned UInt8,
        volunteer_status LowCardinality(String),
        verification_provider String,
        verification_reasons Array(String),
        dispatched_departments Array(String),
        record_data String,
        event_details String
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(event_time)
      ORDER BY (record_type, record_id, event_time, event_id)
    `
  });
  await client.command({
    query: "ALTER TABLE disaster_events ADD COLUMN IF NOT EXISTS event_details String DEFAULT '{}'"
  });
}

async function initializeClickHouse() {
  for (let attempt = 1; attempt <= INITIALIZATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      await initializeClickHouseOnce();
      return;
    } catch (error) {
      if (!isTransientConnectionError(error) || attempt === INITIALIZATION_MAX_ATTEMPTS) {
        throw error;
      }

      const delay = Math.min(
        INITIALIZATION_RETRY_DELAY_MS * (2 ** (attempt - 1)),
        INITIALIZATION_MAX_DELAY_MS
      );
      console.warn(
        `ClickHouse initialization connection failed (attempt ${attempt}/${INITIALIZATION_MAX_ATTEMPTS}); retrying in ${delay}ms.`
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function asDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Incident timestamps must be valid dates');
  }
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

function asString(value) {
  return value === undefined || value === null ? '' : String(value);
}

async function recordDisasterEvent(record, recordType, eventType, eventDetails = {}) {
  if (!['incident', 'sos'].includes(recordType)) {
    throw new TypeError(`Unsupported disaster record type: ${recordType}`);
  }
  const point = recordType === 'sos' ? record.locationPoint : record.location;
  const coordinates = point?.coordinates;
  const longitude = Array.isArray(coordinates) && coordinates[0] !== null
    ? Number(coordinates[0])
    : null;
  const latitude = Array.isArray(coordinates) && coordinates[1] !== null
    ? Number(coordinates[1])
    : null;
  const recordData = { ...record };
  [
    'contact',
    'reporterId',
    'requesterId',
    'requesterName',
    'verifiedBy',
    'reviewedBy',
    'dispatchedBy',
    'assignedVolunteerId',
    'assignedVolunteerName',
    'assignedVolunteerPhone',
    'assignedVolunteerSkills'
  ].forEach(key => delete recordData[key]);
  const isSos = recordType === 'sos';

  try {
    await client.insert({
      table: 'disaster_events',
      values: [{
        event_id: randomUUID(),
        record_id: asString(record._id),
        record_type: recordType,
        event_type: eventType,
        event_time: asDateTime(record.updatedAt || new Date()),
        created_at: asDateTime(record.createdAt),
        title: asString(isSos ? `SOS: ${record.type}` : record.title),
        description: asString(isSos ? record.details : record.description),
        category: asString(isSos ? record.type : record.category),
        severity: asString(isSos ? 'critical' : record.severity),
        area: asString(isSos ? record.location || record.address : record.area),
        district: asString(record.district),
        state: asString(record.state),
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        status: asString(record.status),
        published: record.published ? 1 : 0,
        suspicious: record.suspicious ? 1 : 0,
        risk_score: record.riskScore !== null && record.riskScore !== undefined
          && Number.isFinite(Number(record.riskScore))
          ? Number(record.riskScore)
          : null,
        duplicate_count: Number.isFinite(Number(record.duplicateCount)) ? Number(record.duplicateCount) : 0,
        volunteer_assigned: record.assignedVolunteerId ? 1 : 0,
        volunteer_status: asString(record.volunteerStatus),
        verification_provider: asString(record.verificationProvider),
        verification_reasons: Array.isArray(record.verificationReasons)
          ? record.verificationReasons.map(asString)
          : [],
        dispatched_departments: Array.isArray(record.dispatchedDepts)
          ? record.dispatchedDepts.map(asString)
          : [],
        record_data: JSON.stringify(recordData),
        event_details: JSON.stringify(eventDetails)
      }],
      format: 'JSONEachRow'
    });
  } catch (error) {
    console.error(`Failed to write ${eventType} incident event to ClickHouse`, error);
    const writeError = new Error('Failed to store the incident event in ClickHouse', { cause: error });
    writeError.code = 'CLICKHOUSE_WRITE_FAILED';
    throw writeError;
  }
}

async function queryRows(query) {
  const result = await client.query({ query, format: 'JSONEachRow' });
  return result.json();
}

const latestRecords = `
  SELECT *
  FROM disaster_events
  ORDER BY event_time DESC, event_id DESC
  LIMIT 1 BY record_type, record_id
`;

async function getDisasterDashboard() {
  const [metrics, severity, daily, districts, recent] = await Promise.all([
    queryRows(`
      SELECT
        count() AS total,
        countIf(record_type = 'incident') AS incidents,
        countIf(record_type = 'sos') AS sos_requests,
        countIf(record_type = 'incident' AND status = 'verified') AS verified,
        countIf(status = 'rejected') AS rejected,
        countIf(status = 'pending') AS pending,
        countIf(record_type = 'incident' AND published = 1) AS published
      FROM (${latestRecords})
    `),
    queryRows(`
      SELECT severity, count() AS count
      FROM (${latestRecords})
      GROUP BY severity
      ORDER BY count DESC
      LIMIT 10
    `),
    queryRows(`
      SELECT toDate(created_at) AS date, count() AS count
      FROM (${latestRecords})
      WHERE created_at >= now() - INTERVAL 6 DAY
      GROUP BY date
      ORDER BY date
    `),
    queryRows(`
      SELECT district, state, count() AS count
      FROM (${latestRecords})
      GROUP BY district, state
      ORDER BY count DESC
      LIMIT 10
    `),
    queryRows(`
      SELECT record_type, event_type, record_id, title, category, severity,
             district, state, status, volunteer_status, event_time
      FROM disaster_events
      ORDER BY event_time DESC
      LIMIT 50
    `)
  ]);

  const counts = metrics[0] || {};
  return {
    metrics: Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [key, Number(value)])
    ),
    severity: severity.map(item => ({ ...item, count: Number(item.count) })),
    daily: daily.map(item => ({ ...item, count: Number(item.count) })),
    districts: districts.map(item => ({ ...item, count: Number(item.count) })),
    recent
  };
}

async function closeClickHouse() {
  await client.close();
}

module.exports = {
  closeClickHouse,
  getDisasterDashboard,
  initializeClickHouse,
  recordDisasterEvent
};
