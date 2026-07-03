const DEFAULT_CACHE_TTL_SECONDS = 21600;
const MAX_CACHE_EXPIRATION_TIMESTAMP = 8640000000000000;

function parseCacheTtlSeconds(value) {
    if (value === undefined) {
        return DEFAULT_CACHE_TTL_SECONDS;
    }

    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
        throw new Error(
            "Invalid BIOVALIDATOR_CACHE_TTL_SECONDS: expected a positive whole number of seconds."
        );
    }

    const ttlSeconds = Number(value);
    const expirationTimestamp = Date.now() + (ttlSeconds * 1000);
    if (!Number.isSafeInteger(ttlSeconds) || expirationTimestamp > MAX_CACHE_EXPIRATION_TIMESTAMP) {
        throw new Error(
            "Invalid BIOVALIDATOR_CACHE_TTL_SECONDS: value is too large to represent safely."
        );
    }

    return ttlSeconds;
}

const CACHE_TTL_SECONDS = parseCacheTtlSeconds(process.env.BIOVALIDATOR_CACHE_TTL_SECONDS);
const CACHE_CHECK_PERIOD_SECONDS = Math.min(CACHE_TTL_SECONDS, 3600);

module.exports = {
    DEFAULT_CACHE_TTL_SECONDS,
    CACHE_TTL_SECONDS,
    CACHE_CHECK_PERIOD_SECONDS,
    parseCacheTtlSeconds
};
