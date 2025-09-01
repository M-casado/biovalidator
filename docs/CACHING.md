# Performance & Cache

BioValidator uses a bounded LRU (Least Recently Used) cache to improve performance when resolving and validating ontology terms. By default, it stores up to 5000 entries, with older entries being evicted when this limit is reached. Entries persist indefinitely and are only evicted when the size limit is reached. TTL is explicitly disabled.

## Environment Variables

You can customize the cache behavior using environment variables:

- `BV_OLS_CACHE_MAX`: Maximum number of entries in the cache (default: 5000)

## Programmatic Control

The cache can be controlled programmatically:

```javascript
const BioValidator = require('biovalidator');

// Configure cache limits
BioValidator.setLimits({
    max: 1000  // Maximum entries
});

// Clear the cache
BioValidator.clearCache();
```

## Cache Behavior

- The cache is shared across all BioValidator instances
- Internal components namespace their cache keys with the OLS host to avoid collisions
- Least recently used entries are automatically evicted when the cache reaches its size limit
- Cache hits update the entry age, keeping frequently accessed items in cache
- The cache is bounded to prevent memory leaks

## Implementation Notes

If you're implementing a component that uses the cache:

```javascript
const { getCache, keyFor } = require('./utils/cache');

// Create a namespaced cache key
const key = keyFor(olsHost, 'myFunction', termId);
const cache = getCache();

if (cache.has(key)) {
    return cache.get(key);
}
```
