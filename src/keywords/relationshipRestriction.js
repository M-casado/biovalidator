const axios = require('axios');
const ajv = require("ajv").default;
const CustomAjvError = require("../model/custom-ajv-error");
const { logger } = require("../utils/winston");
const { IdentifierParser, IdFormat } = require("../utils/idParsing");
const { getCache, keyFor } = require("../utils/cache");

/**
 * RelationshipRestriction keyword for validating arbitrary ontology relationship paths
 * Extends beyond simple subclass validation to support complex relationship chains
 */
class RelationshipRestriction {
    constructor(keywordName, olsBaseUrl) {
        this.keywordName = keywordName || "relationshipRestriction";
        this.olsBaseUrl = olsBaseUrl || "https://www.ebi.ac.uk/ols4/";
        this.identifierParser = new IdentifierParser(this.olsBaseUrl);
    }

    /**
     * Configure the AJV instance with the relationshipRestriction keyword
     * @param {object} ajv - AJV instance
     * @returns {object} Configured AJV instance
     */
    configure(ajv) {
        const keywordDefinition = {
            keyword: this.keywordName,
            async: true,
            type: "string",
            validate: this.generateKeywordFunction(),
            errors: true
        };

        return ajv.addKeyword(keywordDefinition);
    }

    keywordFunction() {
        return this.generateKeywordFunction();
    }

    isAsync() {
        return true;
    }

    static _isAsync() {
        return true;
    }

    /**
     * Generate the validation function for the keyword
     * @returns {Function} Validation function
     */
    generateKeywordFunction() {
        const generateErrorObject = (message) => {
            return new CustomAjvError("relationshipRestriction", message, {});
        };

        return async (schema, data) => {
            try {
                // Validate schema structure
                const validationResult = this._validateSchema(schema);
                if (!validationResult.valid) {
                    throw new ajv.ValidationError([generateErrorObject(validationResult.message)]);
                }

                // Extract and normalize options
                const options = this._normalizeOptions(schema);
                
                logger.debug(`RelationshipRestriction validation for term: ${data} with options: ${JSON.stringify(options)}`);

                // Try each ontology until we find a successful match
                let allErrors = [];
                
                for (const ontology of options.ontologies) {
                    try {
                        // Step 1: Parse and validate the input identifier format
                        let parsedTerm;
                        try {
                            parsedTerm = await this.identifierParser.parseIdentifier(
                                data, 
                                [ontology], // Single ontology at a time
                                {
                                    idFormat: options.idFormat,
                                    allowObsolete: options.allowObsolete,
                                    cacheResults: true
                                }
                            );
                        } catch (error) {
                            logger.debug(`Failed to parse identifier ${data} in ontology ${ontology}: ${error.message}`);
                            allErrors.push(error.message);
                            continue; // Try next ontology
                        }

                        // Step 2: Check metadata constraints
                        if (!options.allowImported && parsedTerm.isImported) {
                            logger.debug(`Term ${data} is imported in ontology ${ontology}, skipping`);
                            continue;
                        }

                        // Step 3: Handle includeSelf shortcut
                        if (options.includeSelf && options.targets.includes(parsedTerm.iri)) {
                            logger.debug(`Term ${data} matches target directly with includeSelf enabled`);
                            
                            // Still need to check leafNode constraint if specified
                            if (options.leafNode) {
                                const isLeaf = await this._checkIsLeafNode(parsedTerm.iri, parsedTerm.ontology);
                                if (!isLeaf) {
                                    logger.debug(`Term ${data} is not a leaf node in ontology ${parsedTerm.ontology}`);
                                    continue;
                                }
                            }
                            
                            return true;
                        }

                        // Step 4: Traverse relationship path
                        const pathResult = await this._traverseRelationshipPath(
                            parsedTerm.iri,
                            parsedTerm.ontology,
                            options.relationType,
                            options.targets,
                            options.directChild
                        );

                        if (!pathResult.found) {
                            logger.debug(`No relationship path found in ontology ${parsedTerm.ontology}`);
                            continue;
                        }

                        // Step 5: Check leafNode constraint if specified
                        if (options.leafNode) {
                            const isLeaf = await this._checkIsLeafNode(parsedTerm.iri, parsedTerm.ontology);
                            if (!isLeaf) {
                                logger.debug(`Term ${data} is not a leaf node in ontology ${parsedTerm.ontology}`);
                                continue;
                            }
                        }

                        logger.debug(`RelationshipRestriction validation successful for term: ${data} in ontology ${parsedTerm.ontology}`);
                        return true;

                    } catch (error) {
                        logger.debug(`Error processing ontology ${ontology}: ${error.message}`);
                        continue;
                    }
                }

                // If we get here, no ontology satisfied the constraints
                // Check if all errors are format-related (same error for all ontologies)
                if (allErrors.length > 0 && allErrors.every(err => err === allErrors[0])) {
                    // All ontologies failed with the same error (likely format issue)
                    throw new ajv.ValidationError([generateErrorObject(allErrors[0])]);
                }
                
                const message = `Term ${data} does not satisfy relationship ${options.relationType.join(' -> ')} to targets [${options.targets.join(', ')}] in any of the ontologies [${options.ontologies.join(', ')}]`;
                throw new ajv.ValidationError([generateErrorObject(message)]);

            } catch (error) {
                if (error instanceof ajv.ValidationError) {
                    throw error;
                }
                logger.error(`Unexpected error in relationshipRestriction: ${error.message}`);
                throw new ajv.ValidationError([generateErrorObject(`Validation failed: ${error.message}`)]);
            }
        };
    }

