const GraphRestriction = require('../src/keywords/graphRestriction');
const IsValidTaxonomy = require('../src/keywords/isvalidtaxonomy');
const IsValidTerm = require('../src/keywords/isvalidterm');
const IsChildTermOf = require('../src/keywords/ischildtermof');
const IsValidIdentifier = require('../src/keywords/isvalididentifier');
const axios = require('axios');
const { olsCache, enaTaxonomyCache, identifiersCache } = require('../src/keywords/shared-cache');
const {docForTerm, olsResponse} = require('./olsTestUtils');

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
    axios.mockResolvedValue(olsResponse([docForTerm(data)]));

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

    axios.mockResolvedValue(olsResponse([docForTerm(data)]));

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

    axios.mockResolvedValue(olsResponse([docForTerm(data)]));

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

  test('ENA cache hits do not extend TTL and an expired entry is fetched again', async () => {
    const now = new Date('2026-07-03T10:00:00.000Z').getTime();
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);
    const schema = {some: 'schema'};
    const data = 'Homo sapiens';
    const url = `https://www.ebi.ac.uk/ena/taxonomy/rest/any-name/${encodeURIComponent(data)}`;
    axios.mockResolvedValue({status: 200, data: [{taxId: 9606, submittable: 'true'}]});
    const fn = new IsValidTaxonomy().generateKeywordFunction();

    try {
      await fn(schema, data);
      const originalExpiration = enaTaxonomyCache.getTtl(url);

      dateNow.mockReturnValue(now + 60_000);
      await fn(schema, data);
      expect(enaTaxonomyCache.getTtl(url)).toBe(originalExpiration);
      expect(axios).toHaveBeenCalledTimes(1);

      dateNow.mockReturnValue(originalExpiration + 1);
      await fn(schema, data);
      expect(axios).toHaveBeenCalledTimes(2);
      expect(enaTaxonomyCache.getTtl(url)).toBe(originalExpiration + 1 + 21_600_000);
    } finally {
      dateNow.mockRestore();
    }
  });

  test('identifiers.org cache hits do not extend TTL', async () => {
    const now = new Date('2026-07-03T11:00:00.000Z').getTime();
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);
    const schema = {prefixes: ['uniprot']};
    const identifier = 'uniprot:P12345';
    axios.mockResolvedValue({
      status: 200,
      data: {payload: {resolvedResources: [{compactIdentifierResolvedUrl: 'https://example.org/P12345'}]}}
    });
    const fn = new IsValidIdentifier().validationFunction();

    try {
      await fn(schema, identifier);
      const originalExpiration = identifiersCache.getTtl(identifier);

      dateNow.mockReturnValue(now + 60_000);
      await fn(schema, identifier);
      expect(identifiersCache.getTtl(identifier)).toBe(originalExpiration);
      expect(axios).toHaveBeenCalledTimes(1);
    } finally {
      dateNow.mockRestore();
    }
  });
});
