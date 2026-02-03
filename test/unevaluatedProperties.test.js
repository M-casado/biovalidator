const ValidationError = require('../src/model/validation-error');

test('unevaluated property reported in ValidationError', () => {
  const errorObject = {
    instancePath: '',
    message: 'must NOT have unevaluated properties',
    keyword: 'unevaluatedProperties',
    params: { unevaluatedProperty: 'unevaluated one!' }
  };
  const ve = new ValidationError(errorObject);
  expect(ve.dataPath).toBe('/unevaluated one!');
  expect(ve.errors[0]).toContain("unevaluated properties");
  expect(ve.errors[0]).toContain("'unevaluated one!'");
});

test('additional property reported in ValidationError', () => {
  const errorObject = {
    instancePath: '/root',
    message: 'must NOT have additional properties',
    keyword: 'additionalProperties',
    params: { additionalProperty: 'extra one!' }
  };
  const ve = new ValidationError(errorObject);
  expect(ve.dataPath).toBe('/root/extra one!');
  expect(ve.errors[0]).toContain("additional properties");
  expect(ve.errors[0]).toContain("'extra one!'");
});
