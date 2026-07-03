jest.mock('axios');
const axios = require('axios');
const BioValidator = require('../src/core/biovalidator-core');

test('Referenced schema in 2020 cache is reused when referenced from 2019 compilation (no network calls)', async () => {
  const b = new BioValidator();
  const uri = 'https://example.org/P12345.json';
  const remoteSchema = {
    $id: uri,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      a: { type: 'string' },
      b: { type: 'number' }
    }
  };

  // Simulate a remote schema previously fetched into the 2020 context.
  b.ajvContexts['2020'].referencedSchemaCache.set(uri, remoteSchema);

  // If network is attempted, fail the test
  axios.mockImplementation(() => Promise.reject(new Error('Network should not be called')));

  const inputSchema = { $ref: uri }; // no $schema -> defaults to 2019 context
  const data = { a: 'hello', b: 1 };

  const errors = await b.validate(inputSchema, data);

  // Ensure no network request was made and validation passed
  expect(axios).not.toHaveBeenCalled();
  expect(errors).toBeDefined();
  expect(errors.length).toBe(0);
});
