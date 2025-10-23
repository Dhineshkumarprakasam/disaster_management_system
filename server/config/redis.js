const redis = require('redis');
const url = 'redis://localhost:6380';
const client = redis.createClient({ url });
let connected = false;

async function connectRedis() {
  if (connected) return;
  await client.connect();
  connected = true;
  console.log('Redis connected');
}
function getRedis() {
  if (!connected) throw new Error('Redis not connected');
  return client;
}
module.exports = { connectRedis, getRedis };
