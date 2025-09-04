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
                // Mock OLS4Client requests - input term EFO:0000408 resolves to IRI
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000408')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                        label: 'disease',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
                    })
                    // Mock target term EFO:0000001 
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000001')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                        label: 'experimental factor',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
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
                // Mock OLS4Client requests - input term is already an IRI
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fwww.ebi.ac.uk%252Fefo%252FEFO_0000408')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                        label: 'disease',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
                    })
                    // Mock target term EFO:0000001 
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000001')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                        label: 'experimental factor',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
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
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000408')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                        label: 'disease',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
                    })
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000001')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                        label: 'experimental factor',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
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
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fwww.ebi.ac.uk%252Fefo%252FEFO_0000408')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                        label: 'disease',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
                    })
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000001')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                        label: 'experimental factor',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
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
            // No nock mocks - should fail early before any HTTP requests
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
                message: expect.stringContaining('must be in CURIE format')
            });
        });

        test('should fail idFormat:"IRI" with CURIE input without hitting network', async () => {
            // No nock mocks - should fail early before any HTTP requests
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
                message: expect.stringContaining('must be an IRI')
            });
        });
    });

    describe('allowObsolete enforcement', () => {
        test('should reject obsolete terms when allowObsolete:false', async () => {
            if (!runLive) {
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000408')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                        label: 'disease',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: true,
                        is_defining_ontology: true
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
                nock('https://www.ebi.ac.uk')
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000408')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000408',
                        label: 'disease',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: true,
                        is_defining_ontology: true
                    })
                    .get('/ols4/api/ontologies/efo/terms/http%253A%252F%252Fpurl.obolibrary.org%252Fobo%252FEFO_0000001')
                    .reply(200, {
                        iri: 'http://www.ebi.ac.uk/efo/EFO_0000001',
                        label: 'experimental factor',
                        ontologyId: 'efo',
                        has_children: false,
                        is_obsolete: false,
                        is_defining_ontology: true
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