const { IdentifierParser, EntityType, IdFormat } = require('../src/utils/idParsing');
const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

describe('IdentifierParser', () => {
    let parser;
    let mockAxios;

    beforeEach(() => {
        parser = new IdentifierParser('https://www.ebi.ac.uk/ols4/');
        mockAxios = new MockAdapter(axios);
        mockAxios.onAny().reply(500); // Default response to catch unhandled requests
    });

    afterEach(async () => {
        mockAxios.restore();
        parser.clearCache(); // Ensure clean cache between tests
        await new Promise(resolve => setTimeout(resolve, 0)); // Let any pending promises resolve
    });

    describe('Input Validation', () => {
        test('should require non-empty term ID', async () => {
            await expect(parser.parseIdentifier('', ['uberon']))
                .rejects.toThrow('Term identifier cannot be empty');
        });

        test('should require at least one ontology', async () => {
            await expect(parser.parseIdentifier('UBERON:0000955', []))
                .rejects.toThrow('At least one ontology must be provided');
            await expect(parser.parseIdentifier('UBERON:0000955', null))
                .rejects.toThrow('At least one ontology must be provided');
        });

        test('should enforce ID format when specified', async () => {
            await expect(parser.parseIdentifier('UBERON:0000955', ['uberon'], { idFormat: IdFormat.IRI }))
                .rejects.toThrow(/Identifier must be an IRI/);
            await expect(parser.parseIdentifier('http://example.org/term', ['uberon'], { idFormat: IdFormat.CURIE }))
                .rejects.toThrow(/Identifier must be in CURIE format/);
        });

        test('should normalize obo: prefix in ontology IDs', async () => {
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [{
                        iri: 'http://purl.obolibrary.org/obo/UBERON_0000955',
                        ontologyId: 'uberon',
                        label: 'brain',
                        is_obsolete: false
                    }]
                }
            });

            const result = await parser.parseIdentifier('UBERON:0000955', ['obo:UBERON']);
            expect(result.ontology).toBe('uberon');
        });
    });

    describe('Format Detection', () => {
        test('should correctly identify IRIs', () => {
            expect(parser.isIri('http://example.org/terms/123')).toBe(true);
            expect(parser.isIri('https://example.org/terms/123')).toBe(true);
            expect(parser.isIri('UBERON:0000955')).toBe(false);
            expect(parser.isIri('UBERON_0000955')).toBe(false);
        });

        test('should correctly identify CURIEs', () => {
            expect(parser.isCurie('UBERON:0000955')).toBe(true);
            expect(parser.isCurie('GO:0005634')).toBe(true);
            expect(parser.isCurie('http://example.org/terms/123')).toBe(false);
            expect(parser.isCurie('UBERON_0000955')).toBe(false);
        });

        test('should correctly identify short forms', () => {
            expect(parser.isShortForm('UBERON_0000955')).toBe(true);
            expect(parser.isShortForm('GO_0005634')).toBe(true);
            expect(parser.isShortForm('UBERON:0000955')).toBe(false);
            expect(parser.isShortForm('http://example.org/terms/123')).toBe(false);
        });
    });

    describe('OLS Response Handling', () => {
        const mockTerm = {
            iri: 'http://purl.obolibrary.org/obo/UBERON_0000955',
            ontologyId: 'uberon',
            ontology_name: 'Uber Anatomy Ontology',
            short_form: 'UBERON_0000955',
            label: 'brain',
            is_obsolete: false,
            type: ['class']
        };

        test('should handle successful embedded response', async () => {
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [mockTerm]
                }
            });

            const result = await parser.parseIdentifier('UBERON:0000955', ['uberon']);
            expect(result.iri).toBe(mockTerm.iri);
            expect(result.ontology).toBe(mockTerm.ontologyId);
            expect(result.shortForm).toBe(mockTerm.short_form);
        });

        test('should handle invalid response without _embedded', async () => {
            mockAxios.onGet().reply(200, {});
            await expect(parser.parseIdentifier('UBERON:0000955', ['uberon']))
                .rejects.toThrow(/Invalid response from OLS API - missing embedded terms/);
        });

        test('should handle 204 No Content', async () => {
            mockAxios.onGet().reply(204);
            await expect(parser.parseIdentifier('UBERON:0000955', ['uberon']))
                .rejects.toThrow(/not found in ontologies/);
        });

        test('should handle empty results array', async () => {
            mockAxios.onGet().reply(200, {
                _embedded: { terms: [] }
            });
            await expect(parser.parseIdentifier('UBERON:0000955', ['uberon']))
                .rejects.toThrow(/not found in ontologies/);
        });

        test('should timeout on slow response', async () => {
            mockAxios.onGet().timeout();
            await expect(parser.parseIdentifier('UBERON:0000955', ['uberon']))
                .rejects.toThrow(/timed out after/);
        });
    });

    describe('Entity Type Detection', () => {
        const baseResponse = {
            _embedded: {
                terms: [{
                    iri: 'http://example.org/term',
                    ontologyId: 'test',
                    label: 'Test Term',
                    is_obsolete: false
                }]
            }
        };

        test('should detect class type', async () => {
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [{
                        ...baseResponse._embedded.terms[0],
                        type: ['class']
                    }]
                }
            });
            const result = await parser.parseIdentifier('TEST:001', ['test']);
            expect(result.type).toBe(EntityType.CLASS);
        });

        test('should detect named individual', async () => {
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [{
                        ...baseResponse._embedded.terms[0],
                        type: ['named individual']
                    }]
                }
            });
            const result = await parser.parseIdentifier('TEST:001', ['test']);
            expect(result.type).toBe(EntityType.INDIVIDUAL);
        });

        test('should detect various property types', async () => {
            const propertyTypes = ['property', 'object property', 'data property', 'annotation property'];
            for (const type of propertyTypes) {
                // Reset handlers each iteration
                mockAxios.reset();
                mockAxios.onGet().reply(200, {
                    _embedded: {
                        terms: [{
                            iri: 'http://example.org/term',
                            ontologyId: 'test',
                            label: 'Test Term',
                            is_obsolete: false,
                            type: [type]
                        }]
                    }
                });

                const result = await parser.parseIdentifier('TEST:001', ['test']);
                expect(result.type).toBe(EntityType.PROPERTY);
            }
        });
    });

    describe('Obsolescence and Caching', () => {
        const obsoleteTerm = {
            iri: 'http://example.org/obsolete',
            ontologyId: 'test',
            label: 'Obsolete Term',
            is_obsolete: true,
            term_replaced_by: 'http://example.org/replacement'
        };

        test('should reject obsolete terms when not allowed', async () => {
            mockAxios.onGet().reply(200, {
                _embedded: { terms: [obsoleteTerm] }
            });

            await expect(parser.parseIdentifier('TEST:001', ['test'], { allowObsolete: false }))
                .rejects.toThrow('is obsolete, replaced by:');
        });

        test('should allow obsolete terms when permitted', async () => {
            mockAxios.onGet().reply(200, {
                _embedded: { terms: [obsoleteTerm] }
            });

            const result = await parser.parseIdentifier('TEST:001', ['test'], { 
                allowObsolete: true
            });

            expect(result.isObsolete).toBe(true);
            expect(result.replacedBy).toBe('http://example.org/replacement');
        });

        test('should handle cached obsolete terms consistently', async () => {
            // First call caches the obsolete term
            mockAxios.onGet().reply(200, {
                _embedded: { terms: [obsoleteTerm] }
            });

            await parser.parseIdentifier('TEST:001', ['test'], { 
                cacheResults: true,
                allowObsolete: true
            });

            // Second call should still respect allowObsolete=false
            await expect(parser.parseIdentifier('TEST:001', ['test'], { 
                cacheResults: true,
                allowObsolete: false
            })).rejects.toThrow('is obsolete');
        });
    });

    describe('Multi-term Resolution', () => {
        test('should prefer exact IRI match for multiple results', async () => {
            const targetIri = 'http://example.org/exact';
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [
                        { iri: 'http://example.org/other', ontologyId: 'test' },
                        { iri: targetIri, ontologyId: 'test' },
                        { iri: 'http://example.org/another', ontologyId: 'test' }
                    ]
                }
            });

            const result = await parser.parseIdentifier(targetIri, ['test']);
            expect(result.iri).toBe(targetIri);
        });

        test('should use first result for CURIE with multiple matches', async () => {
            const matches = [
                { iri: 'http://example.org/first', ontologyId: 'test', label: 'First Match' },
                { iri: 'http://example.org/second', ontologyId: 'test', label: 'Second Match' }
            ];

            mockAxios.onGet().reply(200, {
                _embedded: { terms: matches }
            });

            const result = await parser.parseIdentifier('TEST:123', ['test']);
            expect(result.iri).toBe(matches[0].iri);
            expect(result.label).toBe(matches[0].label);
        });
    });

    describe('Ontology Restrictions', () => {
        test('should reject terms from non-allowed ontologies', async () => {
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [{
                        iri: 'http://purl.obolibrary.org/obo/CL_0000000',
                        ontologyId: 'cl',
                        label: 'Cell',
                        is_obsolete: false,
                        type: ['class']
                    }]
                }
            });

            await expect(parser.parseIdentifier('CL:0000000', ['uberon']))
                .rejects.toThrow(/Term CL:0000000 found in ontology cl but only uberon allowed/);
        });
    });

    describe('Short Form Generation', () => {
        const baseTerm = {
            iri: '',
            ontologyId: 'test',
            label: 'Test Term',
            is_obsolete: false,
            type: ['class']
        };

        test('should handle OBO-style IRIs', async () => {
            const termWithOboIri = {
                ...baseTerm,
                iri: 'http://purl.obolibrary.org/obo/UBERON_0000955',
                ontologyId: 'uberon'
            };
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [termWithOboIri]
                }
            });

            const result = await parser.parseIdentifier('http://purl.obolibrary.org/obo/UBERON_0000955', ['uberon']);
            expect(result.shortForm).toBe('UBERON_0000955');
        });

        test('should handle non-OBO IRIs', async () => {
            const termWithCustomIri = {
                ...baseTerm,
                iri: 'http://example.org/ontology/TEST_123'
            };
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [termWithCustomIri]
                }
            });

            const result = await parser.parseIdentifier('http://example.org/ontology/TEST_123', ['test']);
            expect(result.shortForm).toBe('TEST_123');
        });

        test('should sanitize problematic IRIs', async () => {
            const termWithComplexIri = {
                ...baseTerm,
                iri: 'http://example.org/ontology/Complex Term+With@Special#Chars'
            };
            mockAxios.onGet().reply(200, {
                _embedded: {
                    terms: [termWithComplexIri]
                }
            });

            const result = await parser.parseIdentifier('http://example.org/ontology/Complex Term+With@Special#Chars', ['test']);
            expect(result.shortForm).toMatch(/^[A-Za-z0-9_.-]+$/);
        });
    });
});
