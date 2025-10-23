const { getRedis } = require('../server/config/redis');
const SESSION_COOKIE_NAME = "dm_session";

async function requireAdminAuth(req, res, next) {
  const token = req.cookies[SESSION_COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Auth required" });
  const key = `session:${token}`;
  const data = await getRedis().get(key);
  if (!data) return res.status(401).json({ error: "Session expired" });
  try {
    const session = JSON.parse(data);
    req.session = session;
    req.token = token;
    next();
  } catch (e) {
    res.status(401).json({ error: "Session corrupted" });
  }
}
module.exports = { requireAdminAuth };
