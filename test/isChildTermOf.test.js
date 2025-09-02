const fs = require("fs");
const BioValidator = require('../src/core/biovalidator-core');
const IsChildTermOf = require('../src/keywords/ischildtermof');
const axios = require("axios");
const MockAdapter = require("axios-mock-adapter");

let mockAxios;

beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    
    // Mock OLS v1 API calls (fetchEntityByCurie) 
    mockAxios.onGet(/.*\/ols\/api\/ontologies\/.*\/terms.*obo_id=.*/).reply((config) => {
      let oboId = config.params?.obo_id || config.url.match(/obo_id=([^&]+)/)?.[1];
      
      // Decode URL-encoded parameters
      if (oboId) {
        oboId = decodeURIComponent(oboId);
      }
      
      if (oboId === 'PATO:0000383') {
        return [200, {
          _embedded: {
            terms: [{
              iri: "http://purl.obolibrary.org/obo/PATO_0000383",
              ontology_name: "pato", 
              label: "female",
              is_obsolete: false
            }]
          }
        }];
      }
      if (oboId === 'PATO:0000047') {
        return [200, {
          _embedded: {
            terms: [{
              iri: "http://purl.obolibrary.org/obo/PATO_0000047",
              ontology_name: "pato", 
              label: "sex",
              is_obsolete: false
            }]
          }
        }];
      }
      // UO_0000033 should not be found in PATO ontology (return 404)
      if (oboId === 'UO:0000033') {
        return [404, { error: "Not found" }];
      }
      return [404, { error: "Not found" }];
    });

    // Mock OLS v4 API calls (getAncestors)
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/.*\/terms\/.*\/hierarchicalAncestors.*/).reply((config) => {
      // Mock ancestors for PATO_0000383 (female) - should include PATO_0000047 (sex)
      if (config.url.includes('PATO') && config.url.includes('0000383')) {
        return [200, {
          _embedded: {
            terms: [
              {
                iri: "http://purl.obolibrary.org/obo/PATO_0000047",
                label: "sex"
              }
            ]
          }
        }];
      }
      
      return [200, { _embedded: { terms: [] } }];
    });

    // Mock other OLS v4 endpoints
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/.*\/terms\/.*\/parents.*/).reply(200, { _embedded: { terms: [] } });
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/.*\/terms\/.*\/children.*/).reply(200, { _embedded: { terms: [] } });

    // Mock individual term fetches by IRI (OLS v4)
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/.*\/terms\/.*/).reply(200, {
      iri: "http://example.com/term",
      label: "example term",
      is_obsolete: false
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

test("isChildTermOf", () => {
  let inputSchema = fs.readFileSync("examples/schemas/isChildTerm-schema.json");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/isChildTerm.json");
  let jsonObj = JSON.parse(inputObj);



  const validator = new BioValidator();

  return validator._validate(jsonSchema, jsonObj).then((data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(1);
    expect(data[0].message).toContain('Provided term is not child of');
  });
});
