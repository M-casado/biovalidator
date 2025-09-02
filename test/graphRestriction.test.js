const fs = require("fs");
const BioValidator = require('../src/core/biovalidator-core');
const GraphRestriction = require('../src/keywords/graphRestriction');
const axios = require("axios");
const MockAdapter = require("axios-mock-adapter");

let mockAxios;

beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    
    // Mock for MONDO:0018177 (glioblastoma) - should pass
    mockAxios.onGet(/.*\/ols\/api\/ontologies\/.*\/terms.*obo_id=.*/).reply((config) => {
      let oboId = config.params?.obo_id || config.url.match(/obo_id=([^&]+)/)?.[1];
      
      // Decode URL-encoded parameters
      if (oboId) {
        oboId = decodeURIComponent(oboId);
      }
      
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
      if (oboId === 'EFO:0008481') {
        return [200, {
          _embedded: {
            terms: [{
              iri: "http://www.ebi.ac.uk/efo/EFO_0008481",
              ontology_name: "efo", 
              label: "cDNA",
              is_obsolete: false
            }]
          }
        }];
      }
      return [404, { error: "Not found" }];
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

    // Mock ancestors for EFO:0008481 - should NOT include MONDO:0000001 or PATO:0000461
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/efo\/terms\/.*EFO_0008481.*\/hierarchicalAncestors.*/).reply(200, {
      _embedded: {
        terms: [
          {
            iri: "http://www.ebi.ac.uk/efo/EFO_0000001",
            label: "experimental factor"
          }
        ]
      }
    });

    // Mock ancestors for any mondo entity
    mockAxios.onGet(/.*\/ols4\/api\/ontologies\/mondo\/terms\/.*\/hierarchicalAncestors.*/).reply(200, {
      _embedded: {
        terms: []
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


test(" -> graphRestriction 1 Schema", () => {
    let inputSchema = fs.readFileSync("examples/schemas/graphRestriction-schema.json");
    let jsonSchema = JSON.parse(inputSchema);

    let inputObj = fs.readFileSync("examples/objects/graphRestriction_pass.json");
    let jsonObj = JSON.parse(inputObj);

    const validator = new BioValidator();

    return validator._validate(jsonSchema, jsonObj).then((data) => {
        expect(data).toBeDefined();
    });

});

test(" -> graphRestriction 2 Schema", () => {
    let inputSchema = fs.readFileSync("examples/schemas/graphRestriction-schema.json");
    let jsonSchema = JSON.parse(inputSchema);

    let inputObj = fs.readFileSync("examples/objects/graphRestriction_normal.json");
    let jsonObj = JSON.parse(inputObj);


    const validator = new BioValidator();

    return validator._validate(jsonSchema, jsonObj).then((data) => {
        expect(data).toBeDefined();
    });
});

test(" -> graphRestriction 3 Schema", () => {
    let inputSchema = fs.readFileSync("examples/schemas/graphRestriction-schema.json");
    let jsonSchema = JSON.parse(inputSchema);

    let inputObj = fs.readFileSync("examples/objects/graphRestriction_fail.json");
    let jsonObj = JSON.parse(inputObj);


    const validator = new BioValidator();

    return validator._validate(jsonSchema, jsonObj).then((data) => {
        expect(data).toBeDefined();
        expect(data.length).toBe(1);
        expect(data[0].message).toContain('Provided term is not child of');

    });
});
