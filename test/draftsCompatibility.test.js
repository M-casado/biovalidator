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
  const fileContent = fs.readFileSync(
    path.join(__dirname, "..", "examples", "both", "test-2019SchemaDraft-valid.json"),
    "utf-8"
  );
  const { schema, data } = JSON.parse(fileContent);

  return biovalidator.validate(schema, data).then((errors) => {
    expect(errors).toBeDefined();
    expect(errors.length).toBe(0);
  });
});

test("Draft 2019 - invalid", () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, "..", "examples", "both", "test-2019SchemaDraft-invalid.json"),
    "utf-8"
  );
  const { schema, data } = JSON.parse(fileContent);

  return biovalidator.validate(schema, data).then((errors) => {
    expect(errors).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
  });
});

test("Draft 2020 - valid", () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, "..", "examples", "both", "test-2020SchemaDraft-valid.json"),
    "utf-8"
  );
  const { schema, data } = JSON.parse(fileContent);

  return biovalidator.validate(schema, data).then((errors) => {
    expect(errors).toBeDefined();
    expect(errors.length).toBe(0);
  });
});

test("Draft 2020 - invalid", () => {
  const fileContent = fs.readFileSync(
    path.join(__dirname, "..", "examples", "both", "test-2020SchemaDraft-invalid.json"),
    "utf-8"
  );
  const { schema, data } = JSON.parse(fileContent);

  return biovalidator.validate(schema, data).then((errors) => {
    expect(errors).toBeDefined();
    expect(errors.length).toBeGreaterThan(0);
  });
});