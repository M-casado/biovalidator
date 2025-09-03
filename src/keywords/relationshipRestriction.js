const Ajv = require("ajv").default;
const CustomAjvError = require("../model/custom-ajv-error");
const { logger } = require("../utils/winston");
const { IdentifierParser, IdFormat } = require("../utils/idParsing");

class RelationshipRestriction {
    constructor(olsBaseUrl = 'https://www.ebi.ac.uk/ols4/') {
        this.keywordName = "relationshipRestriction";
        this.identifierParser = new IdentifierParser(olsBaseUrl);
        
        // Track deprecation warnings to emit only once per process
        this._deprecationWarnings = new Set();
    }

    /**
     * Configure the Ajv instance with the relationshipRestriction keyword
     * @param {Object} ajv - Ajv instance
     * @returns {Object} Configured Ajv instance
     */
    configure(ajv) {
        return ajv.addKeyword({
            keyword: this.keywordName,
            async: true,
            errors: true,
            type: "string",
            validate: this.generateValidationFunction()
        });
    }

    /**
     * Generate the validation function
     * @returns {Function} Validation function
     */
    generateValidationFunction() {
        const generateErrorObject = (message, params = {}) => {
            return new CustomAjvError(this.keywordName, `relationshipRestriction: ${message}`, params);
        };

        return async (schema, data) => {
            // Parse and validate options
            const parsedOptions = this._parseOptions(schema);
            if (parsedOptions.errors.length > 0) {
                throw new Ajv.ValidationError(parsedOptions.errors.map(err => generateErrorObject(err)));
            }

            const options = parsedOptions.options;

            try {
                // Step 4: Use IdentifierParser to resolve input data to IRI/ontology
                logger.debug(`Parsing input identifier: ${data} for ontologies: ${options.ontologies.join(', ')}`);
                
                const parsedData = await this.identifierParser.parseIdentifier(data, options.ontologies, {
                    idFormat: options.idFormat,
                    allowObsolete: options.allowObsolete,
                    cacheResults: true
                });

                logger.debug(`Resolved input identifier: ${data} → ${parsedData.iri} (ontology: ${parsedData.ontology})`);

                // Normalize targets: resolve CURIEs to IRIs but keep original string content for error messages
                const normalizedTargets = [];
                for (const target of options.targets) {
                    try {
                        // Try to parse target if it looks like a CURIE
                        if (this.identifierParser.isCurie(target)) {
                            logger.debug(`Parsing target CURIE: ${target}`);
                            const parsedTarget = await this.identifierParser.parseIdentifier(target, options.ontologies, {
                                idFormat: IdFormat.ANY, // Targets can be either CURIE or IRI
                                allowObsolete: options.allowObsolete,
                                cacheResults: true
                            });
                            // Store both original and IRI for future reference
                            normalizedTargets.push({
                                original: target,
                                iri: parsedTarget.iri,
                                ontology: parsedTarget.ontology
                            });
                            logger.debug(`Resolved target CURIE: ${target} → ${parsedTarget.iri}`);
                        } else {
                            // Assume it's already an IRI, store as-is
                            normalizedTargets.push({
                                original: target,
                                iri: target,
                                ontology: null // Will be determined during relationship checking
                            });
                            logger.debug(`Target assumed to be IRI: ${target}`);
                        }
                    } catch (error) {
                        logger.warn(`Failed to parse target ${target}: ${error.message}`);
                        // Still include it, but mark as unparseable
                        normalizedTargets.push({
                            original: target,
                            iri: target,
                            ontology: null,
                            parseError: error.message
                        });
                    }
                }

                // TODO: Implement actual ontology traversal logic using parsedData and normalizedTargets
                // For now, just validate that parsing succeeded and return true
                logger.debug(`relationshipRestriction validation passed for term: ${data} (${parsedData.iri}) with ${normalizedTargets.length} targets`);
                return true;

            } catch (error) {
                logger.error(`relationshipRestriction validation failed for ${data}: ${error.message}`);
                throw generateErrorObject(error.message);
            }
        };
    }