    /**
     * Validate the schema configuration
     * @private
     * @param {object} schema - Schema configuration
     * @returns {object} Validation result with valid flag and message
     */
    _validateSchema(schema) {
        if (!schema || typeof schema !== 'object') {
            return { valid: false, message: "relationshipRestriction must be an object" };
        }

        if (!Array.isArray(schema.ontologies) || schema.ontologies.length === 0) {
            return { valid: false, message: "ontologies must be a non-empty array" };
        }

        if (!Array.isArray(schema.targets) || schema.targets.length === 0) {
            return { valid: false, message: "targets must be a non-empty array" };
        }

        if (!Array.isArray(schema.relationType) || schema.relationType.length === 0) {
            return { valid: false, message: "relationType must be a non-empty array" };
        }

        // Validate idFormat if specified
        if (schema.idFormat && !Object.values(IdFormat).includes(schema.idFormat)) {
            return { valid: false, message: `idFormat must be one of: ${Object.values(IdFormat).join(', ')}` };
        }

        return { valid: true };
    }

    /**
     * Normalize and set defaults for schema options
     * @private
     * @param {object} schema - Raw schema configuration
     * @returns {object} Normalized options
     */
    _normalizeOptions(schema) {
        return {
            ontologies: schema.ontologies.map(ont => ont.toLowerCase().replace(/^obo:/, '')),
            targets: schema.targets,
            relationType: schema.relationType,
            idFormat: schema.idFormat || IdFormat.ANY,
            includeSelf: schema.includeSelf || false,
            allowImported: schema.allowImported !== false, // default true
            allowObsolete: schema.allowObsolete || false,
            directChild: schema.directChild || false,
            leafNode: schema.leafNode || false
        };
    }

    /**
     * Traverse the relationship path to find if any target is reachable
     * @private
     * @param {string} startIri - Starting term IRI
     * @param {string} ontology - Ontology ID
     * @param {Array} relationChain - Array of relations to traverse
     * @param {Array} targets - Target IRIs to match
     * @param {boolean} directChild - If true, enforce single-hop for subclass relations
     * @returns {Promise<object>} Result with found flag and matched target
     */
    async _traverseRelationshipPath(startIri, ontology, relationChain, targets, directChild) {
        let currentNodes = new Set([startIri]);
        
        logger.debug(`Starting relationship traversal from ${startIri} with chain: ${relationChain.join(' -> ')}`);

        for (let i = 0; i < relationChain.length; i++) {
            const relation = relationChain[i];
            const isTransitive = relation.endsWith('*');
            const baseRelation = isTransitive ? relation.slice(0, -1) : relation;
            const isLastStep = i === relationChain.length - 1;

            logger.debug(`Step ${i + 1}: Processing relation ${relation} (${isTransitive ? 'transitive' : 'direct'})`);

            let nextNodes = new Set();

            for (const nodeIri of currentNodes) {
                let reachableNodes;
                
                if (isTransitive) {
                    reachableNodes = await this._getTransitiveRelated(nodeIri, ontology, baseRelation, directChild && isLastStep);
                } else {
                    reachableNodes = await this._getDirectlyRelated(nodeIri, ontology, baseRelation);
                }

                reachableNodes.forEach(node => nextNodes.add(node));
            }

            currentNodes = nextNodes;

            // Check if we've reached any targets at this step
            if (isLastStep) {
                for (const target of targets) {
                    if (currentNodes.has(target)) {
                        logger.debug(`Found target ${target} in final step`);
                        return { found: true, target };
                    }
                }
            }

            // If no nodes found, path fails
            if (currentNodes.size === 0) {
                logger.debug(`No nodes found after relation ${relation}, path terminates`);
                break;
            }
        }

        return { found: false };
    }

