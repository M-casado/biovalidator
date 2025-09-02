'use strict';

const relationshipRestriction = require('./relationshipRestriction');
const { ValidationError } = require('ajv');

class IsChildTermOf {
	constructor(ajv, olsBaseUrl) {
		this.ajv = ajv;
		this.olsBaseUrl = olsBaseUrl;
	}

	getKeywordDefinition() {
		function mapLegacySchema(schema) {
			return {
				ontologies: schema.ontologies || (schema.ontology ? [schema.ontology] : (schema.ontologyId ? [schema.ontologyId] : [])),
				targets: schema.targets || (schema.parentTerm ? [schema.parentTerm] : []),
				relationType: ['rdfs:subClassOf*'],
				idFormat: schema.idFormat || 'ANY', // Allow both IRIs and CURIEs 
				allowObsolete: typeof schema.allowObsolete === 'boolean' ? schema.allowObsolete : true,
				allowImported: typeof schema.allowImported === 'boolean' ? schema.allowImported : true,
				leafNode: !!schema.leafNode,
				includeSelf: false
			};
		}

		return {
			keyword: 'isChildTermOf',
			type: 'string',
			async: true,
			errors: true,
			compile(schema /*, parentSchema, it */) {
				const mapped = mapLegacySchema(schema);
				const baseValidate = relationshipRestriction.compile(mapped);

				const validate = async function (data /*, dataCxt */) {
					try {
						return await baseValidate(data);
					} catch (error) {
						if (error instanceof ValidationError) {
							// Convert the error message to match legacy expectations
							const parentText = mapped.targets && mapped.targets.length
								? mapped.targets.join(', ')
								: 'the specified term';
							
							const first = error.errors && error.errors[0];
							let message = `Provided term is not child of ${parentText}`;
							
							if (first && typeof first.message === 'string') {
								if (/obsolete/i.test(first.message) || /leaf node/i.test(first.message)) {
									message = first.message;
								}
							}

							throw new ValidationError([{
								keyword: 'isChildTermOf',
								instancePath: '',
								schemaPath: '',
								params: {},
								message
							}]);
						}
						throw error;
					}
				};

				return validate;
			}
		};
	}

	getKeyword() {
		return this.getKeywordDefinition();
	}

	generateKeywordFunction() {
		const def = this.getKeywordDefinition();
		return async (schema, data) => {
			const validate = def.compile(schema);
			return await validate(data);
		};
	}

	configure(ajvInstance) {
		ajvInstance.addKeyword(this.getKeywordDefinition());
		return ajvInstance;
	}
}

module.exports = IsChildTermOf;