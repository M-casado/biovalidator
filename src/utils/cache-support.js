const NodeCache = require("node-cache");
const {
    CACHE_TTL_SECONDS,
    CACHE_CHECK_PERIOD_SECONDS
} = require("./cache-config");

class CacheSupport {
    constructor() {
        this.compiledSchemas = new NodeCache({stdTTL: CACHE_TTL_SECONDS, checkperiod: CACHE_CHECK_PERIOD_SECONDS, useClones: false});
        this.compiledSchemas2020 = new NodeCache({stdTTL: CACHE_TTL_SECONDS, checkperiod: CACHE_CHECK_PERIOD_SECONDS, useClones: false});
        this.referencedSchemas = new NodeCache({stdTTL: CACHE_TTL_SECONDS, checkperiod: CACHE_CHECK_PERIOD_SECONDS, useClones: false});
    }

    getCompiledSchema(id) {

    }

    setCompliedSchema(id, schema) {

    }

    getReferencedSchema(url) {

    }

    setReferencedSchema(url, schema) {

    }
}
