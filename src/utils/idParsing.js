const axios = require('axios');
const { logger } = require('./winston');
const qs = require('qs');

// Constants
const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Valid identifier format requirements
 * @readonly
 * @enum {string}
 */
const IdFormat = {
    ANY: 'ANY',
    CURIE: 'CURIE',
    IRI: 'IRI'
};

/**
 * Types of ontology entities that can be identified
 * @readonly
 * @enum {string}
 */
const EntityType = {
    CLASS: 'class',
    INDIVIDUAL: 'individual',
    PROPERTY: 'property',
    UNKNOWN: 'unknown'
};

class IdentifierParser {
    /**
     * Create an identifier parser
     * @param {string} olsBaseUrl - Base URL for OLS API
     */
    constructor(olsBaseUrl) {
        this.olsBaseUrl = olsBaseUrl.endsWith('/') ? olsBaseUrl : olsBaseUrl + '/';
        this.cache = new Map();
        
        // Static patterns for identifier format detection
        this.IRI_PATTERN = /^https?:\/\/.+/i;
        this.CURIE_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*):([A-Za-z0-9_.-]+)$/;
        this.SHORT_FORM_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)_([A-Za-z0-9_.-]+)$/;
    }

    /**
     * Parse and resolve an identifier to its canonical IRI form
     * Parse and resolve an identifier to its canonical form via OLS
     * @param termId - Identifier to parse (IRI, CURIE, or short form)
     * @param ontologies - List of allowed ontology IDs (e.g., ["uberon", "cl"])
     * @param options - Additional parsing options:
     *   - cacheResults: Whether to cache OLS responses (default: false)
     *   - idFormat: Required format (ANY|CURIE|IRI) (default: ANY)
     *   - allowObsolete: Whether to accept obsolete terms (default: true)
     *   - timeout: Request timeout in ms (default: 10000)
     * @throws Error if identifier is invalid, not found, or obsolete when not allowed
     */
    async parseIdentifier(termId, ontologies, options = {}) {
        if (!termId) {
            throw new Error('Term identifier cannot be empty');
        }

        // Validate ontologies parameter
        if (!Array.isArray(ontologies) || ontologies.length === 0) {
            throw new Error('At least one ontology must be provided');
        }

        // Check format requirements early
        const format = options.idFormat || IdFormat.ANY;
        if (format !== IdFormat.ANY) {
            if (format === IdFormat.CURIE && !this.isCurie(termId)) {
                throw new Error('Identifier must be in CURIE format (e.g., UBERON:0000955)');
            }
            if (format === IdFormat.IRI && !this.isIri(termId)) {
                throw new Error('Identifier must be an IRI (e.g., http://purl.obolibrary.org/obo/UBERON_0000955)');
            }
        }

        logger.debug(`Parsing identifier: ${termId} for ontologies: ${ontologies.join(', ')}`);

        // Normalize and sort ontology IDs for consistent cache keys
        const normalizedOntologies = ontologies
            .map(ont => ont.toLowerCase().replace(/^obo:/, ''))
            .sort();

        // Check cache first if enabled - include OLS base URL to avoid collisions
        const cacheKey = `${this.olsBaseUrl}|${termId}:${normalizedOntologies.join(',')}`;
        if (options.cacheResults && this.cache.has(cacheKey)) {
            logger.debug(`Cache hit for term: ${termId}`);
            const cached = this.cache.get(cacheKey);
            
            // Re-apply obsolescence policy even for cached terms
            if (cached.isObsolete && options.allowObsolete === false) {
                const message = `Term ${termId} is obsolete${cached.replacedBy ? `, replaced by: ${cached.replacedBy}` : ''}`;
                logger.warn(message);
                throw new Error(message);
            }
            
            return cached;
        }

        // Build query parameters - use array for proper ontology parameter serialization
        const queryParams = {
            ontology: normalizedOntologies
        };

        // Determine identifier type and set appropriate query
        if (this.IRI_PATTERN.test(termId)) {
            queryParams.iri = termId; // Let axios handle URL encoding
        } else if (this.CURIE_PATTERN.test(termId)) {
            queryParams.obo_id = termId;
        } else if (this.SHORT_FORM_PATTERN.test(termId)) {
            queryParams.short_form = termId;
        } else {
            throw new Error(
                'Invalid identifier format: must be an IRI, CURIE (prefix:localPart), or OLS short form (prefix_localPart)'
            );
        }

        try {
            const response = await axios.get(`${this.olsBaseUrl}api/terms`, {
                params: queryParams,
                validateStatus: status => status >= 200 && status < 300, // Accept any 2xx response
                timeout: options.timeout || DEFAULT_TIMEOUT,
                paramsSerializer: {
                    serialize: params => qs.stringify(params, { arrayFormat: 'repeat' })
                }
            });
            
            // Handle potential 204 No Content or other empty success responses
            if (!response.data || response.status === 204) {
                logger.warn(`No content in OLS response for term: ${termId}`);
                throw new Error(`Term '${termId}' not found in ontologies: ${normalizedOntologies.join(', ')}`);
            }

            // Handle OLS4 embedded response structure
            const responseData = response.data?._embedded?.terms;
            if (!Array.isArray(responseData)) {
                logger.error(`Invalid OLS response structure for term: ${termId}`);
                throw new Error('Invalid response from OLS API - missing embedded terms');
            }

            if (responseData.length === 0) {
                logger.warn(`No terms found for: ${termId}`);
                throw new Error(`Term '${termId}' not found in ontologies: ${normalizedOntologies.join(', ')}`);
            }

            let term;
            if (responseData.length > 1 && queryParams.iri) {
                // For IRI queries, try to find exact match first
                term = responseData.find(t => t.iri === termId);
                if (!term) {
                    logger.warn(`Multiple terms found for IRI: ${termId}, no exact match. Using first result.`);
                    term = responseData[0];
                }
            } else if (responseData.length > 1) {
                logger.warn(`Multiple terms found for: ${termId}. Using first match.`);
                term = responseData[0];
            } else {
                term = responseData[0];
            }

            // Extract and validate required fields
            const resolved = {
                iri: term.iri,
                ontology: term.ontology_name,
                shortForm: term.short_form || this._generateShortForm(term.iri),
                label: term.label || null,
                isObsolete: term.is_obsolete || false,
                type: this._determineEntityType(term)
            };

            // Handle obsolete terms
            if (resolved.isObsolete) {
                const message = term.term_replaced_by 
                    ? `Term ${termId} is obsolete, replaced by: ${term.term_replaced_by}`
                    : `Term ${termId} is obsolete with no replacement`;
                    
                logger.warn(message);
                
                if (term.term_replaced_by) {
                    resolved.replacedBy = term.term_replaced_by;
                }
                
                if (options.allowObsolete === false) {
                    throw new Error(message);
                }
            }

            // Validate the resolved ontology is in our allowed list
            // Prefer ontologyId/ontology_prefix over ontology_name for stricter matching
            const termOntology = term.ontologyId || term.ontology_prefix || term.ontology_name;
            if (!termOntology || !normalizedOntologies.includes(termOntology.toLowerCase())) {
                logger.error(
                    `Term ${termId} found in ontology ${termOntology || 'unknown'} but restricted to: ${normalizedOntologies.join(', ')}`
                );
                throw new Error(
                    `Term ${termId} found in ontology ${termOntology || 'unknown'} but only ${normalizedOntologies.join(', ')} allowed`
                );
            }
            
            // Store the actual matched ontology ID in the result
            resolved.ontology = termOntology;

            // Cache if enabled
            if (options.cacheResults) {
                this.cache.set(cacheKey, resolved);
                logger.debug(`Cached term: ${termId}`);
            }

            return resolved;

        } catch (error) {
            if (error.response) {
                logger.error(`OLS API error for term ${termId}: ${error.response.status}`);
                throw new Error(
                    `OLS API error: ${error.response.data?.message || error.message}`
                );
            }
            if (error.code === 'ECONNABORTED') {
                throw new Error(`OLS API request timed out after ${options.timeout || DEFAULT_TIMEOUT}ms`);
            }
            throw error; // Re-throw unexpected errors
        }
    }

    /**
     * Clear the identifier resolution cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Test if a string matches the CURIE format
     * @param {string} id - The identifier to test
     * @returns {boolean} True if the identifier is a valid CURIE
     */
    isCurie(id) {
        return this.CURIE_PATTERN.test(id);
    }

    /**
     * Test if a string is an IRI
     * @param {string} id - The identifier to test
     * @returns {boolean} True if the identifier is a valid IRI
     */
    isIri(id) {
        return this.IRI_PATTERN.test(id);
    }

    /**
     * Test if a string matches the OLS short form format
     * @param {string} id - The identifier to test
     * @returns {boolean} True if the identifier is a valid short form
     */
    isShortForm(id) {
        return this.SHORT_FORM_PATTERN.test(id);
    }

    /**
     * Determine the type of entity from OLS metadata
     * @private
     * @param {Object} term - The term object from OLS
     * @returns {string} The entity type
     */
    _determineEntityType(term) {
        if (!term.type) {
            logger.debug('No type information in OLS term response');
            return EntityType.UNKNOWN;
        }

        // Handle both string and array types from OLS
        const types = Array.isArray(term.type) 
            ? term.type 
            : [term.type];

        const normalized = types.map(t => String(t).toLowerCase());
        
        if (normalized.includes('class')) return EntityType.CLASS;
        if (normalized.includes('named individual') || normalized.includes('individual')) return EntityType.INDIVIDUAL;
        if (normalized.some(t => (
            t === 'property' || t === 'object property' || t === 'data property' || t === 'annotation property'
        ))) return EntityType.PROPERTY;
        
        logger.debug(`Unknown entity type(s) from OLS: ${types.join(', ')}`);
        return EntityType.UNKNOWN;
    }

    /**
     * Generate a short form from an IRI as fallback, following OBO patterns
     * @private
     * @param {string} iri - The IRI to generate a short form for
     * @returns {string} The generated short form
     */
    _generateShortForm(iri) {
        try {
            // Try to extract OBO-style identifier first
            const oboMatch = iri.match(/.*\/([A-Za-z]+)_(\d+)$/);
            if (oboMatch) {
                return `${oboMatch[1]}_${oboMatch[2]}`; // e.g., UBERON_0000955
            }

            // Fallback: use URL parsing for non-OBO IRIs
            const url = new URL(iri);
            const lastSegment = url.pathname.split('/').pop() || '';
            
            // If segment contains a recognizable prefix, use it
            const prefixMatch = lastSegment.match(/^([A-Za-z]+)[#_](.+)$/);
            if (prefixMatch) {
                return `${prefixMatch[1]}_${prefixMatch[2]}`;
            }

            // Last resort: sanitize the whole segment
            return lastSegment.replace(/[^A-Za-z0-9_.-]/g, '_');
        } catch (error) {
            logger.warn(`Failed to generate short form for IRI: ${iri}`);
            return iri.split(/[/#]/).pop() || iri;
        }
    }
}

module.exports = {
    IdentifierParser,
    EntityType,
    IdFormat
};
