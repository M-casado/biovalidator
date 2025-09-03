const nock = require('nock');
const Ajv = require('ajv').default;
const RelationshipRestriction = require('../../src/keywords/relationshipRestriction');

describe('relationshipRestriction - idFormat Validation', () => {
    let ajv;
    let relationshipRestriction;

    // Set up hermetic testing environment
    const runLive = process.env.BV_LIVE_OLS === '1';
    if (!runLive) {
        beforeAll(() => nock.disableNetConnect());
        afterAll(() => nock.enableNetConnect());
    }

    beforeEach(() => {
        ajv = new Ajv({ allErrors: true });
        relationshipRestriction = new RelationshipRestriction();
        relationshipRestriction.configure(ajv);
        
        // Clear the identifier parser cache to ensure fresh tests
        relationshipRestriction.identifierParser.clearCache();
        
        // Clear any existing nocks
        if (!runLive) {
            nock.cleanAll();
        }
    });

    afterEach(() => {
        if (!runLive) {
            // Clean up all mocks
            nock.cleanAll();
        }
    });

    describe('valid idFormat cases', () => {
        test('should accept idFormat:"ANY" with CURIE input', async () => {
            if (!runLive) {
                // Mock all possible OLS requests with specific responses for each term
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000408')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                                label: 'disease',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000408',
                                is_obsolete: false
                            }]
                        }
                    })
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000001')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                                label: 'experimental factor',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000001',
                                is_obsolete: false
                            }]
                        }
                    });
            }

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['efo'],
                    targets: ['EFO:0000001'],
                    relationType: ['rdfs:subClassOf'],
                    idFormat: 'ANY'
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('EFO:0000408');
            expect(result).toBe('EFO:0000408');
        });

        test('should accept idFormat:"ANY" with IRI input', async () => {
            if (!runLive) {
                // Mock OLS requests with specific responses
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/terms')
                    .query(query => typeof query.iri === 'string' && query.iri.includes('EFO_0000408'))
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                                label: 'disease',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000408',
                                is_obsolete: false
                            }]
                        }
                    })
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000001')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                                label: 'experimental factor',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000001',
                                is_obsolete: false
                            }]
                        }
                    });
            }

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['efo'],
                    targets: ['EFO:0000001'],
                    relationType: ['rdfs:subClassOf'],
                    idFormat: 'ANY'
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('http://www.ebi.ac.uk/efo/EFO_0000408');
            expect(result).toBe('http://www.ebi.ac.uk/efo/EFO_0000408');
        });

        test('should accept idFormat:"CURIE" with CURIE input', async () => {
            if (!runLive) {
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000408')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                                label: 'disease',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000408',
                                is_obsolete: false
                            }]
                        }
                    })
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000001')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                                label: 'experimental factor',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000001',
                                is_obsolete: false
                            }]
                        }
                    });
            }

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['efo'],
                    targets: ['EFO:0000001'],
                    relationType: ['rdfs:subClassOf'],
                    idFormat: 'CURIE'
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('EFO:0000408');
            expect(result).toBe('EFO:0000408');
        });

        test('should accept idFormat:"IRI" with IRI input', async () => {
            if (!runLive) {
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/terms')
                    .query(query => typeof query.iri === 'string' && query.iri.includes('EFO_0000408'))
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                                label: 'disease',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000408',
                                is_obsolete: false
                            }]
                        }
                    })
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000001')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                                label: 'experimental factor',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000001',
                                is_obsolete: false
                            }]
                        }
                    });
            }

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['efo'],
                    targets: ['EFO:0000001'],
                    relationType: ['rdfs:subClassOf'],
                    idFormat: 'IRI'
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('http://www.ebi.ac.uk/efo/EFO_0000408');
            expect(result).toBe('http://www.ebi.ac.uk/efo/EFO_0000408');
        });
    });

    describe('invalid idFormat cases (early failure, no network)', () => {
        test('should fail idFormat:"CURIE" with IRI input without hitting network', async () => {
            // NO NOCK MOCKS - we expect this to fail before any network calls

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['efo'],
                    targets: ['EFO:0000001'],
                    relationType: ['rdfs:subClassOf'],
                    idFormat: 'CURIE'
                }
            };

            const validate = ajv.compile(schema);
            
            await expect(validate('http://www.ebi.ac.uk/efo/EFO_0000408')).rejects.toMatchObject({
                message: expect.stringContaining('Identifier must be in CURIE format')
            });
        });

        test('should fail idFormat:"IRI" with CURIE input without hitting network', async () => {
            // NO NOCK MOCKS - we expect this to fail before any network calls

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['efo'],
                    targets: ['EFO:0000001'],
                    relationType: ['rdfs:subClassOf'],
                    idFormat: 'IRI'
                }
            };

            const validate = ajv.compile(schema);
            
            await expect(validate('EFO:0000408')).rejects.toMatchObject({
                message: expect.stringContaining('Identifier must be an IRI')
            });
        });
    });

    describe('allowObsolete enforcement', () => {
        test('should reject obsolete terms when allowObsolete:false', async () => {
            if (!runLive) {
                // Mock OLS response for obsolete term - return different responses for different IDs
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000408')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                                label: 'obsolete disease',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000408',
                                is_obsolete: true,
                                term_replaced_by: 'EFO:0000999'
                            }]
                        }
                    });
            }

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['efo'],
                    targets: ['EFO:0000001'],
                    relationType: ['rdfs:subClassOf'],
                    allowObsolete: false
                }
            };

            const validate = ajv.compile(schema);
            
            await expect(validate('EFO:0000408')).rejects.toMatchObject({
                message: expect.stringContaining('is obsolete')
            });
        });

        test('should accept obsolete terms when allowObsolete:true', async () => {
            if (!runLive) {
                // Mock OLS response for obsolete term and target
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000408')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                                label: 'obsolete disease',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000408',
                                is_obsolete: true,
                                term_replaced_by: 'EFO:0000999'
                            }]
                        }
                    })
                    .get('/ols4/api/terms')
                    .query(query => query.obo_id === 'EFO:0000001')
                    .reply(200, {
                        _embedded: {
                            terms: [{
                                iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                                label: 'experimental factor',
                                ontology_name: 'efo',
                                short_form: 'EFO_0000001',
                                is_obsolete: false
                            }]
                        }
                    });
            }

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['efo'],
                    targets: ['EFO:0000001'],
                    relationType: ['rdfs:subClassOf'],
                    allowObsolete: true
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('EFO:0000408');
            expect(result).toBe('EFO:0000408');
        });
    });
});