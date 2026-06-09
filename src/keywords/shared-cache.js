const NodeCache = require('node-cache');

// Shared cache for OLS responses used by graphRestriction and related keywords
const olsCache = new NodeCache({stdTTl: 21600, checkperiod: 3600, useClones: false});
// Shared cache for ENA taxonomy responses
const enaTaxonomyCache = new NodeCache({stdTTl: 21600, checkperiod: 3600, useClones: false});
// Shared cache for identifiers.org resolver responses
const identifiersCache = new NodeCache({stdTTl: 21600, checkperiod: 3600, useClones: false});

module.exports = {
    olsCache,
    enaTaxonomyCache,
    identifiersCache
};