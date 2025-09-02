const fs = require("fs");
const BioValidator = require('../src/core/biovalidator-core');
const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

let mockAxios;

beforeEach(() => {
    mockAxios = new MockAdapter(axios);
});

afterEach(() => {
    mockAxios.restore();
});

test(" -> IsValidIdentifier prefixes schema", () => {
    // Mock successful identifiers.org response
    mockAxios.onGet(/.*identifiers\.org.*/).reply(200, {});
    
    let inputSchema = {"$async": true, "properties": {"prefix": {"type": "string", "isValidIdentifier": {"prefix": "ncbitaxon"}}}};
    let inputData = {"prefix": "ncbitaxon:1234"};

    return new BioValidator()._validate(inputSchema, inputData).then((data) => {
        expect(data).toBeDefined();
        expect(data.length).toBe(0);
    });
});

test(" -> IsValidIdentifier single prefix", () => {
    // Mock successful identifiers.org response
    mockAxios.onGet(/.*identifiers\.org.*/).reply(200, {});
    
    let inputSchema = {"$async": true, "properties": {"prefix": {"type": "string", "isValidIdentifier": "ncbitaxon"}}};
    let inputData = {"prefix": "ncbitaxon:1234"};

    return new BioValidator()._validate(inputSchema, inputData).then((data) => {
        expect(data).toBeDefined();
        expect(data.length).toBe(0);
    });
});

test(" -> IsValidIdentifier 2 Schema", () => {
    // Mock failure response for invalid identifier
    mockAxios.onGet(/.*identifiers\.org.*/).reply(400, { error: "Not found" });
    
    let inputSchema = {"$async": true, "properties": {"alias": {"type": "string", "isValidIdentifier": "invalid_prefix"}}};
    let inputData = {"alias": "invalid_prefix:1234"};

    return new BioValidator()._validate(inputSchema, inputData).then((data) => {
        expect(data).toBeDefined();
        expect(data.length).toBe(1);
        expect(data[0].message).toContain('Failed to resolve term from identifiers.org');
    });
});

test(" -> IsValidIdentifier 3 Schema", () => {
    // Mock failure response for invalid namespace
    mockAxios.onGet(/.*identifiers\.org.*/).reply(404, { error: "Invalid namespace" });
    
    let inputSchema = {"$async": true, "properties": {"alias": {"type": "string", "isValidIdentifier": "invalidnamespace"}}};
    let inputData = {"alias": "invalidnamespace:1234"};

    return new BioValidator()._validate(inputSchema, inputData).then((data) => {
        expect(data).toBeDefined();
        expect(data.length).toBe(1);
        expect(data[0].message).toContain('is not a valid namespace for the identifier');
    });
});
