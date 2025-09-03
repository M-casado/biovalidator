const nock = require('nock');
const Ajv = require('ajv').default;
const RelationshipRestriction = require('../../src/keywords/relationshipRestriction');

describe('relationshipRestriction - Options Parsing', () => {
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

        // Clear any existing nocks and add generic mock for all OLS requests
        if (!runLive) {
            nock.cleanAll();
            // Add a generic mock for any OLS4Client request to prevent network calls
            nock('https://www.ebi.ac.uk')
                .persist()
                .get(/\/ols4\/api\/ontologies\/\w+\/terms\/.*/)
                .reply(200, {
                    iri: 'http://purl.obolibrary.org/obo/UBERON_0000062',
                    label: 'organ',
                    ontologyId: 'uberon',
                    has_children: false,
                    is_obsolete: false,
                    is_defining_ontology: true
                });
        }
    });

    afterEach(() => {
        if (!runLive) {
            nock.cleanAll();
        }
    });

    describe('$async requirement', () => {
        test('should throw error when schema lacks $async: true', () => {
            const schema = {
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf']
                }
            };

            expect(() => {
                ajv.compile(schema);
            }).toThrow(/async keyword in sync schema/);
        });

        test('should compile successfully with $async: true', () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf']
                }
            };

            expect(() => {
                ajv.compile(schema);
            }).not.toThrow();
        });
    });

    describe('valid options', () => {
        test('should accept valid minimal options', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf']
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('UBERON:0000062');
            expect(result).toBe('UBERON:0000062');
        });

        test('should accept multiple ontologies', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon', 'cl', 'GO'],
                    targets: ['UBERON:0000955', 'CL:0000000'],
                    relationType: ['rdfs:subClassOf', 'rdf:type']
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('UBERON:0000062');
            expect(result).toBe('UBERON:0000062');
        });

        test('should accept targets mixing CURIEs and IRIs', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: [
                        'UBERON:0000955',
                        'http://purl.obolibrary.org/obo/UBERON_0000955'
                    ],
                    relationType: ['rdfs:subClassOf']
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('UBERON:0000062');
            expect(result).toBe('UBERON:0000062');
        });

        test('should accept all supported relationType tokens', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdf:type', 'rdfs:subClassOf', 'rdfs:subClassOf+', 'rdfs:subClassOf*']
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('UBERON:0000062');
            expect(result).toBe('UBERON:0000062');
        });

        test('should accept optional parameters with defaults', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf'],
                    idFormat: 'CURIE',
                    allowImported: false,
                    allowObsolete: true,
                    leafNode: true
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('UBERON:0000062');
            expect(result).toBe('UBERON:0000062');
        });

        test('should normalize ontologies (lowercase, strip obo: prefix)', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['UBERON', 'obo:CL', 'obo:GO'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf']
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('UBERON:0000062');
            expect(result).toBe('UBERON:0000062');
        });
    });

    describe('invalid options', () => {
        test('should reject non-array ontologies', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: 'uberon',
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf']
                }
            };

            const validate = ajv.compile(schema);
            await expect(validate('UBERON:0000062')).rejects.toMatchObject({
                errors: expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining("'ontologies' must be an array")
                    })
                ])
            });
        });

        test('should reject non-array targets', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: 'UBERON:0000955',
                    relationType: ['rdfs:subClassOf']
                }
            };

            const validate = ajv.compile(schema);
            await expect(validate('UBERON:0000062')).rejects.toMatchObject({
                errors: expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining("'targets' must be an array")
                    })
                ])
            });
        });

        test('should reject unsupported relationType tokens', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf**', 'invalid:relation']
                }
            };

            const validate = ajv.compile(schema);
            await expect(validate('UBERON:0000062')).rejects.toMatchObject({
                errors: expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining('Unsupported relation type')
                    })
                ])
            });
        });

        test('should reject invalid idFormat', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf'],
                    idFormat: 'INVALID_FORMAT'
                }
            };

            const validate = ajv.compile(schema);
            await expect(validate('UBERON:0000062')).rejects.toMatchObject({
                errors: expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining('Invalid idFormat')
                    })
                ])
            });
        });

        test('should reject unknown properties', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf'],
                    unknownProp: 'value'
                }
            };

            const validate = ajv.compile(schema);
            await expect(validate('UBERON:0000062')).rejects.toMatchObject({
                errors: expect.arrayContaining([
                    expect.objectContaining({
                        message: expect.stringContaining('Unknown properties')
                    })
                ])
            });
        });
    });

    describe('legacy flags mapping', () => {
        test('should map directChild:true to rdfs:subClassOf', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdf:type'],
                    directChild: true
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('UBERON:0000062');
            expect(result).toBe('UBERON:0000062');
        });

        test('should map includeSelf:true to * variants', async () => {
            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf+'],
                    includeSelf: true
                }
            };

            const validate = ajv.compile(schema);
            const result = await validate('UBERON:0000062');
            expect(result).toBe('UBERON:0000062');
        });

        test('should emit deprecation warning only once per process for directChild', async () => {
            // Mock logger to capture warnings
            const { logger } = require('../../src/utils/winston');
            const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf'],
                    directChild: true
                }
            };

            const validate = ajv.compile(schema);
            
            // Call multiple times
            await validate('UBERON:0000062');
            await validate('UBERON:0000063');

            // Should only warn once
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('"directChild" option is deprecated')
            );

            warnSpy.mockRestore();
        });

        test('should emit deprecation warning only once per process for includeSelf', async () => {
            // Mock logger to capture warnings
            const { logger } = require('../../src/utils/winston');
            const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

            const schema = {
                $async: true,
                type: 'string',
                relationshipRestriction: {
                    ontologies: ['uberon'],
                    targets: ['UBERON:0000955'],
                    relationType: ['rdfs:subClassOf+'],
                    includeSelf: true
                }
            };

            const validate = ajv.compile(schema);
            
            // Call multiple times
            await validate('UBERON:0000062');
            await validate('UBERON:0000063');

            // Should only warn once
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('"includeSelf" option is deprecated')
            );

            warnSpy.mockRestore();
        });
    });
});