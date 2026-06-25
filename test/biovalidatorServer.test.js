jest.mock("axios");

const fs = require("fs");
const npid = require("npid");
const axios = require("axios");

const BioValidatorServer = require('../src/core/server');
const supertest = require('supertest');
const server = new BioValidatorServer("3020", "");
server._configureServer()._configureEndpoints();
const requestWithSupertest = supertest(server.app);

describe('biovalidator server endpoints', () => {
  beforeEach(() => {
    axios.mockReset();
    server.fegaExamplesClient.clearCache();
  });

  afterAll(done => {
    server.fegaExamplesClient.clearCache();
    if (server.expressServer) {
      server.expressServer.close();
    }
    npid.remove(server.pidPath);
    done();
  });

  it('GET / should serve EGA endpoint UI with FEGA example controls', async () => {
    const res = await requestWithSupertest.get('/');
    expect(res.status).toEqual(200);
    expect(res.type).toEqual(expect.stringContaining('html'));
    expect(res.text).toContain('EGA Biovalidator endpoint');
    expect(res.text).toContain('https://avatars.githubusercontent.com/u/20772902?s=280');
    expect(res.text).toContain('id="example-select"');
    expect(res.text).toContain('id="fetch-examples"');
    expect(res.text).toContain('id="load-example"');
    expect(res.text).toContain('FEGA metadata technical report');
  });

  it('GET /validate should describe the EGA endpoint request shape', async () => {
    const res = await requestWithSupertest.get('/validate');
    expect(res.status).toEqual(200);
    expect(res.type).toEqual(expect.stringContaining('json'));
    expect(res.body.message).toContain('EGA Biovalidator endpoint');
    expect(res.body.example_post_body.schema).toEqual({
      "$ref": "https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/cohort/schema.json"
    });
    expect(res.body.example_post_body.data).toMatchObject({
      "@type": "ega:cohort",
      id: "ega:EGAH00000000001"
    });
  });

  it('GET /examples returns dynamically fetched FEGA examples', async () => {
    axios.mockImplementation((config) => {
      if (config.url.includes('/git/trees/')) {
        return Promise.resolve({
          data: {
            tree: [
              {
                path: 'schemas/entities/cohort/examples/valid/cohort-valid-minimal-study-defined.json',
                type: 'blob'
              },
              {
                path: 'schemas/entities/cohort/examples/valid/cohort-valid-detailed-study-defined.json',
                type: 'blob'
              }
            ]
          }
        });
      }
      return Promise.resolve({
        data: {
          schema: {
            "$ref": "https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/cohort/schema.json"
          },
          data: {
            "@type": "ega:cohort",
            id: "ega:EGAH00000000001"
          }
        }
      });
    });

    const res = await requestWithSupertest.get('/examples');

    expect(res.status).toEqual(200);
    expect(res.type).toEqual(expect.stringContaining('json'));
    expect(res.body).toMatchObject({
      source: 'M-casado/fega-metadata-schema',
      ref: 'main',
      pattern: 'schemas/entities/*/examples/valid/*minimal*.json'
    });
    expect(res.body.examples).toHaveLength(1);
    expect(res.body.examples[0]).toMatchObject({
      id: 'cohort-valid-minimal-study-defined',
      entity: 'cohort',
      name: 'cohort-valid-minimal-study-defined.json',
      schema: {
        "$ref": "https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/cohort/schema.json"
      },
      data: {
        "@type": "ega:cohort",
        id: "ega:EGAH00000000001"
      }
    });
  });

  it('GET /examples uses the FEGA examples cache on repeated requests', async () => {
    axios.mockImplementation((config) => {
      if (config.url.includes('/git/trees/')) {
        return Promise.resolve({
          data: {
            tree: [
              {
                path: 'schemas/entities/cohort/examples/valid/cohort-valid-minimal-study-defined.json',
                type: 'blob'
              }
            ]
          }
        });
      }
      return Promise.resolve({
        data: {
          schema: {"$ref": "https://example.org/schema.json"},
          data: {"@type": "ega:cohort"}
        }
      });
    });

    await requestWithSupertest.get('/examples');
    await requestWithSupertest.get('/examples');

    expect(axios).toHaveBeenCalledTimes(2);
  });

  it('GET /examples refresh=true bypasses the FEGA examples cache', async () => {
    axios.mockImplementation((config) => {
      if (config.url.includes('/git/trees/')) {
        return Promise.resolve({
          data: {
            tree: [
              {
                path: 'schemas/entities/cohort/examples/valid/cohort-valid-minimal-study-defined.json',
                type: 'blob'
              }
            ]
          }
        });
      }
      return Promise.resolve({
        data: {
          schema: {"$ref": "https://example.org/schema.json"},
          data: {"@type": "ega:cohort"}
        }
      });
    });

    await requestWithSupertest.get('/examples?refresh=true');
    await requestWithSupertest.get('/examples?refresh=true');

    expect(axios).toHaveBeenCalledTimes(4);
  });

  it('GET /examples returns controlled error when upstream fetch fails', async () => {
    axios.mockRejectedValue(new Error('GitHub unavailable'));

    const res = await requestWithSupertest.get('/examples');

    expect(res.status).toEqual(502);
    expect(res.type).toEqual(expect.stringContaining('json'));
    expect(res.body).toEqual({
      error: 'Failed to load FEGA examples. GitHub unavailable'
    });
  });

  it('GET /cache should initially return empty cache', async () => {
    const res = await requestWithSupertest.get('/cache');
    expect(res.status).toEqual(200);
    expect(res.type).toEqual(expect.stringContaining('json'));
    expect(res.body).toHaveProperty('cachedSchema');
    expect(res.body).toEqual({"cachedSchema": [], "referencedSchema": []})
  });

  it('GET /cache contains object after one hit', async () => {

    let inputSchema = JSON.parse(fs.readFileSync("examples/schemas/biosamples-schema.json", "utf-8"));
    let inputData = JSON.parse(fs.readFileSync("examples/objects/faang-organism-sample.json", "utf-8"));

    let res = await requestWithSupertest.post('/validate')
        .send({
          "schema": inputSchema,
          "data": inputData
        });

    expect(res.status).toEqual(200);
    expect(res.type).toEqual(expect.stringContaining('json'));
    expect(res.body).toEqual([])


    res = await requestWithSupertest.get('/cache');
    expect(res.status).toEqual(200);
    expect(res.type).toEqual(expect.stringContaining('json'));
    expect(res.body).toHaveProperty('cachedSchema');
    expect(res.body).toEqual({"cachedSchema": ["test/biosamples/schema"], "referencedSchema": []})
  });

  it('GET /cache should be empty after cache clear', async () => {
    let res = await requestWithSupertest.delete('/cache');
    expect(res.status).toEqual(200);

    res = await requestWithSupertest.get('/cache');
    expect(res.status).toEqual(200);
    expect(res.type).toEqual(expect.stringContaining('json'));
    expect(res.body).toHaveProperty('cachedSchema');
    expect(res.body).toEqual({"cachedSchema": [], "referencedSchema": []})
  });

});
