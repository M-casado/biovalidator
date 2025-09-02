const fs = require("fs");
const BioValidator = require('../src/core/biovalidator-core');
const IsChildTermOf = require('../src/keywords/ischildtermof');
const axios = require("axios");
const MockAdapter = require("axios-mock-adapter");

let mockAxios;

beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    
    // Mock PATO_0000383 (female) - should be found and be child of PATO_0000047
    mockAxios.onGet(/.*\/api\/terms.*/).reply((config) => {
      if (config.params?.iri === 'http://purl.obolibrary.org/obo/PATO_0000383') {
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
      // UO_0000033 should not be found in PATO ontology (return 404)
      if (config.params?.iri === 'http://purl.obolibrary.org/obo/UO_0000033') {
        return [404, { error: "Not found" }];
      }
      return [404, { error: "Not found" }];
    });

    // Mock ancestors for PATO_0000383 (female) - should include PATO_0000047 (sex)
    mockAxios.onGet(/.*\/api\/ontologies\/pato\/terms\/.*PATO_0000383.*\/hierarchicalAncestors.*/).reply(200, {
      _embedded: {
        terms: [
          {
            iri: "http://purl.obolibrary.org/obo/PATO_0000047",
            label: "sex"
          }
        ]
      }
    });

    // Fallback for any unmocked requests
    mockAxios.onAny().reply(config => {
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
