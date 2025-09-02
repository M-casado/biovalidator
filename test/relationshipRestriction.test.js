const fs = require("fs");
const BioValidator = require('../src/core/biovalidator-core');
const RelationshipRestriction = require('../src/keywords/relationshipRestriction');
const AxiosMockAdapter = require("axios-mock-adapter");
const axios = require('axios');

// Mock axios for testing
const mock = new AxiosMockAdapter(axios);

// Mock term data for testing
const mockTermData = {
    _embedded: {
        terms: [{
            iri: "http://purl.obolibrary.org/obo/EFO_0000408",
            ontology_name: "efo",
            ontologyId: "efo",
            short_form: "EFO_0000408",
            label: "disease",
            is_obsolete: false,
            type: ["class"]
        }]
    }
};

const mockAncestorsData = {
    _embedded: {
        terms: [{
            iri: "http://purl.obolibrary.org/obo/EFO_0000001",
            ontology_name: "efo",
            label: "experimental factor"
        }]
    }
};

const mockParentsData = {
    _embedded: {
        terms: [{
            iri: "http://purl.obolibrary.org/obo/EFO_0000001",
            ontology_name: "efo",
            label: "experimental factor"
        }]
    }
};

beforeEach(() => {
    mock.reset();
    
    // Mock term lookup - default non-obsolete
    mock.onGet(/.*\/api\/terms.*/).reply(200, mockTermData);
    
    // Mock ancestors lookup
    mock.onGet(/.*\/hierarchicalAncestors.*/).reply(200, mockAncestorsData);
    
    // Mock parents lookup  
    mock.onGet(/.*\/hierarchicalParents.*/).reply(200, mockParentsData);
    
    // Mock children lookup (empty for leaf node)
    mock.onGet(/.*\/hierarchicalChildren.*/).reply(200, { _embedded: { terms: [] } });
    
    // Catch all other OLS requests to prevent real network calls
    mock.onGet(/.*ols.*/).reply(404, { message: "Not found" });
});

afterEach(() => {
    mock.restore();
});