    /**
     * Get all transitively related terms via a specific relation
     * @private
     * @param {string} termIri - Term IRI
     * @param {string} ontology - Ontology ID  
     * @param {string} relation - Relation IRI
     * @param {boolean} directOnly - If true, return only direct relations
     * @returns {Promise<Set>} Set of related term IRIs
     */
    async _getTransitiveRelated(termIri, ontology, relation, directOnly) {
        const cache = getCache();
        const cacheKey = keyFor(this.olsBaseUrl, 'transitive', termIri, ontology, relation, directOnly);
        
        if (cache.has(cacheKey)) {
            logger.debug(`Cache hit for transitive relation: ${relation}`);
            return new Set(cache.get(cacheKey));
        }

        let related = new Set();

        // Handle common subclass relation efficiently
        if (relation === 'rdfs:subClassOf' || relation === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
            if (directOnly) {
                related = await this._getDirectParents(termIri, ontology);
            } else {
                related = await this._getAllAncestors(termIri, ontology);
            }
        } else {
            // For other relations, implement iterative expansion
            related = await this._expandRelationIteratively(termIri, ontology, relation, directOnly);
        }

        // Cache the result
        cache.set(cacheKey, Array.from(related));
        return related;
    }

    /**
     * Get directly related terms via a specific relation
     * @private
     * @param {string} termIri - Term IRI
     * @param {string} ontology - Ontology ID
     * @param {string} relation - Relation IRI
     * @returns {Promise<Set>} Set of related term IRIs
     */
    async _getDirectlyRelated(termIri, ontology, relation) {
        // Handle specific relation types
        if (relation === 'rdf:type' || relation === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
            return await this._getInstanceTypes(termIri, ontology);
        } else if (relation === 'rdfs:subClassOf' || relation === 'http://www.w3.org/2000/01/rdf-schema#subClassOf') {
            return await this._getDirectParents(termIri, ontology);
        } else {
            // Generic relation handling
            return await this._getGenericRelated(termIri, ontology, relation);
        }
    }

    /**
     * Get all ancestor terms (superclasses) using OLS API
     * @private
     * @param {string} termIri - Term IRI
     * @param {string} ontology - Ontology ID
     * @returns {Promise<Set>} Set of ancestor IRIs
     */
    async _getAllAncestors(termIri, ontology) {
        try {
            const encodedIri = encodeURIComponent(termIri);
            const url = `${this.olsBaseUrl}api/ontologies/${ontology}/terms/${encodedIri}/hierarchicalAncestors`;
            
            logger.debug(`Fetching ancestors from: ${url}`);
            
            const response = await axios.get(url, {
                timeout: 10000,
                validateStatus: status => status >= 200 && status < 300
            });

            const ancestors = new Set();
            if (response.data && response.data._embedded && response.data._embedded.terms) {
                response.data._embedded.terms.forEach(term => {
                    if (term.iri) {
                        ancestors.add(term.iri);
                    }
                });
            }

            logger.debug(`Found ${ancestors.size} ancestors for ${termIri}`);
            return ancestors;

        } catch (error) {
            logger.warn(`Failed to fetch ancestors for ${termIri}: ${error.message}`);
            return new Set();
        }
    }

