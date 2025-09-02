const relationshipRestriction = require('./relationshipRestriction');
const IsChildTermOf = require('./ischildtermof');

function registerKeywords(ajv, options = {}) {
	// Register relationshipRestriction as async keyword
	ajv.addKeyword(relationshipRestriction);

	// Register isChildTermOf keyword
	const isChildTermOfInstance = new IsChildTermOf(ajv, options.olsBaseUrl);
	ajv.addKeyword(isChildTermOfInstance.getKeywordDefinition());

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
			
			const { ValidationError } = require('ajv');
			
			const wrapped = async function (data, dataCxt) {
				const ok = await validate(data, dataCxt);
				if (!ok) {
					// Convert relationshipRestriction errors to graphRestriction format
					let convertedErrors;
					if (validate.errors && validate.errors.length > 0) {
						convertedErrors = validate.errors.map(err => {
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
					} else {
						// Validation failed but no errors set - provide default error
						convertedErrors = [{
							keyword: 'graphRestriction',
							instancePath: '',
							schemaPath: '',
							params: {},
							message: `Provided term is not child of [${schema.classes.join(', ')}]`
						}];
					}
					// For async keywords, throw ValidationError
					throw new ValidationError(convertedErrors);
				}
				return ok;
			};
			return wrapped;
		}
	});
}

// Export both the function and the class constructors
module.exports = registerKeywords;
module.exports.isChildTermOf = require('./ischildtermof');
module.exports.isValidTerm = require('./isvalidterm');
module.exports.isValidTaxonomy = require('./isvalidtaxonomy');
module.exports.GraphRestriction = require('./graphRestriction');
module.exports.relationshipRestriction = relationshipRestriction;
