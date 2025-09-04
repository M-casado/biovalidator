const nock = require('nock');
const OLS4Client = require('../../src/ols/ols4Client');
const { clearCache } = require('../../src/utils/cache');

describe('OLS4Client', () => {
    let client;
    const testBaseUrl = 'https://test-ols4.example.com/';
    
    const runLive = process.env.BV_LIVE_OLS === '1';
    
    beforeAll(() => {
        if (!runLive) {
            // Disable real HTTP connections, allow localhost if needed for test infrastructure
            nock.disableNetConnect();
            nock.enableNetConnect('127.0.0.1');
        }
    });

    beforeEach(() => {
        // Clear cache before each test
        clearCache();
        client = new OLS4Client(testBaseUrl);
        if (!runLive) {
            // Clear any pending nock interceptors
            nock.cleanAll();
        }
    });

    afterAll(() => {
        if (!runLive) {
            nock.enableNetConnect();
            nock.restore();
        }
    });

    describe('constructor', () => {
        it('should set default base URL', () => {
            const defaultClient = new OLS4Client();
            expect(defaultClient.baseUrl).toBe('https://www.ebi.ac.uk/ols4/');
        });

        it('should normalize base URL with trailing slash', () => {
            const clientNoSlash = new OLS4Client('https://example.com');
            expect(clientNoSlash.baseUrl).toBe('https://example.com/');
        });
    });

    describe('_doubleEncodeIri', () => {
        it('should properly double-encode IRIs', () => {
            const iri = 'http://purl.obolibrary.org/obo/UBERON_0000955';
            const encoded = client._doubleEncodeIri(iri);
            
            // Should contain encoded colons and potentially double-encoded percents
            expect(encoded).toContain('%253A'); // Double-encoded colon
            expect(encoded).toContain('%252F'); // Double-encoded forward slash
        });

        it('should match the explicit double-encoding example', () => {
            const iri = 'http://purl.obolibrary.org/obo/EFO_0000408';
            const encoded = client._doubleEncodeIri(iri);
            
            // Assert the expected double-encoded result from documentation
            expect(encoded).toBe('http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000408');
        });
    });

    describe('getTerm', () => {
        const testOntology = 'uberon';
        const testIri = 'http://purl.obolibrary.org/obo/UBERON_0000955';
        
        it('should successfully retrieve term information', async () => {
            const expectedResponse = {
                iri: testIri,
                label: 'brain',
                has_children: true,
                is_obsolete: false,
                is_defining_ontology: true
            };

            // Mock expects double-encoded IRI in path
            const encodedIri = client._doubleEncodeIri(testIri);
            const scope = nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}`)
                .reply(200, expectedResponse);

            const result = await client.getTerm({ ontologyId: testOntology, iri: testIri });

            expect(result).toEqual({
                iri: testIri,
                label: 'brain',
                ontologyId: testOntology,
                has_children: true,
                is_obsolete: false,
                is_defining_ontology: true
            });
            expect(scope.isDone()).toBe(true);
        });

        it('should handle 404 responses cleanly', async () => {
            const encodedIri = client._doubleEncodeIri(testIri);
            nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}`)
                .reply(404);

            await expect(client.getTerm({ ontologyId: testOntology, iri: testIri }))
                .rejects.toThrow('Term not found');
        });

        it('should handle network errors', async () => {
            const encodedIri = client._doubleEncodeIri(testIri);
            nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}`)
                .replyWithError('Network error');

            await expect(client.getTerm({ ontologyId: testOntology, iri: testIri }))
                .rejects.toThrow('Network error connecting to OLS4');
        });

        it('should use cache on second call', async () => {
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
                .times(1) // Should only be called once
                .reply(200, expectedResponse);

            // First call
            await client.getTerm({ ontologyId: testOntology, iri: testIri });
            
            // Second call should use cache
            const result = await client.getTerm({ ontologyId: testOntology, iri: testIri });

            expect(result.label).toBe('brain');
            expect(scope.isDone()).toBe(true);
        });

        it('should verify IRI encoding in request path', async () => {
            const encodedIri = client._doubleEncodeIri(testIri);
            
            // Explicitly verify the encoded path contains encoded characters
            expect(encodedIri).toContain('%253A'); // Encoded colon
            
            nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}`)
                .reply(200, { iri: testIri });

            await client.getTerm({ ontologyId: testOntology, iri: testIri });
        });
    });

    describe('getParents', () => {
        const testOntology = 'uberon';
        const testIri = 'http://purl.obolibrary.org/obo/UBERON_0000955';
        
        it('should successfully retrieve parent terms', async () => {
            const expectedResponse = {
                _embedded: {
                    terms: [
                        {
                            iri: 'http://purl.obolibrary.org/obo/UBERON_0000007',
                            label: 'pituitary gland',
                            has_children: true,
                            is_obsolete: false
                        }
                    ]
                }
            };

            const encodedIri = client._doubleEncodeIri(testIri);
            const scope = nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}/parents`)
                .reply(200, expectedResponse);

            const result = await client.getParents({ ontologyId: testOntology, iri: testIri });

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                iri: 'http://purl.obolibrary.org/obo/UBERON_0000007',
                label: 'pituitary gland',
                ontologyId: testOntology,
                has_children: true,
                is_obsolete: false
            });
            expect(scope.isDone()).toBe(true);
        });

        it('should handle empty parents response', async () => {
            const encodedIri = client._doubleEncodeIri(testIri);
            nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}/parents`)
                .reply(200, { _embedded: { terms: [] } });

            const result = await client.getParents({ ontologyId: testOntology, iri: testIri });
            expect(result).toEqual([]);
        });

        it('should handle 404 responses', async () => {
            const encodedIri = client._doubleEncodeIri(testIri);
            nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}/parents`)
                .reply(404);

            await expect(client.getParents({ ontologyId: testOntology, iri: testIri }))
                .rejects.toThrow('Term not found for parents lookup');
        });
    });

    describe('getChildren', () => {
        const testOntology = 'uberon';
        const testIri = 'http://purl.obolibrary.org/obo/UBERON_0000955';
        
        it('should successfully retrieve child terms', async () => {
            const expectedResponse = {
                _embedded: {
                    terms: [
                        {
                            iri: 'http://purl.obolibrary.org/obo/UBERON_0000956',
                            label: 'cerebral cortex',
                            has_children: true,
                            is_obsolete: false
                        },
                        {
                            iri: 'http://purl.obolibrary.org/obo/UBERON_0000957',
                            label: 'subcortical brain region',
                            has_children: false,
                            is_obsolete: false
                        }
                    ]
                }
            };

            const encodedIri = client._doubleEncodeIri(testIri);
            const scope = nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}/children`)
                .reply(200, expectedResponse);

            const result = await client.getChildren({ ontologyId: testOntology, iri: testIri });

            expect(result).toHaveLength(2);
            expect(result[0].label).toBe('cerebral cortex');
            expect(result[1].label).toBe('subcortical brain region');
            expect(scope.isDone()).toBe(true);
        });

        it('should handle empty children response', async () => {
            const encodedIri = client._doubleEncodeIri(testIri);
            nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/terms/${encodedIri}/children`)
                .reply(200, { _embedded: { terms: [] } });

            const result = await client.getChildren({ ontologyId: testOntology, iri: testIri });
            expect(result).toEqual([]);
        });
    });

    describe('getTypes', () => {
        const testOntology = 'uberon';
        const testIri = 'http://purl.obolibrary.org/obo/UBERON_0000955';
        
        it('should successfully retrieve type information', async () => {
            const expectedResponse = {
                _embedded: {
                    terms: [
                        {
                            iri: 'http://purl.obolibrary.org/obo/UBERON_0000000',
                            label: 'anatomical entity',
                            has_children: true,
                            is_obsolete: false
                        }
                    ]
                }
            };

            const encodedIri = client._doubleEncodeIri(testIri);
            const scope = nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/individuals/${encodedIri}/types`)
                .reply(200, expectedResponse);

            const result = await client.getTypes({ ontologyId: testOntology, iri: testIri });

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                iri: 'http://purl.obolibrary.org/obo/UBERON_0000000',
                label: 'anatomical entity',
                ontologyId: testOntology,
                has_children: true,
                is_obsolete: false
            });
            expect(scope.isDone()).toBe(true);
        });

        it('should handle 404 for individual not found', async () => {
            const encodedIri = client._doubleEncodeIri(testIri);
            nock(testBaseUrl)
                .get(`/api/ontologies/${testOntology}/individuals/${encodedIri}/types`)
                .reply(404);

            await expect(client.getTypes({ ontologyId: testOntology, iri: testIri }))
                .rejects.toThrow('Individual not found for types lookup');
        });
    });

    describe('encoding behavior verification', () => {
        it('should properly encode special characters in IRIs', () => {
            const complexIri = 'http://example.org/test#some:complex/iri?param=value';
            const encoded = client._doubleEncodeIri(complexIri);
            
            // Verify double encoding occurred
            expect(encoded).toMatch(/%25/); // Should contain double-encoded percent signs
            expect(encoded).toMatch(/%253A/); // Should contain double-encoded colons
        });
    });
});