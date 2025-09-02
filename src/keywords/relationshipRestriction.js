const axios = require('axios');
const ols = require('../services/olsClient');
const { doubleEncodeIri } = require('../utils/iri');
const { ValidationError } = require('ajv');

// Supported relation tokens
const SUPPORTED_REL = 'rdfs:subClassOf';

function parseStep(step) {
	if (typeof step !== 'string' || !step.startsWith(SUPPORTED_REL)) return null;
	const op = step.substring(SUPPORTED_REL.length);
	if (op !== '' && op !== '*' && op !== '+') return null;
	return { base: SUPPORTED_REL, op };
}

function normalizeOntologyName(ontology) {
	// Strip "obo:" prefix if present
	if (typeof ontology === 'string' && ontology.startsWith('obo:')) {
		return ontology.substring(4);
	}
	return ontology;
}

function normalizeBool(v, def) {
	return typeof v === 'boolean' ? v : def;
}

function validateFormat(data, idFormat) {
	if (idFormat === 'CURIE') {
		const curiePattern = /^[A-Za-z0-9_-]+:[A-Za-z0-9_.-]+$/;
		return curiePattern.test(data);
	} else if (idFormat === 'IRI') {
		return data.startsWith('http://') || data.startsWith('https://');
	}
	return true; // ANY format or unspecified
}

function looksLikeIri(x) {
	return typeof x === 'string' && (x.startsWith('http://') || x.startsWith('https://'));
}

async function resolveEntity(ontology, id) {
	return looksLikeIri(id) ? ols.fetchEntityByIri(ontology, id)
		: ols.fetchEntityByCurie(ontology, id);
}

async function isLeaf(ontology, entity) {
	if (Object.prototype.hasOwnProperty.call(entity, 'has_children')) {
		return entity.has_children === false;
	}
	try {
		const children = await ols.getChildren(ontology, entity.iri);
		return Array.isArray(children) ? children.length === 0
			: (children && children._embedded && Array.isArray(children._embedded.terms) ? children._embedded.terms.length === 0 : true);
	} catch {
		return false;
	}
}

async function checkPath(ontology, sourceEntity, targetEntity, step) {
	if (step.op === '') {
		const parents = await ols.getParents(ontology, sourceEntity.iri);
		const parentIris = Array.isArray(parents) ? parents
			: (parents && parents._embedded && parents._embedded.terms ? parents._embedded.terms.map(t => t.iri) : []);
		return parentIris.includes(targetEntity.iri);
	}

	const ancestors = await ols.getAncestors(ontology, sourceEntity.iri);
	const ancestorIris = Array.isArray(ancestors) ? ancestors
		: (ancestors && ancestors._embedded && ancestors._embedded.terms ? ancestors._embedded.terms.map(t => t.iri) : []);

	if (step.op === '*') {
		return sourceEntity.iri === targetEntity.iri || ancestorIris.includes(targetEntity.iri);
	}

	return ancestorIris.includes(targetEntity.iri);
}

