const { getCache, setLimits, clearCache, size, keyFor, INITIAL_CONFIG } = require('../src/utils/cache');

describe('Cache', () => {
    afterEach(() => {
        clearCache();
        setLimits({ max: INITIAL_CONFIG.max }); // Reset to initial limits
    });

    test('LRU evicts oldest when max exceeded', () => {
        setLimits({ max: 2 });
        const cache = getCache();
        
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        
        expect(cache.has('a')).toBe(false);
        expect(cache.has('b')).toBe(true);
        expect(cache.has('c')).toBe(true);
    });

    test('updateAgeOnGet keeps frequently accessed items', () => {
        setLimits({ max: 2 });
        const cache = getCache();
        
        cache.set('a', 1);
        cache.set('b', 2);
        cache.get('a'); // Touch 'a' to keep it fresh
        cache.set('c', 3);
        
        expect(cache.has('a')).toBe(true);
        expect(cache.has('b')).toBe(false);
        expect(cache.has('c')).toBe(true);
    });

    test('clearCache removes all entries', () => {
        const cache = getCache();
        
        cache.set('a', 1);
        cache.set('b', 2);
        expect(size()).toBe(2);
        
        clearCache();
        expect(size()).toBe(0);
    });

    test('setLimits modifies existing cache instance', () => {
        const cache = getCache();
        cache.set('a', 1);
        cache.set('b', 2);
        
        setLimits({ max: 1 }); // Should keep same instance but reduce max
        expect(cache).toBe(getCache()); // Same instance
        
        // Next write triggers trim to new max
        cache.set('c', 3);
        expect(size()).toBe(1);
        expect(cache.has('c')).toBe(true);
    });

    test('setLimits handles string input', () => {
        setLimits({ max: '2' }); // String number
        const cache = getCache();
        
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        
        expect(size()).toBe(2);
        expect(cache.has('c')).toBe(true);
    });

    test('setLimits ignores invalid input', () => {
        const originalMax = getCache().max;
        
        setLimits({ max: 'invalid' });
        expect(getCache().max).toBe(originalMax);
        
        setLimits({ max: -1 });
        expect(getCache().max).toBe(originalMax);
        
        setLimits({ max: 0 });
        expect(getCache().max).toBe(originalMax);
    });

    test('size() returns current cache size', () => {
        clearCache();
        expect(size()).toBe(0);
        
        const cache = getCache();
        cache.set('a', 1);
        expect(size()).toBe(1);
        
        cache.set('b', 2);
        expect(size()).toBe(2);
        
        cache.delete('a');
        expect(size()).toBe(1);
    });

    test('keyFor creates namespaced cache keys', () => {
        expect(keyFor('https://ols.example.com', 'parse', 'TERM:123'))
            .toBe('https://ols.example.com|parse|TERM:123');
        
        expect(keyFor('https://ols.example.com', 'ancestors', 'TERM:123', 'ont'))
            .toBe('https://ols.example.com|ancestors|TERM:123|ont');
    });
});
