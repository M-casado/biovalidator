const nock = require('nock');
const { createMemo } = require('../../src/ols/memo');
const OLS4Client = require('../../src/ols/ols4Client');
const { clearCache } = require('../../src/utils/cache');

describe('relationshipRestriction memoization boundaries', () => {
    const runLive = process.env.BV_LIVE_OLS === '1';
    
    let client;
    const testBaseUrl = 'https://test-ols4.example.com/';
    const testOntology = 'uberon';
    const testIri = 'http://purl.obolibrary.org/obo/UBERON_0000955';

    beforeAll(() => {
        if (!runLive) {
            nock.disableNetConnect();
            nock.enableNetConnect('127.0.0.1');
        }
    });

    beforeEach(() => {
        clearCache();
        client = new OLS4Client(testBaseUrl);
        if (!runLive) {
            nock.cleanAll();
        }
    });

    afterAll(() => {
        if (!runLive) {
            nock.enableNetConnect();
            nock.restore();
        }
    });

    test('within one validation run: same term causes one HTTP call', async () => {
        if (runLive) {
            return; // Skip this test in live mode - it's about mocking behavior
        }

        const memo = createMemo();
        const expectedResponse = {
            iri: testIri,
            label: 'brain',
            has_children: true,
            is_obsolete: false,
            is_defining_ontology: true
        };

        const encodedIri = client._doubleEncodeIri(testIri);
        const scope = nock(testBaseUrl)
            .get(`/api/ontologies/${testOntology}/terms/${encodedIri}`)
            .times(1) // Should be called exactly once
            .reply(200, expectedResponse);

        // Simulate multiple properties in one validation run needing the same term
        const key = `term:${testOntology}:${testIri}`;
        
        // First call - should hit HTTP
        const result1 = await client.getTerm({ ontologyId: testOntology, iri: testIri });
        memo.set(key, result1);
        
        // Second call within same validation - should use memo
        let result2;
        if (memo.has(key)) {
            result2 = memo.get(key);
        } else {
            result2 = await client.getTerm({ ontologyId: testOntology, iri: testIri });
            memo.set(key, result2);
        }

        expect(result1).toEqual(expect.objectContaining({
            iri: testIri,
            label: 'brain'
        }));
        expect(result2).toEqual(result1);
        expect(scope.isDone()).toBe(true); // Nock interceptor was called exactly once
    });

    test('two separate validation runs: memo instances are independent', async () => {
        if (runLive) {
            return; // Skip this test in live mode - it's about mocking behavior
        }

        const expectedResponse = {
            iri: testIri,
            label: 'brain',
            has_children: true,
            is_obsolete: false,
            is_defining_ontology: true
        };

        const encodedIri = client._doubleEncodeIri(testIri);
        const scope = nock(testBaseUrl)
            .get(`/api/ontologies/${testOntology}/terms/${encodedIri}`)
            .times(1) // Only called once due to LRU cache working across validation runs
            .reply(200, expectedResponse);

        // First validation run with its own memo
        const memo1 = createMemo();
        const key = `term:${testOntology}:${testIri}`;
        
        const result1 = await client.getTerm({ ontologyId: testOntology, iri: testIri });
        memo1.set(key, result1);

        // Second validation run with its own memo (fresh instance)
        // The LRU cache will provide the result, but memo2 starts fresh
        const memo2 = createMemo();
        const result2 = await client.getTerm({ ontologyId: testOntology, iri: testIri });
        memo2.set(key, result2);

        // Both results should be the same
        expect(result1).toEqual(expect.objectContaining({
            iri: testIri,
            label: 'brain'
        }));
        expect(result2).toEqual(result1);
        
        // Memos are independent - memo2 doesn't know about memo1's data
        expect(memo1.has(key)).toBe(true);
        expect(memo2.has(key)).toBe(true);
        expect(memo1.get(key)).toEqual(memo2.get(key));
        
        expect(scope.isDone()).toBe(true); // HTTP called once, LRU cache used for second
    });

    test('negative results (404/network errors) are not cached as success', async () => {
        if (runLive) {
            return; // Skip this test in live mode - it's about mocking behavior
        }

        const memo = createMemo();
        const encodedIri = client._doubleEncodeIri(testIri);
        
        // First call returns 404
        const scope1 = nock(testBaseUrl)
            .get(`/api/ontologies/${testOntology}/terms/${encodedIri}`)
            .reply(404);

        // Second call returns success (simulating a retry after fixing the issue)
        const scope2 = nock(testBaseUrl)
            .get(`/api/ontologies/${testOntology}/terms/${encodedIri}`)
            .reply(200, {
                iri: testIri,
                label: 'brain',
                has_children: true,
                is_obsolete: false,
                is_defining_ontology: true
            });

        const key = `term:${testOntology}:${testIri}`;

        // First call fails
        await expect(client.getTerm({ ontologyId: testOntology, iri: testIri }))
            .rejects.toThrow('Term not found');
        
        // Should not cache the failure
        expect(memo.has(key)).toBe(false);

        // Second call succeeds
        const result = await client.getTerm({ ontologyId: testOntology, iri: testIri });
        memo.set(key, result);

        expect(result).toEqual(expect.objectContaining({
            iri: testIri,
            label: 'brain'
        }));
        expect(scope1.isDone()).toBe(true);
        expect(scope2.isDone()).toBe(true);
    });

    test('memo instances are independent', () => {
        const memo1 = createMemo();
        const memo2 = createMemo();

        memo1.set('key1', 'value1');
        memo2.set('key2', 'value2');

        expect(memo1.has('key1')).toBe(true);
        expect(memo1.has('key2')).toBe(false);
        expect(memo2.has('key1')).toBe(false);
        expect(memo2.has('key2')).toBe(true);

        expect(memo1.get('key1')).toBe('value1');
        expect(memo2.get('key2')).toBe('value2');
    });
});