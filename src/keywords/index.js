const relationshipRestriction = require('./relationshipRestriction');

function registerKeywords(ajv, options = {}) {
	// Register relationshipRestriction as async keyword
	ajv.addKeyword(relationshipRestriction);

	// Register legacy aliases that delegate to relationshipRestriction
	ajv.addKeyword({
		keyword: 'graphRestriction',
		type: 'string',
		async: true,
		errors: true,
		metaSchema: {
			type: 'object',
			required: ['classes', 'ontologies'],
			additionalProperties: true,
			properties: {
				classes: {
					type: 'array',
					minItems: 1,
					items: { type: 'string', minLength: 1 }
				},
				ontologies: {
					type: 'array',
					minItems: 1,
					items: { type: 'string', minLength: 1 }
				},
				includeSelf: { type: 'boolean' }
			}
		},
		compile(schema) {
			// Convert graphRestriction schema to relationshipRestriction format
			const relationshipSchema = {
				ontologies: schema.ontologies,
				targets: schema.classes,
				relationType: ["rdfs:subClassOf*"],
				includeSelf: schema.includeSelf || false,
				allowObsolete: false,
				allowImported: true,
				idFormat: "ANY"
			};

			const validate = relationshipRestriction.compile(relationshipSchema, {}, {});
			
			const wrapped = async function (data, dataCxt) {
				try {
					const ok = await validate(data, dataCxt);
					if (!ok && validate.errors) {
						// Convert relationshipRestriction errors to graphRestriction format
						wrapped.errors = validate.errors.map(err => {
							let message = err.message || err.toString();
							if (message.includes("does not satisfy relationship")) {
								message = `Provided term is not child of [${schema.classes.join(', ')}]`;
							}
							return {
								...err,
								keyword: 'graphRestriction',
								message
							};
						});
						return false;
					} else if (!ok) {
						// Validation failed but no errors set - provide default error
						wrapped.errors = [{
							keyword: 'graphRestriction',
							instancePath: '',
							schemaPath: '',
							params: {},
							message: `Provided term is not child of [${schema.classes.join(', ')}]`
						}];
						return false;
					} else {
						wrapped.errors = null;
						return ok;
					}
				} catch (error) {
					// Handle ValidationError properly
					if (error.errors && Array.isArray(error.errors)) {
						wrapped.errors = error.errors.map(err => {
							let message = err.message || err.toString();
							if (message.includes("does not satisfy relationship")) {
								message = `Provided term is not child of [${schema.classes.join(', ')}]`;
							}
							return {
								...err,
								keyword: 'graphRestriction',
								message
							};
						});
						return false;
					}
					throw error;
				}
			};
			return wrapped;
		}
	});
}

// Export both the function and the class constructors
module.exports = registerKeywords;
module.exports.isChildTermOf = require('./isChildTermOf');
module.exports.isValidTerm = require('./isValidTerm');
module.exports.isValidTaxonomy = require('./isValidTaxonomy');
module.exports.GraphRestriction = require('./graphRestriction');
module.exports.relationshipRestriction = relationshipRestriction;
