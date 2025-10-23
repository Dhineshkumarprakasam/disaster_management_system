const { getRedis } = require('../config/redis');
const { CHANNEL } = require('./redisService');

const clients = [];
let subscribed = false;

async function subscribe() {
  if (subscribed) return;
  const subscriber = getRedis().duplicate();
  await subscriber.connect();
  await subscriber.subscribe(CHANNEL, (msg) => { broadcast(msg); });
  subscribed = true;
}
function broadcast(msg) {
  clients.forEach((res) => {
    res.write(`event: message\ndata: ${msg}\n\n`);
  });
}
async function handleSSE(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();
  clients.push(res);
  const interval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);
  req.on('close', () => {
    clearInterval(interval);
    const idx = clients.indexOf(res);
    if (idx >= 0) clients.splice(idx, 1);
    res.end();
  });
  await subscribe();
}
module.exports = { handleSSE, broadcast };