describe("RelationshipRestriction Keyword", () => {
    
    test("should validate basic subclass relationship", async () => {
        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        "ontologies": ["efo"],
                        "targets": ["http://purl.obolibrary.org/obo/EFO_0000001"],
                        "relationType": ["rdfs:subClassOf*"],
                        "includeSelf": false
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBe(0); // No validation errors
    });

    test("should handle includeSelf option", async () => {
        const schema = {
            "$id": "test-schema", 
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        "ontologies": ["efo"],
                        "targets": ["http://purl.obolibrary.org/obo/EFO_0000408"],
                        "relationType": ["rdfs:subClassOf*"],
                        "includeSelf": true
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBe(0); // Should pass with includeSelf
    });

    test("should enforce idFormat constraints", async () => {
        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object", 
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        "ontologies": ["efo"],
                        "targets": ["http://purl.obolibrary.org/obo/EFO_0000001"],
                        "relationType": ["rdfs:subClassOf*"],
                        "idFormat": "CURIE"
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "http://purl.obolibrary.org/obo/EFO_0000408" // IRI format
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0); // Should fail due to format mismatch
        expect(result[0].errors).toBeDefined();
        expect(result[0].errors[0]).toContain("must be in CURIE format");
    });

    test("should validate direct child relationships", async () => {
        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string", 
                    "relationshipRestriction": {
                        "ontologies": ["efo"],
                        "targets": ["http://purl.obolibrary.org/obo/EFO_0000001"],
                        "relationType": ["rdfs:subClassOf"],
                        "directChild": true
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBe(0); // Should pass as direct child
    });

    test("should check leaf node constraint", async () => {
        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        "ontologies": ["efo"],
                        "targets": ["http://purl.obolibrary.org/obo/EFO_0000001"],
                        "relationType": ["rdfs:subClassOf*"],
                        "leafNode": true
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBe(0); // Should pass as leaf node (mocked with no children)
    });

    test("should reject invalid schema configurations", async () => {
        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        // Missing required fields
                        "ontologies": [],
                        "targets": ["EFO:0000001"]
                        // Missing relationType
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
        // Could fail on either ontologies or relationType - both are required
        const errorMessage = result[0].errors[0];
        expect(errorMessage).toMatch(/(ontologies must be a non-empty array|relationType must be a non-empty array)/);
    });

    test("should handle obsolete terms based on allowObsolete flag", async () => {
        // Mock obsolete term specifically for this test
        const obsoleteTermData = {
            _embedded: {
                terms: [{
                    iri: "http://purl.obolibrary.org/obo/EFO_0000408",
                    ontology_name: "efo",
                    ontologyId: "efo",
                    short_form: "EFO_0000408",
                    label: "obsolete disease",
                    is_obsolete: true,
                    type: ["class"]
                }]
            }
        };
        
        // Override the mock for this specific test
        mock.onGet(/.*\/api\/terms.*/).reply(200, obsoleteTermData);

        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        "ontologies": ["efo"],
                        "targets": ["http://purl.obolibrary.org/obo/EFO_0000001"],
                        "relationType": ["rdfs:subClassOf*"],
                        "allowObsolete": false
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].errors[0]).toContain("obsolete");
    });

    test("should handle multiple ontologies", async () => {
        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        "ontologies": ["efo", "uberon"], // Multiple ontologies
                        "targets": ["http://purl.obolibrary.org/obo/EFO_0000001"],
                        "relationType": ["rdfs:subClassOf*"]
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBe(0); // Should pass if found in any ontology
    });

    test("should handle multiple targets", async () => {
        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        "ontologies": ["efo"],
                        "targets": [
                            "http://purl.obolibrary.org/obo/EFO_0000001",
                            "http://purl.obolibrary.org/obo/EFO_0000002"
                        ], // Multiple targets
                        "relationType": ["rdfs:subClassOf*"]
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBe(0); // Should pass if related to any target
    });

    test("should fail when no relationship found", async () => {
        // Setup specific mocks for this test to ensure no relationship is found
        mock.reset();
        
        // Mock term lookup - return valid term
        mock.onGet(/.*\/api\/terms.*/).reply(200, mockTermData);
        
        // Mock empty ancestors (no relationship)
        mock.onGet(/.*\/hierarchicalAncestors.*/).reply(200, { _embedded: { terms: [] } });
        
        // Mock empty parents 
        mock.onGet(/.*\/hierarchicalParents.*/).reply(200, { _embedded: { terms: [] } });
        
        // Catch all other requests
        mock.onGet(/.*ols.*/).reply(404, { message: "Not found" });

        const schema = {
            "$id": "test-schema",
            "$async": true,
            "type": "object",
            "properties": {
                "ontologyTerm": {
                    "type": "string",
                    "relationshipRestriction": {
                        "ontologies": ["efo"],
                        "targets": ["http://purl.obolibrary.org/obo/EFO_0000099"], // Non-matching target
                        "relationType": ["rdfs:subClassOf*"]
                    }
                }
            }
        };

        const data = {
            "ontologyTerm": "EFO:0000408"
        };

        const validator = new BioValidator();
        const result = await validator.validate(schema, data);
        
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toBeDefined();
        expect(result[0].errors[0]).toContain("does not satisfy relationship");
    });
});

describe("RelationshipRestriction Class", () => {
    
    test("should instantiate with default values", () => {
        const restriction = new RelationshipRestriction();
        expect(restriction.keywordName).toBe("relationshipRestriction");
        expect(restriction.olsBaseUrl).toBe("https://www.ebi.ac.uk/ols4/");
    });

    test("should instantiate with custom values", () => {
        const restriction = new RelationshipRestriction("customKeyword", "https://custom.ols/");
        expect(restriction.keywordName).toBe("customKeyword");
        expect(restriction.olsBaseUrl).toBe("https://custom.ols/");
    });

    test("should be async", () => {
        const restriction = new RelationshipRestriction();
        expect(restriction.isAsync()).toBe(true);
        expect(RelationshipRestriction._isAsync()).toBe(true);
    });
});