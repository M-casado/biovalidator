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
    
    // Mock all OLS API calls with comprehensive patterns
    
    // Mock OLS v1 API calls (fetchEntityByCurie)
    mockAxios.onGet(/.*\/ols\/api\/ontologies\/.*\/terms.*obo_id=.*/).reply((config) => {
      console.log(`Mock OLS v1 request: ${config.url}`);
      const oboId = config.params?.obo_id || config.url.match(/obo_id=([^&]+)/)?.[1];
      
      if (oboId === 'MONDO:0018177') {
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
      if (oboId === 'MONDO:0000001') {
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
      if (oboId === 'PATO:0000461') {
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
      
      console.log(`No mock for obo_id: ${oboId}`);
      return [404, { error: "Not found" }];
    });

    // Mock OLS v4 API calls (getAncestors, getParents, getChildren)
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/.*\/terms\/.*\/hierarchicalAncestors.*/).reply((config) => {
      console.log(`Mock OLS v4 ancestors request: ${config.url}`);
      
      // Check if it's for MONDO:0018177 (glioblastoma)
      if (config.url.includes('MONDO') && config.url.includes('0018177')) {
        return [200, {
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
        }];
      }
      
      console.log(`No ancestors mock for URL: ${config.url}`);
      return [200, { _embedded: { terms: [] } }];
    });

    // Mock other OLS v4 endpoints
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/.*\/terms\/.*\/parents.*/).reply((config) => {
      console.log(`Mock OLS v4 parents request: ${config.url}`);
      return [200, { _embedded: { terms: [] } }];
    });

    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/.*\/terms\/.*\/children.*/).reply((config) => {
      console.log(`Mock OLS v4 children request: ${config.url}`);
      return [200, { _embedded: { terms: [] } }];
    });

    // Mock individual term fetches by IRI (OLS v4)
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/.*\/terms\/.*/).reply((config) => {
      console.log(`Mock OLS v4 term request: ${config.url}`);
      
      if (config.url.includes('MONDO') && config.url.includes('0018177')) {
        return [200, {
          iri: "http://purl.obolibrary.org/obo/MONDO_0018177",
          ontology_name: "mondo",
          label: "glioblastoma",
          is_obsolete: false
        }];
      }
      if (config.url.includes('MONDO') && config.url.includes('0000001')) {
        return [200, {
          iri: "http://purl.obolibrary.org/obo/MONDO_0000001",
          ontology_name: "mondo",
          label: "disease",
          is_obsolete: false
        }];
      }
      
      return [404, { error: "Not found" }];
    });

    // Fallback for any unmocked requests - log them for debugging
    mockAxios.onAny().reply(config => {
      console.warn(`UNMOCKED REQUEST: ${config.method?.toUpperCase()} ${config.url}`);
      console.warn(`Params:`, config.params);
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