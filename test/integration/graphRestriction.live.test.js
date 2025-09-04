const fs = require('fs');
const path = require('path');
const BioValidator = require('../../src/core/biovalidator-core');

const runLive = process.env.BV_LIVE_OLS === '1';
const describeIf = runLive ? describe : describe.skip;

describeIf('graphRestriction LIVE (hits OLS4)', () => {
    let validator;

    beforeEach(() => {
        validator = new BioValidator();
    });

    test('passes: graphRestriction_pass.json', async () => {
        const schemaPath = path.join(__dirname, '../../examples/schemas/graphRestriction-schema.json');
        const objectPath = path.join(__dirname, '../../examples/objects/graphRestriction_pass.json');
        
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const obj = JSON.parse(fs.readFileSync(objectPath, 'utf8'));
        
        const data = await validator._validate(schema, obj);
        expect(data).toBeDefined();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0); // No errors expected
    });

    test('normal: graphRestriction_normal.json', async () => {
        const schemaPath = path.join(__dirname, '../../examples/schemas/graphRestriction-schema.json');
        const objectPath = path.join(__dirname, '../../examples/objects/graphRestriction_normal.json');
        
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const obj = JSON.parse(fs.readFileSync(objectPath, 'utf8'));
        
        const data = await validator._validate(schema, obj);
        expect(data).toBeDefined();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0); // No errors expected
    });

    test('fails: graphRestriction_fail.json', async () => {
        const schemaPath = path.join(__dirname, '../../examples/schemas/graphRestriction-schema.json');
        const objectPath = path.join(__dirname, '../../examples/objects/graphRestriction_fail.json');
        
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const obj = JSON.parse(fs.readFileSync(objectPath, 'utf8'));
        
        const data = await validator._validate(schema, obj);
        expect(data).toBeDefined();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0); // Errors expected
        
        // Check that it contains expected error message
        const errorMessages = data.map(error => error.message || '').join(' ');
        expect(errorMessages).toMatch(/Provided term is not child of|not.*child/i);
    });

    if (!runLive) {
        test('should skip when BV_LIVE_OLS is not set', () => {
            expect(true).toBe(true); // This test serves as documentation
        });
    }
});