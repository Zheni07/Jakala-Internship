/** In-memory cache for frequently accessed staging/table metadata. */
const dataCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(userId, type, name) {
  return `${userId}:${type}:${name}`;
}

function getCachedData(userId, type, name) {
  const key = getCacheKey(userId, type, name);
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  dataCache.delete(key);
  return null;
}

function setCachedData(userId, type, name, data) {
  const key = getCacheKey(userId, type, name);
  dataCache.set(key, { data, timestamp: Date.now() });
  if (dataCache.size > 100) {
    const oldestKey = Array.from(dataCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    dataCache.delete(oldestKey);
  }
}

function invalidateCache(userId, type, name) {
  dataCache.delete(getCacheKey(userId, type, name));
}

module.exports = {
  getCachedData,
  setCachedData,
  invalidateCache,
};