    /**
     * Get direct parent terms using OLS API
     * @private
     * @param {string} termIri - Term IRI
     * @param {string} ontology - Ontology ID
     * @returns {Promise<Set>} Set of parent IRIs
     */
    async _getDirectParents(termIri, ontology) {
        try {
            const encodedIri = encodeURIComponent(termIri);
            const url = `${this.olsBaseUrl}api/ontologies/${ontology}/terms/${encodedIri}/hierarchicalParents`;
            
            const response = await axios.get(url, {
                timeout: 10000,
                validateStatus: status => status >= 200 && status < 300
            });

            const parents = new Set();
            if (response.data && response.data._embedded && response.data._embedded.terms) {
                response.data._embedded.terms.forEach(term => {
                    if (term.iri) {
                        parents.add(term.iri);
                    }
                });
            }

            return parents;

        } catch (error) {
            logger.warn(`Failed to fetch parents for ${termIri}: ${error.message}`);
            return new Set();
        }
    }

    /**
     * Get instance types for a term (rdf:type relations)
     * @private
     * @param {string} termIri - Term IRI
     * @param {string} ontology - Ontology ID
     * @returns {Promise<Set>} Set of type IRIs
     */
    async _getInstanceTypes(termIri, ontology) {
        // For OLS, individuals typically appear as children of their classes
        // This is a simplified implementation - may need adjustment based on specific ontology structure
        logger.debug(`Getting instance types for ${termIri} (simplified implementation)`);
        return new Set(); // TODO: Implement proper instance type resolution
    }

    /**
     * Get related terms via a generic relation property
     * @private
     * @param {string} termIri - Term IRI
     * @param {string} ontology - Ontology ID
     * @param {string} relation - Relation IRI
     * @returns {Promise<Set>} Set of related IRIs
     */
    async _getGenericRelated(termIri, ontology, relation) {
        // This would require more sophisticated OLS API usage or SPARQL queries
        // For now, return empty set as most use cases focus on hierarchical relations
        logger.debug(`Generic relation ${relation} for ${termIri} - not fully implemented`);
        return new Set();
    }

    /**
     * Expand relations iteratively for transitive closure
     * @private
     * @param {string} startIri - Starting term IRI
     * @param {string} ontology - Ontology ID
     * @param {string} relation - Relation IRI
     * @param {boolean} directOnly - If true, return only direct relations
     * @returns {Promise<Set>} Set of related IRIs
     */
    async _expandRelationIteratively(startIri, ontology, relation, directOnly) {
        const visited = new Set();
        const toVisit = [startIri];
        const related = new Set();
        
        if (directOnly) {
            return await this._getDirectlyRelated(startIri, ontology, relation);
        }

        while (toVisit.length > 0) {
            const current = toVisit.shift();
            if (visited.has(current)) continue;
            
            visited.add(current);
            
            const directlyRelated = await this._getDirectlyRelated(current, ontology, relation);
            
            for (const relatedIri of directlyRelated) {
                related.add(relatedIri);
                if (!visited.has(relatedIri)) {
                    toVisit.push(relatedIri);
                }
            }
        }

        return related;
    }

    /**
     * Check if a term is a leaf node (has no children)
     * @private
     * @param {string} termIri - Term IRI
     * @param {string} ontology - Ontology ID
     * @returns {Promise<boolean>} True if term is a leaf node
     */
    async _checkIsLeafNode(termIri, ontology) {
        try {
            const encodedIri = encodeURIComponent(termIri);
            const url = `${this.olsBaseUrl}api/ontologies/${ontology}/terms/${encodedIri}/hierarchicalChildren`;
            
            const response = await axios.get(url, {
                timeout: 10000,
                validateStatus: status => status >= 200 && status < 300
            });

            // If no children found, it's a leaf node
            const hasChildren = response.data && 
                               response.data._embedded && 
                               response.data._embedded.terms && 
                               response.data._embedded.terms.length > 0;

            return !hasChildren;

        } catch (error) {
            logger.warn(`Failed to check leaf status for ${termIri}: ${error.message}`);
            // If we can't determine, assume it's not a leaf to be safe
            return false;
        }
    }
}

module.exports = RelationshipRestriction;