const fs = require("fs");
const path = require("path");
const BioValidator = require("../src/core/biovalidator-core");
const axios = require("axios");
const MockAdapter = require("axios-mock-adapter");

/**
 * In this test, we check how Biovalidator behaves when JSON Schemas
 * contain '$async' at the root (true, missing, false) in conjunction
 * with or without a custom keyword. The only scenario that should 
 * fail is when '$async' is explicitly false AND a custom keyword is in use.
 */

describe("asyncCustomKeywords test suite", () => {
  let biovalidator;
  let mockAxios;

  beforeEach(() => {
    // Recreate a brand-new instance for each test. It's required so that we can re-use the same
    // schema (graphRestriction-schema.json) while changing properties inside on the fly.
    // Without cleaning cache, Biovalidator simply reuses the first compiled schema with that $id.
    biovalidator = new BioValidator();
    
    // Setup axios mocking
    mockAxios = new MockAdapter(axios);
    
    // Mock OLS responses for MONDO:0018177 (glioblastoma) that's used in the test
    mockAxios.onGet(/.*\/api\/terms.*obo_id=MONDO:0018177.*/).reply(200, {
      _embedded: {
        terms: [{
          iri: "http://purl.obolibrary.org/obo/MONDO_0018177",
          ontology_name: "mondo",
          label: "glioblastoma",
          is_obsolete: false
        }]
      }
    });

    // Also match for fallback without ontology filter  
    mockAxios.onGet(/.*\/api\/terms.*/).reply((config) => {
      if (config.params?.obo_id === 'MONDO:0018177') {
        return [200, {
          _embedded: {
            terms: [{
              iri: "http://purl.obolibrary.org/obo/MONDO_0018177",
              ontology_name: "mondo", 
              label: "glioblastoma",
              is_obsolete: false
            }]
          }
        }];
      }
      if (config.params?.obo_id === 'MONDO:0000001') {
        return [200, {
          _embedded: {
            terms: [{
              iri: "http://purl.obolibrary.org/obo/MONDO_0000001",
              ontology_name: "mondo", 
              label: "disease",
              is_obsolete: false
            }]
          }
        }];
      }
      if (config.params?.obo_id === 'PATO:0000461') {
        return [200, {
          _embedded: {
            terms: [{
              iri: "http://purl.obolibrary.org/obo/PATO_0000461",
              ontology_name: "pato", 
              label: "normal",
              is_obsolete: false
            }]
          }
        }];
      }
      return [404, { error: "Not found" }];
    });

    // Mock OLS v2 entities endpoint for MONDO:0018177
    mockAxios.onGet(/.*\/api\/v2\/entities\/.*MONDO_0018177.*/).reply(200, {
      iri: "http://purl.obolibrary.org/obo/MONDO_0018177",
      ontologyId: "mondo",
      label: "glioblastoma",
      is_obsolete: false
    });

    // Mock ancestors for MONDO:0018177 - should include MONDO:0000001 (disease)
    mockAxios.onGet(/.*\/api\/ontologies\/mondo\/terms\/.*MONDO_0018177.*\/hierarchicalAncestors.*/).reply(200, {
      _embedded: {
        terms: [
          {
            iri: "http://purl.obolibrary.org/obo/MONDO_0000001",
            label: "disease"
          },
          {
            iri: "http://purl.obolibrary.org/obo/MONDO_0005109", 
            label: "cancer"
          }
        ]
      }
    });

    // Fallback for any unmocked requests
    mockAxios.onAny().reply(config => {
      console.warn(`Unmocked request: ${config.method?.toUpperCase()} ${config.url}`);
      return [404, { error: "Not found" }];
    });
  });

  afterEach(() => {
    mockAxios.restore();
  });

  test("Scenario #1: `$async: true` + custom keyword => valid", () => {
    const schemaPath = path.join(__dirname, "..", "examples", "schemas", "graphRestriction-schema.json");
    const schemaOriginal = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  
    // Ensure `$async` is explicitly true at the root:
    const schema = { ...schemaOriginal, $async: true };
  
    // Load a valid data object that exercises the custom keyword:
    const dataPath = path.join(__dirname, "..", "examples", "objects", "graphRestriction_pass.json");
    const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  
    return biovalidator.validate(schema, data).then(errors => {
      expect(errors).toBeDefined();
      expect(errors.length).toBe(0); // must pass
    });
  });
  
  test("Scenario #2: missing `$async` + custom keyword => valid", () => {
    const schemaPath = path.join(__dirname, "..", "examples", "schemas", "graphRestriction-schema.json");
    const schemaOriginal = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  
    // Remove any `$async` at root if it exists:
    const schema = { ...schemaOriginal };
    delete schema.$async;
  
    const dataPath = path.join(__dirname, "..", "examples", "objects", "graphRestriction_pass.json");
    const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  
    return biovalidator.validate(schema, data).then(errors => {
      expect(errors).toBeDefined();
      expect(errors.length).toBe(0); // must pass after injection
    });
  });
  
  
  test("Scenario #3: `$async: false` + NO custom keyword => valid", () => {
    // We reuse a simple schema that doesn't rely on custom keywords (e.g. test-schema.json).
    const schemaPath = path.join(__dirname, "..", "examples", "schemas", "test-schema.json");
    const schemaOriginal = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  
    // Force `$async` = false
    const schema = { ...schemaOriginal, $async: false };
  
    // Provide some minimal data that meets the schema
    const data = {
      name: "No custom keywords scenario",
      characteristics: {
        species: [
          {
            text: "Homo sapiens" // Enough to satisfy 'nonEmptyString'
          }
        ]
      }
    };
  
    return biovalidator.validate(schema, data).then(errors => {
      expect(errors).toBeDefined();
      expect(errors.length).toBe(0); // must pass
    });
  });
  
  test("Scenario #4: `$async: false` + custom keyword => should fail", () => {
    const schemaPath = path.join(__dirname, "..", "examples", "schemas", "graphRestriction-schema.json");
    const schemaOriginal = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const schema = { ...schemaOriginal, $async: false };
  
    const dataPath = path.join(__dirname, "..", "examples", "objects", "graphRestriction_pass.json");
    const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  
    return biovalidator.validate(schema, data).then(
      // success callback:
      () => {
        // If we get here, that means no compile error occurred, which is unexpected.
        // So forcibly fail:
        fail("Expected compile/validation error ('$async' was 'false' but used AJV's async features), but validation passed unexpectedly.");
      },
      // failure callback:
      (err) => {
        expect(err).toBeDefined();
        expect(err.error).toContain("Failed to compile schema");
      }
    );
  });  
});