const { getRedis } = require('../config/redis');
const CHANNEL = 'disaster_messages';

async function publishMessage(message) {
  await getRedis().publish(CHANNEL, JSON.stringify(message));
}
module.exports = { publishMessage, CHANNEL };
