const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://ml-verifier:8000';
const REQUEST_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 5000);

async function predictMessage(message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`ML service returned ${response.status}`);
    const result = await response.json();
    if (typeof result.valid !== 'boolean') {
      throw new TypeError('ML service response must contain a boolean "valid" field');
    }
    return result.valid;
  } finally {
    clearTimeout(timeout);
  }
}

async function predictValidity(message) {
  try {
    return await predictMessage(message);
  } catch (error) {
    console.warn(`ML prediction failed: ${error.message}`);
    return false;
  }
}

module.exports = { predictValidity };