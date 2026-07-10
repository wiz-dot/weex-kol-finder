const ALLOWED_PATHS = new Set([
  'search',
  'channels',
  'playlistItems',
  'videos'
]);

const ALLOWED_PARAMS = new Set([
  'part',
  'q',
  'type',
  'order',
  'maxResults',
  'regionCode',
  'relevanceLanguage',
  'pageToken',
  'playlistId',
  'id'
]);

const KEY_ERROR_REASONS = new Set([
  'quotaExceeded',
  'dailyLimitExceeded',
  'keyInvalid',
  'forbidden'
]);

const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_PER_WINDOW = 90;
const rateBuckets = new Map();

let keyIndex = 0;
const keyCooldownUntil = new Map();

function getKeys() {
  return String(process.env.YOUTUBE_API_KEYS || '')
    .split(',')
    .map(key => key.trim())
    .filter(Boolean);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  return bucket.count <= RATE_LIMIT_PER_WINDOW;
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function nextUsableKey(keys) {
  const now = Date.now();
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[keyIndex % keys.length];
    keyIndex += 1;
    if ((keyCooldownUntil.get(key) || 0) <= now) return key;
  }
  return null;
}

function markKeyCoolingDown(key) {
  keyCooldownUntil.set(key, Date.now() + 10 * 60 * 1000);
}

function youtubeErrorReason(data) {
  return data?.error?.errors?.[0]?.reason || data?.error?.status || '';
}

function isKeyError(data) {
  return KEY_ERROR_REASONS.has(youtubeErrorReason(data));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: { message: 'Too many requests. Please wait and retry.' } });
  }

  const path = firstValue(req.query.path);
  if (!ALLOWED_PATHS.has(path)) {
    return res.status(400).json({ error: { message: 'Unsupported YouTube API path' } });
  }

  const keys = getKeys();
  if (!keys.length) {
    return res.status(500).json({ error: { message: 'YOUTUBE_API_KEYS is not configured' } });
  }

  let lastError = null;
  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const key = nextUsableKey(keys);
    if (!key) break;

    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [name, rawValue] of Object.entries(req.query)) {
      if (name === 'path' || name === 'key' || !ALLOWED_PARAMS.has(name)) continue;
      const value = firstValue(rawValue);
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(name, String(value));
      }
    }
    url.searchParams.set('key', key);

    try {
      const ytRes = await fetch(url);
      const data = await ytRes.json();

      if (ytRes.ok) {
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
        return res.status(200).json(data);
      }

      lastError = data;
      if (isKeyError(data)) {
        markKeyCoolingDown(key);
        continue;
      }

      return res.status(ytRes.status).json(data);
    } catch (error) {
      lastError = { error: { message: error.message || 'YouTube proxy request failed' } };
    }
  }

  return res.status(429).json(lastError || {
    error: { message: 'All YouTube API keys are exhausted or cooling down' }
  });
}
