const { createMemo } = require('../../src/ols/memo');

describe('createMemo', () => {
    let memo;
    
    beforeEach(() => {
        memo = createMemo();
    });
    
    describe('basic functionality', () => {
        it('should create a memo with get, set, has methods', () => {
            expect(memo).toHaveProperty('get');
            expect(memo).toHaveProperty('set');
            expect(memo).toHaveProperty('has');
            expect(memo).toHaveProperty('size');
            expect(memo).toHaveProperty('clear');
            expect(typeof memo.get).toBe('function');
            expect(typeof memo.set).toBe('function');
            expect(typeof memo.has).toBe('function');
            expect(typeof memo.size).toBe('function');
            expect(typeof memo.clear).toBe('function');
        });
        
        it('should start empty', () => {
            expect(memo.size()).toBe(0);
            expect(memo.has('any-key')).toBe(false);
            expect(memo.get('any-key')).toBeUndefined();
        });
        
        it('should store and retrieve values', () => {
            const key = 'test-key';
            const value = { data: 'test-value' };
            
            memo.set(key, value);
            
            expect(memo.has(key)).toBe(true);
            expect(memo.get(key)).toBe(value);
            expect(memo.size()).toBe(1);
        });
        
        it('should handle multiple key-value pairs', () => {
            const entries = [
                ['key1', 'value1'],
                ['key2', { complex: 'object' }],
                ['key3', [1, 2, 3]]
            ];
            
            entries.forEach(([key, value]) => {
                memo.set(key, value);
            });
            
            expect(memo.size()).toBe(3);
            
            entries.forEach(([key, value]) => {
                expect(memo.has(key)).toBe(true);
                expect(memo.get(key)).toBe(value);
            });
        });
        
        it('should clear all entries', () => {
            memo.set('key1', 'value1');
            memo.set('key2', 'value2');
            expect(memo.size()).toBe(2);
            
            memo.clear();
            
            expect(memo.size()).toBe(0);
            expect(memo.has('key1')).toBe(false);
            expect(memo.has('key2')).toBe(false);
        });
    });
    
    describe('memoization behavior with fake fetcher', () => {
        let fetchCallCount;
        let fakeFetcher;
        
        beforeEach(() => {
            fetchCallCount = 0;
            fakeFetcher = jest.fn(async (key) => {
                fetchCallCount++;
                // Simulate async operation
                await new Promise(resolve => setTimeout(resolve, 1));
                return `result-for-${key}`;
            });
        });
        
        async function memoizedFetch(key) {
            if (memo.has(key)) {
                return memo.get(key);
            }
            
            const result = await fakeFetcher(key);
            memo.set(key, result);
            return result;
        }
        
        it('should call fetcher only once for same key', async () => {
            const key = 'test-key';
            
            // First call should invoke fetcher
            const result1 = await memoizedFetch(key);
            expect(result1).toBe('result-for-test-key');
            expect(fetchCallCount).toBe(1);
            expect(fakeFetcher).toHaveBeenCalledTimes(1);
            expect(fakeFetcher).toHaveBeenCalledWith(key);
            
            // Second call should use memoized value
            const result2 = await memoizedFetch(key);
            expect(result2).toBe('result-for-test-key');
            expect(fetchCallCount).toBe(1); // Should not increase
            expect(fakeFetcher).toHaveBeenCalledTimes(1); // Should not increase
            
            // Results should be identical
            expect(result1).toBe(result2);
        });
        
        it('should call fetcher separately for different keys', async () => {
            const key1 = 'key-1';
            const key2 = 'key-2';
            
            // First key
            const result1 = await memoizedFetch(key1);
            expect(result1).toBe('result-for-key-1');
            expect(fetchCallCount).toBe(1);
            
            // Second key should trigger new fetch
            const result2 = await memoizedFetch(key2);
            expect(result2).toBe('result-for-key-2');
            expect(fetchCallCount).toBe(2);
            
            // Repeated calls should use memo
            await memoizedFetch(key1);
            await memoizedFetch(key2);
            expect(fetchCallCount).toBe(2); // Should not increase
        });
        
        it('should handle concurrent calls to same key', async () => {
            const key = 'concurrent-key';
            
            // Start multiple concurrent calls before any complete
            const promises = [
                memoizedFetch(key),
                memoizedFetch(key),
                memoizedFetch(key)
            ];
            
            const results = await Promise.all(promises);
            
            // All should have the same result
            expect(results[0]).toBe('result-for-concurrent-key');
            expect(results[1]).toBe('result-for-concurrent-key');
            expect(results[2]).toBe('result-for-concurrent-key');
            
            // But this simple memo doesn't prevent concurrent calls,
            // so fetcher might be called multiple times
            // (this is expected behavior for this simple implementation)
            expect(fetchCallCount).toBeGreaterThanOrEqual(1);
        });
        
        it('should work with complex objects as values', async () => {
            const key = 'complex-key';
            const complexResult = {
                iri: 'http://example.org/term',
                label: 'Test Term',
                has_children: true,
                metadata: { score: 0.95 }
            };
            
            // Create a new fetcher that returns the complex object
            const complexFetcher = jest.fn(async (key) => {
                fetchCallCount++;
                await new Promise(resolve => setTimeout(resolve, 1));
                return complexResult;
            });
            
            async function memoizedComplexFetch(key) {
                if (memo.has(key)) {
                    return memo.get(key);
                }
                
                const result = await complexFetcher(key);
                memo.set(key, result);
                return result;
            }
            
            const result1 = await memoizedComplexFetch(key);
            expect(result1).toEqual(complexResult);
            expect(fetchCallCount).toBe(1);
            
            const result2 = await memoizedComplexFetch(key);
            expect(result2).toEqual(complexResult);
            expect(result2).toBe(result1); // Should be same reference
            expect(fetchCallCount).toBe(1); // Should not increase
        });
    });
    
    describe('isolated memo instances', () => {
        it('should create independent memo instances', () => {
            const memo1 = createMemo();
            const memo2 = createMemo();
            
            memo1.set('shared-key', 'value1');
            memo2.set('shared-key', 'value2');
            
            expect(memo1.get('shared-key')).toBe('value1');
            expect(memo2.get('shared-key')).toBe('value2');
            expect(memo1.size()).toBe(1);
            expect(memo2.size()).toBe(1);
        });
    });
});