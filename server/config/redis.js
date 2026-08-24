const redis = require('redis');

let client = null;
let connected = false;
let sessionMemoryMap = new Map();

async function tryConnectRedis(targetUrl) {
  const c = redis.createClient({
    url: targetUrl,
    socket: { connectTimeout: 1500, reconnectStrategy: false }
  });
  c.on('error', () => {});
  await c.connect();
  return c;
}

async function connectRedis() {
  const urlsToTry = [];
  if (process.env.REDIS_URL) urlsToTry.push(process.env.REDIS_URL);
  urlsToTry.push('redis://redis:6379', 'redis://127.0.0.1:6379');

  for (const url of urlsToTry) {
    try {
      client = await tryConnectRedis(url);
      connected = true;
      console.log(`✅ Connected to Redis successfully (${url}).`);
      return;
    } catch (err) {
      // try next
    }
  }

  console.warn('⚠️ Redis connection unavailable. Using fast session memory cache.');
  connected = false;
}

function getRedis() {
  if (connected && client) {
    return client;
  }
  return {
    async setEx(key, ttl, value) {
      sessionMemoryMap.set(key, { value, expires: Date.now() + ttl * 1000 });
    },
    async get(key) {
      const item = sessionMemoryMap.get(key);
      if (!item) return null;
      if (Date.now() > item.expires) {
        sessionMemoryMap.delete(key);
        return null;
      }
      return item.value;
    },
    async del(key) {
      sessionMemoryMap.delete(key);
    },
    async publish() {},
    duplicate() {
      return {
        async connect() {},
        async subscribe() {}
      };
    }
  };
}

module.exports = { connectRedis, getRedis };
