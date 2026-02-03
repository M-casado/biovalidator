const GraphRestriction = require('../src/keywords/graphRestriction');
const IsValidTaxonomy = require('../src/keywords/isvalidtaxonomy');
const IsValidTerm = require('../src/keywords/isvalidterm');
const IsChildTermOf = require('../src/keywords/ischildtermof');
const IsValidIdentifier = require('../src/keywords/isvalididentifier');
const axios = require('axios');
const { olsCache, enaTaxonomyCache, identifiersCache } = require('../src/keywords/shared-cache');

jest.mock('axios');

describe('Shared caches for keyword network calls', () => {
  beforeEach(() => {
    olsCache.flushAll();
    enaTaxonomyCache.flushAll();
    identifiersCache.flushAll();
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Close cache timers so Jest can exit cleanly
    try { olsCache.close(); } catch (e) { /* ignore */ }
    try { enaTaxonomyCache.close(); } catch (e) { /* ignore */ }
    try { identifiersCache.close(); } catch (e) { /* ignore */ }
  });

  test('GraphRestriction uses shared OLS cache to avoid duplicate requests', async () => {
    const schema = {
      classes: ['http://purl.obolibrary.org/obo/BFO_0000040'],
      ontologies: ['efo'],
      includeSelf: false
    };

    const data = 'COB:0000022';

    // Mock axios to return a success response
    axios.mockResolvedValue({ status: 200, data: { response: { numFound: 1 } } });

    const gr = new GraphRestriction();
    const fn = gr.generateKeywordFunction();

    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);

    // second call should hit the cache and not call axios again
    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);
  });

  test('IsValidTaxonomy uses shared ENA cache to avoid duplicate requests', async () => {
    const schema = { some: 'schema' };
    const data = 'Homo sapiens';
    const url = `https://www.ebi.ac.uk/ena/taxonomy/rest/any-name/${encodeURIComponent(data)}`;

    axios.mockResolvedValue({ status: 200, data: [{ taxId: 9606, submittable: 'true' }] });

    const t = new IsValidTaxonomy();
    const fn = t.generateKeywordFunction();

    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);

    // second call should use cache
    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);
  });

  test('IsValidTerm uses shared OLS cache to avoid duplicate requests', async () => {
    const schema = { ontology: 'efo' };
    const data = 'http://purl.obolibrary.org/obo/UBERON_0002107';

    axios.mockResolvedValue({ status: 200, data: { response: { numFound: 1 } } });

    const t = new IsValidTerm();
    const fn = t.generateKeywordFunction();

    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);

    // second call should use cache
    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);
  });

  test('IsChildTermOf uses shared OLS cache to avoid duplicate requests', async () => {
    const schema = { parentTerm: 'http://purl.obolibrary.org/obo/UBERON_0002107', ontologyId: 'efo' };
    const data = 'http://purl.obolibrary.org/obo/UBERON_0002108';

    axios.mockResolvedValue({ status: 200, data: { response: { numFound: 1 } } });

    const t = new IsChildTermOf();
    const fn = t.generateKeywordFunction();

    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);

    // second call should use cache
    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);
  });

  test('IsValidIdentifier uses shared identifiers cache to avoid duplicate requests', async () => {
    const schema = { prefixes: ['uniprot'] };
    const data = 'uniprot:P12345';

    axios.mockResolvedValue({ status: 200, data: { payload: { resolvedResources: [{ compactIdentifierResolvedUrl: 'https://example.org/P12345' }] } } });

    const t = new IsValidIdentifier();
    const fn = t.validationFunction();

    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);

    // second call should use cache
    await fn(schema, data);
    expect(axios).toHaveBeenCalledTimes(1);
  });
});