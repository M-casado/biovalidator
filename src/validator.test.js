const expect = require('expect');
const fs = require('fs');

const runValidation = require('./validator');

it(' -> Empty Schema (empty object)', () => {
  runValidation({}, {}).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});

it(' -> Attributes Schema (attributes object)', () => {
  var inputSchema = fs.readFileSync('examples/schemas/attributes-schema.json');
  var jsonSchema = JSON.parse(inputSchema);

  var inputObj = fs.readFileSync('examples/objects/attributes.json');
  var jsonObj = JSON.parse(inputObj);

  runValidation(jsonSchema, jsonObj).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});

it('BioSamples Schema - FAANG \'organism\' sample', () => {
  var inputSchema = fs.readFileSync('examples/schemas/biosamples-schema.json');
  var jsonSchema = JSON.parse(inputSchema);

  var inputObj = fs.readFileSync('examples/objects/faang-organism-sample.json');
  var jsonObj = JSON.parse(inputObj);

  runValidation(jsonSchema, jsonObj).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});

it('FAANG Schema - \'organism\' sample', () => {
  var inputSchema = fs.readFileSync('examples/schemas/faang-schema.json');
  var jsonSchema = JSON.parse(inputSchema);

  var inputObj = fs.readFileSync('examples/objects/faang-organism-sample.json');
  var jsonObj = JSON.parse(inputObj);

  runValidation(jsonSchema, jsonObj).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});

it('FAANG Schema - \'specimen\' sample', () => {
  var inputSchema = fs.readFileSync('examples/schemas/faang-schema.json');
  var jsonSchema = JSON.parse(inputSchema);

  var inputObj = fs.readFileSync('examples/objects/faang-specimen-sample.json');
  var jsonObj = JSON.parse(inputObj);

  runValidation(jsonSchema, jsonObj).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});

it('FAANG Schema - \'pool of specimens\' sample', () => {
  var inputSchema = fs.readFileSync('examples/schemas/faang-schema.json');
  var jsonSchema = JSON.parse(inputSchema);

  var inputObj = fs.readFileSync('examples/objects/faang-poolOfSpecimens-sample.json');
  var jsonObj = JSON.parse(inputObj);

  runValidation(jsonSchema, jsonObj).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});

it('FAANG Schema - \'cell specimen\' sample', () => {
  var inputSchema = fs.readFileSync('examples/schemas/faang-schema.json');
  var jsonSchema = JSON.parse(inputSchema);

  var inputObj = fs.readFileSync('examples/objects/faang-cellSpecimen-sample.json');
  var jsonObj = JSON.parse(inputObj);

  runValidation(jsonSchema, jsonObj).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});

it('FAANG Schema - \'cell culture\' sample', () => {
  var inputSchema = fs.readFileSync('examples/schemas/faang-schema.json');
  var jsonSchema = JSON.parse(inputSchema);

  var inputObj = fs.readFileSync('examples/objects/faang-cellCulture-sample.json');
  var jsonObj = JSON.parse(inputObj);

  runValidation(jsonSchema, jsonObj).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});

it('FAANG Schema - \'cell line\' sample', () => {
  var inputSchema = fs.readFileSync('examples/schemas/faang-schema.json');
  var jsonSchema = JSON.parse(inputSchema);

  var inputObj = fs.readFileSync('examples/objects/faang-cellLine-sample.json');
  var jsonObj = JSON.parse(inputObj);

  runValidation(jsonSchema, jsonObj).then((output) => {
    expect(output).toBeA('object');
    expect(output.result).toBeA('string').toBe('Valid!');
    //console.log("result: " + output.result);
  });
});