    /**
     * Parse and validate relationshipRestriction options
     * @param {Object} schema - Schema options
     * @returns {Object} { options: parsed options, errors: array of error messages }
     */
    _parseOptions(schema) {
        const errors = [];
        const options = {};

        // Validate required fields
        if (!schema.ontologies || !Array.isArray(schema.ontologies)) {
            errors.push("'ontologies' must be an array of strings");
        } else {
            // Normalize ontologies: lowercase and strip 'obo:' prefix
            options.ontologies = schema.ontologies.map(ont => {
                if (typeof ont !== 'string') {
                    errors.push("All ontology identifiers must be strings");
                    return ont;
                }
                return ont.toLowerCase().replace(/^obo:/, '');
            });
        }

        if (!schema.targets || !Array.isArray(schema.targets)) {
            errors.push("'targets' must be an array of strings (CURIEs or IRIs)");
        } else {
            // Accept CURIEs or IRIs, don't alter literal values
            options.targets = schema.targets.slice(); // shallow copy
            schema.targets.forEach(target => {
                if (typeof target !== 'string') {
                    errors.push("All target identifiers must be strings");
                }
            });
        }

        if (!schema.relationType || !Array.isArray(schema.relationType)) {
            errors.push("'relationType' must be an array of supported relation type strings");
        } else {
            // Validate allowed relation types
            const allowedTypes = ['rdf:type', 'rdfs:subClassOf', 'rdfs:subClassOf+', 'rdfs:subClassOf*'];
            options.relationType = [];
            
            schema.relationType.forEach(type => {
                if (typeof type !== 'string') {
                    errors.push("All relation types must be strings");
                } else if (!allowedTypes.includes(type)) {
                    errors.push(`Unsupported relation type: "${type}". Allowed types are: ${allowedTypes.join(', ')}`);
                } else {
                    options.relationType.push(type);
                }
            });
        }

        // Optional fields with defaults
        options.idFormat = schema.idFormat || IdFormat.ANY;
        if (options.idFormat && !Object.values(IdFormat).includes(options.idFormat)) {
            errors.push(`Invalid idFormat: "${options.idFormat}". Must be one of: ${Object.values(IdFormat).join(', ')}`);
        }

        options.allowImported = schema.allowImported !== undefined ? schema.allowImported : true;
        options.allowObsolete = schema.allowObsolete !== undefined ? schema.allowObsolete : false;
        options.leafNode = schema.leafNode !== undefined ? schema.leafNode : false;

        // Handle legacy flags with deprecation warnings
        this._handleLegacyFlags(schema, options);

        // Check for unknown properties
        const knownProps = ['ontologies', 'targets', 'relationType', 'idFormat', 'allowImported', 'allowObsolete', 'leafNode', 'directChild', 'includeSelf'];
        const unknownProps = Object.keys(schema).filter(prop => !knownProps.includes(prop));
        if (unknownProps.length > 0) {
            errors.push(`Unknown properties: ${unknownProps.join(', ')}`);
        }

        return { options, errors };
    }

    /**
     * Handle legacy flags with deprecation warnings
     * @param {Object} schema - Original schema options
     * @param {Object} options - Parsed options to modify
     */
    _handleLegacyFlags(schema, options) {
        // Handle directChild legacy flag
        if (schema.directChild === true) {
            if (!this._deprecationWarnings.has('directChild')) {
                logger.warn('relationshipRestriction: "directChild" option is deprecated. Use relationType: ["rdfs:subClassOf"] instead.');
                this._deprecationWarnings.add('directChild');
            }
            
            // Map to rdfs:subClassOf
            if (!options.relationType) {
                options.relationType = [];
            }
            if (!options.relationType.includes('rdfs:subClassOf')) {
                options.relationType.push('rdfs:subClassOf');
            }
        }

        // Handle includeSelf legacy flag
        if (schema.includeSelf === true) {
            if (!this._deprecationWarnings.has('includeSelf')) {
                logger.warn('relationshipRestriction: "includeSelf" option is deprecated. Use rdfs:subClassOf* (with *) for transitive relations that include self.');
                this._deprecationWarnings.add('includeSelf');
            }
            
            // Convert + variants to * variants in relationType
            if (options.relationType) {
                const updatedTypes = options.relationType.map(type => {
                    if (type === 'rdfs:subClassOf+') {
                        return 'rdfs:subClassOf*';
                    }
                    return type;
                });
                options.relationType = updatedTypes;
            }
        }
    }
}

module.exports = RelationshipRestriction;