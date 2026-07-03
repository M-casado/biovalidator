const NodeCache = require('node-cache');
const {CacheMetrics} = require('../utils/cache-metrics');
const {
    CACHE_TTL_SECONDS,
    CACHE_CHECK_PERIOD_SECONDS
} = require('../utils/cache-config');

// Shared cache for OLS responses used by graphRestriction and related keywords
const olsCache = new NodeCache({stdTTL: CACHE_TTL_SECONDS, checkperiod: CACHE_CHECK_PERIOD_SECONDS, useClones: false});
// Shared cache for ENA taxonomy responses
const enaTaxonomyCache = new NodeCache({stdTTL: CACHE_TTL_SECONDS, checkperiod: CACHE_CHECK_PERIOD_SECONDS, useClones: false});
// Shared cache for identifiers.org resolver responses
const identifiersCache = new NodeCache({stdTTL: CACHE_TTL_SECONDS, checkperiod: CACHE_CHECK_PERIOD_SECONDS, useClones: false});

const cacheMetrics = {
    ols: new CacheMetrics(olsCache, CACHE_TTL_SECONDS),
    ena_taxonomy: new CacheMetrics(enaTaxonomyCache, CACHE_TTL_SECONDS),
    identifiers_org: new CacheMetrics(identifiersCache, CACHE_TTL_SECONDS)
};

/**
 * Summarize current shared response caches by upstream provider. These metrics
 * are process-local and use the lifecycle semantics in utils/cache-metrics.js.
 */
function getApiCacheDetails() {
    const providers = {
        ols: cacheMetrics.ols.snapshot(),
        ena_taxonomy: cacheMetrics.ena_taxonomy.snapshot(),
        identifiers_org: cacheMetrics.identifiers_org.snapshot()
    };
    const entries = {
        total: 0,
        ols: providers.ols.entries,
        ena_taxonomy: providers.ena_taxonomy.entries,
        identifiers_org: providers.identifiers_org.entries
    };
    entries.total = entries.ols + entries.ena_taxonomy + entries.identifiers_org;

    return {entries, providers};
}

function clearApiCaches() {
    olsCache.flushAll();
    enaTaxonomyCache.flushAll();
    identifiersCache.flushAll();
}

module.exports = {
    olsCache,
    enaTaxonomyCache,
    identifiersCache,
    getApiCacheDetails,
    clearApiCaches,
    API_CACHE_TTL_SECONDS: CACHE_TTL_SECONDS
};
