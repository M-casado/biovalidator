
const LRUCache = require('lru-cache');

const INITIAL_CONFIG = {
    max: parseInt(process.env.BV_OLS_CACHE_MAX || '5000', 10),
    ttl: 0, // explicitly disable TTL
    updateAgeOnGet: true,
    updateAgeOnHas: true
};

/**
 * @type {import('lru-cache')<string, any>}
 * @private
 */
const cache = new LRUCache(INITIAL_CONFIG);

/**
 * Get the shared LRU cache instance
 * @returns {LRUCache<string, any>} The cache instance
 */
function getCache() { return cache; }

/**
 * Clear all entries from the cache
 */
function clearCache() { cache.clear(); }

/**
 * Update cache limits. Modifies the existing cache instance in place.
 * @param {object} options
 * @param {number|string} [options.max] - Maximum number of items to store
 */
function setLimits({ max } = {}) {
    if (max !== undefined) {
        const m = parseInt(max, 10);
        if (!Number.isNaN(m) && m > 0) {
            cache.max = m;
            // Force eviction of entries until we're within the new limit
            while (cache.size > m) {
                cache.pop();
            }
        }
    }
}

/**
 * Get current cache size (for testing)
 * @returns {number} Number of items in cache
 */
function size() { return cache.size; }

/**
 * Create a namespaced cache key
 * @param {string} host - OLS host URL
 * @param {...string} parts - Additional parts to include in the key
 * @returns {string} Namespaced cache key
 */
function keyFor(host, ...parts) {
    return [host.trim(), ...parts].join('|');
}

// Export initial config for documentation, but don't use it to read current values
module.exports = { 
    getCache,
    clearCache,
    setLimits,
    size,
    keyFor,
    INITIAL_CONFIG: Object.freeze({ ...INITIAL_CONFIG })
};
