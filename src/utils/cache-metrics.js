function toIsoString(timestamp) {
    return timestamp === null || timestamp === undefined
        ? null
        : new Date(timestamp).toISOString();
}

class CacheMetrics {
    constructor(cache, ttlSeconds) {
        this.cache = cache;
        this.ttlSeconds = ttlSeconds;
        this.lastUpdatedAt = null;
        this.lastClearedAt = null;

        this.cache.on("set", () => {
            this.lastUpdatedAt = Date.now();
        });
        this.cache.on("flush", () => {
            this.lastClearedAt = Date.now();
        });
    }

    /**
     * Describe the current cache and its process-local lifecycle. Update and
     * clear timestamps retain the last observed event even after entries
     * expire. Entry boundaries and next expiration are null for an empty cache.
     *
     * @returns {object} Entry count, configured TTL, and ISO lifecycle times.
     */
    snapshot() {
        const ttlMilliseconds = this.ttlSeconds * 1000;
        const expirations = [];

        for (const key of this.cache.keys()) {
            const expiration = this.cache.getTtl(key);
            if (typeof expiration === "number") {
                expirations.push(expiration);
            }
        }

        const finiteExpirations = expirations.filter((expiration) => expiration > 0);
        const entryTimestamps = finiteExpirations.map((expiration) => expiration - ttlMilliseconds);

        return {
            ttl_seconds: this.ttlSeconds,
            entries: expirations.length,
            last_updated_at: toIsoString(this.lastUpdatedAt),
            last_cleared_at: toIsoString(this.lastClearedAt),
            oldest_entry_at: entryTimestamps.length ? toIsoString(Math.min(...entryTimestamps)) : null,
            newest_entry_at: entryTimestamps.length ? toIsoString(Math.max(...entryTimestamps)) : null,
            next_expiration_at: finiteExpirations.length ? toIsoString(Math.min(...finiteExpirations)) : null
        };
    }
}

function latestTimestamp(snapshots, field) {
    const timestamps = snapshots.map((snapshot) => snapshot[field]).filter(Boolean);
    return timestamps.length ? timestamps.sort().at(-1) : null;
}

function earliestTimestamp(snapshots, field) {
    const timestamps = snapshots.map((snapshot) => snapshot[field]).filter(Boolean);
    return timestamps.length ? timestamps.sort().at(0) : null;
}

/**
 * Combine equivalent cache snapshots. Counts are summed, update/clear/newest
 * times use the latest event, and oldest/next-expiration use the earliest.
 */
function aggregateCacheSnapshots(snapshots, ttlSeconds) {
    return {
        ttl_seconds: ttlSeconds,
        entries: snapshots.reduce((total, snapshot) => total + snapshot.entries, 0),
        last_updated_at: latestTimestamp(snapshots, "last_updated_at"),
        last_cleared_at: latestTimestamp(snapshots, "last_cleared_at"),
        oldest_entry_at: earliestTimestamp(snapshots, "oldest_entry_at"),
        newest_entry_at: latestTimestamp(snapshots, "newest_entry_at"),
        next_expiration_at: earliestTimestamp(snapshots, "next_expiration_at")
    };
}

module.exports = {
    CacheMetrics,
    aggregateCacheSnapshots
};
