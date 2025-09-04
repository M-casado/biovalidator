const { logger } = require('./winston');
const { getCache, keyFor, clearCache: clearSharedCache } = require('./cache');
const OLS4Client = require('../ols/ols4Client');

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
        this.olsClient = new OLS4Client(this.olsBaseUrl);
        
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
        const cache = getCache();
        const cacheKey = keyFor(this.olsBaseUrl, 'parse', termId, normalizedOntologies.join(','));
        if (options.cacheResults && cache.has(cacheKey)) {
            logger.debug(`Cache hit for term: ${termId}`);
            const cached = cache.get(cacheKey);
            
            // Re-apply obsolescence policy even for cached terms
            if (cached.isObsolete && options.allowObsolete === false) {
                const message = `Term ${termId} is obsolete${cached.replacedBy ? `, replaced by: ${cached.replacedBy}` : ''}`;
                logger.warn(message);
                throw new Error(message);
            }
            
            return cached;
        }

        // Convert identifier to IRI if needed for OLS4Client.getTerm()
        let targetIri = termId;
        
        if (this.CURIE_PATTERN.test(termId)) {
            // Convert CURIE to IRI using OBO pattern
            const [prefix, localPart] = termId.split(':');
            targetIri = `http://purl.obolibrary.org/obo/${prefix}_${localPart}`;
        } else if (this.SHORT_FORM_PATTERN.test(termId)) {
            // Convert short form to IRI using OBO pattern
            const [prefix, localPart] = termId.split('_');
            targetIri = `http://purl.obolibrary.org/obo/${prefix}_${localPart}`;
        } else if (!this.IRI_PATTERN.test(termId)) {
            throw new Error(
                'Invalid identifier format: must be an IRI, CURIE (prefix:localPart), or OLS short form (prefix_localPart)'
            );
        }

        // Try each ontology in sequence until we find the term
        let lastError;
        for (const ontologyId of normalizedOntologies) {
            try {
                logger.debug(`Trying to find term ${termId} (${targetIri}) in ontology: ${ontologyId}`);
                
                const term = await this.olsClient.getTerm({
                    ontologyId: ontologyId,
                    iri: targetIri
                });

                // Build the resolved result in the same format as before
                const resolved = {
                    iri: term.iri,
                    ontology: term.ontologyId,
                    shortForm: this._generateShortForm(term.iri),
                    label: term.label,
                    isObsolete: term.is_obsolete || false,
                    type: EntityType.CLASS // OLS4Client doesn't provide type info, assume class
                };

                // Handle obsolete terms
                if (resolved.isObsolete) {
                    const message = `Term ${termId} is obsolete with no replacement`;
                    logger.warn(message);
                    
                    if (options.allowObsolete === false) {
                        throw new Error(message);
                    }
                }

                // Cache if enabled
                if (options.cacheResults) {
                    cache.set(cacheKey, resolved);
                    logger.debug(`Cached term: ${termId}`);
                }

                logger.debug(`Successfully found term ${termId} in ontology: ${ontologyId}`);
                return resolved;

            } catch (error) {
                lastError = error;
                logger.debug(`Term ${termId} not found in ontology ${ontologyId}: ${error.message}`);
                // Continue to next ontology
            }
        }

        // If we get here, the term wasn't found in any ontology
        throw new Error(`Term '${termId}' not found in ontologies: ${normalizedOntologies.join(', ')}. Last error: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * Clear the identifier resolution cache
     */
    clearCache() {
        clearSharedCache();
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