module.exports = {
	keyword: 'relationshipRestriction',
	type: 'string',
	async: true,
	errors: true,
	metaSchema: {
		type: 'object',
		additionalProperties: false,
		properties: {
			ontologies: {
				type: 'array',
				minItems: 1,
				items: { type: 'string', minLength: 1 }
			},
			targets: {
				type: 'array',
				minItems: 1,
				items: { type: 'string', minLength: 1 }
			},
			relationType: {
				type: 'array',
				minItems: 1,
				items: {
					type: 'string',
					pattern: '^rdfs:subClassOf(\\*|\\+)?$'
				}
			},
			idFormat: {
				type: 'string',
				enum: ['CURIE', 'IRI', 'ANY']
			},
			allowObsolete: { type: 'boolean' },
			allowImported: { type: 'boolean' },
			leafNode: { type: 'boolean' },
			includeSelf: { type: 'boolean' },
			directChild: { type: 'boolean' }
		}
	},
	compile(options /* , parentSchema, it */) {
		const ontologies = options.ontologies || [];
		const targets = options.targets || [];
		const relationType = options.relationType || [];
		const idFormat = options.idFormat || 'CURIE';
		const allowObsolete = normalizeBool(options.allowObsolete, true);
		const allowImported = normalizeBool(options.allowImported, true);
		const leafNode = normalizeBool(options.leafNode, false);
		const includeSelf = normalizeBool(options.includeSelf, false);
		const directChild = normalizeBool(options.directChild, false);

		const validate = async function (data /* , dataCxt */) {
			console.log(`RelationshipRestriction: validating data: ${data}`);
			
			if (typeof data !== 'string') return true;

			// Runtime validation of options
			const configErrors = [];
			if (!Array.isArray(ontologies) || ontologies.length === 0)
				configErrors.push('ontologies must be a non-empty array');
			if (!Array.isArray(targets) || targets.length === 0)
				configErrors.push('targets must be a non-empty array');
			if (!Array.isArray(relationType) || relationType.length === 0)
				configErrors.push('relationType must be a non-empty array');
			if (configErrors.length) {
				validate.errors = [{
					keyword: 'relationshipRestriction',
					instancePath: '',
					schemaPath: '',
					params: {},
					message: configErrors.join('; ')
				}];
				return false;
			}

			const steps = relationType.map(parseStep);
			if (steps.some(s => !s)) {
				validate.errors = [{
					keyword: 'relationshipRestriction',
					instancePath: '',
					schemaPath: '',
					params: {},
					message: 'unsupported relationType specified'
				}];
				return false;
			}

			// Format validation first
			if (!validateFormat(data, idFormat)) {
				validate.errors = [{
					keyword: 'relationshipRestriction',
					instancePath: '',
					schemaPath: '',
					params: { format: idFormat },
					message: `must be in ${idFormat} format`
				}];
				return false;
			}

			let lastError = null;

			for (const ont of ontologies) {
				const normalizedOnt = normalizeOntologyName(ont);
				console.log(`Checking ontology: ${ont} (normalized: ${normalizedOnt})`);
				
				try {
					console.log(`Resolving entity: ${data} in ontology: ${normalizedOnt}`);
					const source = await resolveEntity(normalizedOnt, data);
					console.log(`Resolved source entity:`, source);
					
					if (!source || !source.iri) {
						lastError = `Term not found in ontology ${ont}`;
						console.log(lastError);
						continue;
					}

					const isObsolete = !!(source.is_obsolete ?? source.obsolete ?? source.isObsolete);
					if (!allowObsolete && isObsolete) {
						validate.errors = [{
							keyword: 'relationshipRestriction',
							instancePath: '',
							schemaPath: '',
							params: {},
							message: 'Provided term is obsolete'
						}];
						return false;
					}
					
					const isDefining = !!(source.is_defining_ontology ?? source.isDefiningOntology ?? true);
					if (!allowImported && !isDefining) {
						lastError = `Provided term is imported in ${ont}`;
						continue;
					}

					if (leafNode) {
						const leaf = await isLeaf(normalizedOnt, source);
						if (!leaf) {
							validate.errors = [{
								keyword: 'relationshipRestriction',
								instancePath: '',
								schemaPath: '',
								params: {},
								message: 'Provided term is not a leaf node'
							}];
							return false;
						}
					}

					const targetEntities = [];
					console.log(`Resolving targets: ${targets.join(', ')}`);
					for (const t of targets) {
						console.log(`Resolving target: ${t} in ontology: ${normalizedOnt}`);
						const te = await resolveEntity(normalizedOnt, t);
						console.log(`Resolved target entity:`, te);
						if (te && te.iri) targetEntities.push(te);
					}
					console.log(`Found ${targetEntities.length} target entities`);
					
					if (targetEntities.length === 0) {
						lastError = `Targets not found in ontology ${ont}`;
						console.log(lastError);
						continue;
					}

					let satisfied = false;
					for (const te of targetEntities) {
						// Handle includeSelf option
						if (includeSelf && source.iri === te.iri) {
							satisfied = true;
							break;
						}

						for (let i = 0; i < steps.length; i++) {
							let step = steps[i];

							// if schema asked for transitive but user wants direct child for the final hop,
							// coerce the last hop to direct
							if (directChild && i === steps.length - 1 && step.base === 'rdfs:subClassOf') {
								step = { base: 'rdfs:subClassOf', op: '' };
							}
							
							const ok = await checkPath(normalizedOnt, source, te, step);
							if (ok) {
								satisfied = true;
								break;
							}
						}
						if (satisfied) break;
					}

					if (satisfied) {
						validate.errors = null;
						return true;
					}

					lastError = 'does not satisfy relationship constraint';
				} catch (e) {
					lastError = e && e.message ? e.message : 'Ontology check failed';
				}
			}

			validate.errors = [{
				keyword: 'relationshipRestriction',
				instancePath: '',
				schemaPath: '',
				params: {},
				message: lastError || 'Relationship constraint failed'
			}];
			return false;
		};

		return validate;
	}
};

// Keep thin class wrapper for compatibility
class RelationshipRestriction {
    constructor(keywordName = 'relationshipRestriction', olsBaseUrl = 'https://www.ebi.ac.uk/ols4/') {
        this.keywordName = keywordName;
        this.olsBaseUrl = olsBaseUrl;
    }

    isAsync() {
        return true;
    }

    static _isAsync() {
        return true;
    }

    generateKeywordFunction() {
        return async (schema, data) => {
            const validate = module.exports.compile(schema);
            return await validate(data);
        };
    }
}

// Export both the keyword definition and the class
module.exports.RelationshipRestriction = RelationshipRestriction;