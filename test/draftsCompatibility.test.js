const fs = require("fs");
const path = require("path");
const BioValidator = require("../src/core/biovalidator-core");
const biovalidator = new BioValidator();

/**
 * In this test, we manually load "examples/both" JSON files, each of which
 * contains an embedded "schema" and "data" property. There's one test for each draft:
 * 06, 07, 2019, and 2020, using both a "valid" and "invalid" example.
 */

test("Draft 06 - valid", () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, "..", "examples", "both", "test-06SchemaDraft-valid.json"),
    "utf-8"
  );
  const { schema, data } = JSON.parse(fileContent);

  return biovalidator.validate(schema, data).then((errors) => {
    // For a valid file, we expect 0 errors ('[]')
    expect(errors).toBeDefined();
    expect(errors.length).toBe(0);
  });
});

test("Draft 06 - invalid", () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, "..", "examples", "both", "test-06SchemaDraft-invalid.json"),
    "utf-8"
  );
  const { schema, data } = JSON.parse(fileContent);

  return biovalidator.validate(schema, data).then((errors) => {
    // For an invalid file, we expect at least 1 error ('["..."]')
    expect(errors).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
  });
});

test("Draft 07 - valid", () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, "..", "examples", "both", "test-07SchemaDraft-valid.json"),
    "utf-8"
  );
  const { schema, data } = JSON.parse(fileContent);

  return biovalidator.validate(schema, data).then((errors) => {
    expect(errors).toBeDefined();
    expect(errors.length).toBe(0);
  });
});

test("Draft 07 - invalid", () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, "..", "examples", "both", "test-07SchemaDraft-invalid.json"),
    "utf-8"
  );
  const { schema, data } = JSON.parse(fileContent);

  return biovalidator.validate(schema, data).then((errors) => {
    expect(errors).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
  });
});

test("Draft 2019 - valid", () => {
  let inputSchema = fs.readFileSync("examples/schemas/draft2019-9-support-schema.json");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/draft2019-9-support_pass.json");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator._validate(jsonSchema, jsonObj).then((data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });
});

test("Draft 2019 - invalid", () => {
  let inputSchema = fs.readFileSync("examples/schemas/draft2019-9-support-schema.json");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/draft2019-9-support_fail.json");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator._validate(jsonSchema, jsonObj).then((data) => {
    expect(data).toBeDefined();
    expect(data.length).toBeGreaterThan(0);
  });
});

test("Draft 2020 - valid", () => {
  let inputSchema = fs.readFileSync("examples/schemas/draft2020-12-support-schema.json");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/draft2020-12-support_pass.json");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator._validate(jsonSchema, jsonObj).then((data) => {
    expect(data).toBeDefined();
    expect(data.length).toBe(0);
  });
});

test("Draft 2020 - invalid", () => {
  let inputSchema = fs.readFileSync("examples/schemas/draft2020-12-support-schema.json");
  let jsonSchema = JSON.parse(inputSchema);

  let inputObj = fs.readFileSync("examples/objects/draft2020-12-support_fail.json");
  let jsonObj = JSON.parse(inputObj);

  return biovalidator._validate(jsonSchema, jsonObj).then((data) => {
    expect(data).toBeDefined();
    expect(data.length).toBeGreaterThan(0);
  });
});

// Sanity checks for AJV context selection
test("AJV context selection - 2019 schema", () => {
  let inputSchema = JSON.parse(fs.readFileSync("examples/schemas/draft2019-9-support-schema.json"));
  const ctx = biovalidator._getAjvContextForSchema(inputSchema);
  expect(ctx).toBeDefined();
  expect(ctx.type).toBe("2019");
});

test("AJV context selection - 2020 schema", () => {
  let inputSchema = JSON.parse(fs.readFileSync("examples/schemas/draft2020-12-support-schema.json"));
  const ctx = biovalidator._getAjvContextForSchema(inputSchema);
  expect(ctx).toBeDefined();
  expect(ctx.type).toBe("2020");
});
