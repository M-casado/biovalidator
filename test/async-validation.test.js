const fs = require("fs");
const BioValidator = require("../src/core/biovalidator-core");
const axios = require("axios");
const MockAdapter = require("axios-mock-adapter");

const biovalidator = new BioValidator();
let mockAxios;

beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    
    // Mock PATO terms for FAANG schemas
    mockAxios.onGet(/.*\/api\/terms.*/).reply((config) => {
      // PATO_0000383 (female)
      if (config.url?.includes('PATO_0000383') || config.params?.iri === 'http://purl.obolibrary.org/obo/PATO_0000383') {
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
      // PATO_0020002 (female genotypic sex)
      if (config.url?.includes('PATO_0020002') || config.params?.iri === 'http://purl.obolibrary.org/obo/PATO_0020002') {
        return [200, {
          _embedded: {
            terms: [{
              iri: "http://purl.obolibrary.org/obo/PATO_0020002",
              ontology_name: "pato", 
              label: "female genotypic sex",
              is_obsolete: false
            }]
          }
        }];
      }
      // PATO_0000047 (sex)
      if (config.url?.includes('PATO_0000047') || config.params?.iri === 'http://purl.obolibrary.org/obo/PATO_0000047') {
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

    // Mock ancestors for PATO_0020002 (female genotypic sex) - should include PATO_0000047 (sex)  
    mockAxios.onGet(/.*\/api\/ontologies\/pato\/terms\/.*PATO_0020002.*\/hierarchicalAncestors.*/).reply(200, {
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
      console.warn(`Unmocked request: ${config.method?.toUpperCase()} ${config.url || config.baseURL}`);
      return [404, { error: "Not found" }];
    });
});

afterEach(() => {
    mockAxios.restore();
});

test(" -> isChildTermOf Schema", () => {
  let inputSchema = fs.readFileSync("examples/schemas/isChildTerm-schema.json", "utf-8");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/isChildTerm.json", "utf-8");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator.validate(jsonSchema, jsonObj).then( (data) => {
    expect(data).toBeDefined();
    expect(data[0]).toBeDefined();
    expect(data[0].dataPath).toBe("/attributes/age/0/terms/0/url");
  });
});

test("FAANG Schema - FAANG \'organism\' sample", () => {
  let inputSchema = fs.readFileSync("examples/schemas/faang-schema.json", "utf-8");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/faang-organism-sample.json", "utf-8");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator.validate(jsonSchema, jsonObj).then( (data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });
});

test("FAANG Schema - \'specimen\' sample", () => {
  let inputSchema = fs.readFileSync("examples/schemas/faang-schema.json", "utf-8");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/faang-specimen-sample.json", "utf-8");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator.validate(jsonSchema, jsonObj).then( (data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });
});

test("FAANG Schema - \'pool of specimens\' sample", () => {
  let inputSchema = fs.readFileSync("examples/schemas/faang-schema.json", "utf-8");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/faang-poolOfSpecimens-sample.json", "utf-8");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator.validate(jsonSchema, jsonObj).then( (data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });
});

test("FAANG Schema - \'cell specimen\' sample", () => {
  let inputSchema = fs.readFileSync("examples/schemas/faang-schema.json", "utf-8");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/faang-cellSpecimen-sample.json", "utf-8");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator.validate(jsonSchema, jsonObj).then( (data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });
});

test("FAANG Schema - \'cell culture\' sample", () => {
  let inputSchema = fs.readFileSync("examples/schemas/faang-schema.json", "utf-8");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/faang-cellCulture-sample.json", "utf-8");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator.validate(jsonSchema, jsonObj).then( (data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });
});

test("FAANG Schema - \'cell line\' sample", () => {
  let inputSchema = fs.readFileSync("examples/schemas/faang-schema.json", "utf-8");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/faang-cellLine-sample.json", "utf-8");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator.validate(jsonSchema, jsonObj).then( (data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });
});
