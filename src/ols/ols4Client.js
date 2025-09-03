const axios = require('axios');
const { logger } = require('../utils/winston');
const { getCache, keyFor } = require('../utils/cache');

class OLS4Client {
    /**
     * Create an OLS4 client
     * @param {string} baseUrl - Base URL for OLS4 API (default: https://www.ebi.ac.uk/ols4/)
     */
    constructor(baseUrl = 'https://www.ebi.ac.uk/ols4/') {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
        this.apiUrl = this.baseUrl + 'api/';
    }

    /**
     * Double URL encode an IRI for OLS4 path segments
     * OLS4 requires double encoding of IRIs when used in path segments:
     * 1. First encoding: : becomes %3A, / becomes %2F, etc.
     * 2. Second encoding: % becomes %25, so %3A becomes %253A
     * 
     * See OLS4 documentation: https://www.ebi.ac.uk/ols4/ols3help
     * @private
     * @param {string} iri - The IRI to encode
     * @returns {string} Double URL encoded IRI
     */
    _doubleEncodeIri(iri) {
        // First encoding: standard URL encoding
        const firstEncoded = encodeURIComponent(iri);
        // Second encoding: encode the percent signs from first encoding
        const doubleEncoded = firstEncoded.replace(/%/g, '%25');
        
        logger.debug(`IRI encoding: ${iri} -> ${firstEncoded} -> ${doubleEncoded}`);
        return doubleEncoded;
    }

    /**
     * Get term information from OLS4
     * @param {Object} params
     * @param {string} params.ontologyId - Ontology identifier (e.g., 'uberon')
     * @param {string} params.iri - Term IRI
     * @returns {Promise<Object>} Term information with iri, label, ontologyId, has_children, is_obsolete, is_defining_ontology
     */
    async getTerm({ ontologyId, iri }) {
        const cache = getCache();
        const cacheKey = keyFor(this.baseUrl, 'term', ontologyId, iri);
        
        if (cache.has(cacheKey)) {
            logger.debug(`Cache hit for getTerm: ${ontologyId}:${iri}`);
            return cache.get(cacheKey);
        }

        const encodedIri = this._doubleEncodeIri(iri);
        const url = `${this.apiUrl}ontologies/${ontologyId}/terms/${encodedIri}`;
        
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                validateStatus: status => status < 500 // Accept 4xx as non-error for better handling
            });

            if (response.status === 404) {
                throw new Error(`Term not found: ${iri} in ontology ${ontologyId}`);
            }

            if (response.status >= 400) {
                throw new Error(`OLS4 API error: ${response.status} ${response.statusText}`);
            }

            const termData = response.data;
            const result = {
                iri: termData.iri || iri,
                label: termData.label || null,
                ontologyId: ontologyId,
                has_children: termData.has_children || false,
                is_obsolete: termData.is_obsolete || false,
                is_defining_ontology: termData.is_defining_ontology || false
            };

            cache.set(cacheKey, result);
            logger.debug(`Retrieved term from OLS4: ${ontologyId}:${iri}`);
            return result;

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error('OLS4 request timeout');
            }
            if (error.response) {
                // Re-throw our custom errors for 404, etc.
                throw error;
            }
            throw new Error(`Network error connecting to OLS4: ${error.message}`);
        }
    }

    /**
     * Get direct parents (1-hop) for rdfs:subClassOf relationships
     * @param {Object} params
     * @param {string} params.ontologyId - Ontology identifier
     * @param {string} params.iri - Term IRI
     * @returns {Promise<Array>} Array of parent term objects
     */
    async getParents({ ontologyId, iri }) {
        const cache = getCache();
        const cacheKey = keyFor(this.baseUrl, 'parents', ontologyId, iri);
        
        if (cache.has(cacheKey)) {
            logger.debug(`Cache hit for getParents: ${ontologyId}:${iri}`);
            return cache.get(cacheKey);
        }

        const encodedIri = this._doubleEncodeIri(iri);
        const url = `${this.apiUrl}ontologies/${ontologyId}/terms/${encodedIri}/parents`;
        
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                validateStatus: status => status < 500
            });

            if (response.status === 404) {
                throw new Error(`Term not found for parents lookup: ${iri} in ontology ${ontologyId}`);
            }

            if (response.status >= 400) {
                throw new Error(`OLS4 API error: ${response.status} ${response.statusText}`);
            }

            // Handle OLS4 response structure
            const responseData = response.data;
            const terms = responseData._embedded?.terms || [];
            
            const result = terms.map(term => ({
                iri: term.iri,
                label: term.label || null,
                ontologyId: ontologyId,
                has_children: term.has_children || false,
                is_obsolete: term.is_obsolete || false
            }));

            cache.set(cacheKey, result);
            logger.debug(`Retrieved ${result.length} parents from OLS4: ${ontologyId}:${iri}`);
            return result;

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error('OLS4 request timeout');
            }
            if (error.response) {
                throw error;
            }
            throw new Error(`Network error connecting to OLS4: ${error.message}`);
        }
    }

    /**
     * Get direct children for a term
     * @param {Object} params
     * @param {string} params.ontologyId - Ontology identifier
     * @param {string} params.iri - Term IRI
     * @returns {Promise<Array>} Array of child term objects
     */
    async getChildren({ ontologyId, iri }) {
        const cache = getCache();
        const cacheKey = keyFor(this.baseUrl, 'children', ontologyId, iri);
        
        if (cache.has(cacheKey)) {
            logger.debug(`Cache hit for getChildren: ${ontologyId}:${iri}`);
            return cache.get(cacheKey);
        }

        const encodedIri = this._doubleEncodeIri(iri);
        const url = `${this.apiUrl}ontologies/${ontologyId}/terms/${encodedIri}/children`;
        
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                validateStatus: status => status < 500
            });

            if (response.status === 404) {
                throw new Error(`Term not found for children lookup: ${iri} in ontology ${ontologyId}`);
            }

            if (response.status >= 400) {
                throw new Error(`OLS4 API error: ${response.status} ${response.statusText}`);
            }

            const responseData = response.data;
            const terms = responseData._embedded?.terms || [];
            
            const result = terms.map(term => ({
                iri: term.iri,
                label: term.label || null,
                ontologyId: ontologyId,
                has_children: term.has_children || false,
                is_obsolete: term.is_obsolete || false
            }));

            cache.set(cacheKey, result);
            logger.debug(`Retrieved ${result.length} children from OLS4: ${ontologyId}:${iri}`);
            return result;

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error('OLS4 request timeout');
            }
            if (error.response) {
                throw error;
            }
            throw new Error(`Network error connecting to OLS4: ${error.message}`);
        }
    }

    /**
     * Get rdf:type values for an instance
     * @param {Object} params
     * @param {string} params.ontologyId - Ontology identifier
     * @param {string} params.iri - Instance IRI
     * @returns {Promise<Array>} Array of type objects
     */
    async getTypes({ ontologyId, iri }) {
        const cache = getCache();
        const cacheKey = keyFor(this.baseUrl, 'types', ontologyId, iri);
        
        if (cache.has(cacheKey)) {
            logger.debug(`Cache hit for getTypes: ${ontologyId}:${iri}`);
            return cache.get(cacheKey);
        }

        const encodedIri = this._doubleEncodeIri(iri);
        const url = `${this.apiUrl}ontologies/${ontologyId}/individuals/${encodedIri}/types`;
        
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                validateStatus: status => status < 500
            });

            if (response.status === 404) {
                throw new Error(`Individual not found for types lookup: ${iri} in ontology ${ontologyId}`);
            }

            if (response.status >= 400) {
                throw new Error(`OLS4 API error: ${response.status} ${response.statusText}`);
            }

            const responseData = response.data;
            const terms = responseData._embedded?.terms || [];
            
            const result = terms.map(term => ({
                iri: term.iri,
                label: term.label || null,
                ontologyId: ontologyId,
                has_children: term.has_children || false,
                is_obsolete: term.is_obsolete || false
            }));

            cache.set(cacheKey, result);
            logger.debug(`Retrieved ${result.length} types from OLS4: ${ontologyId}:${iri}`);
            return result;

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error('OLS4 request timeout');
            }
            if (error.response) {
                throw error;
            }
            throw new Error(`Network error connecting to OLS4: ${error.message}`);
        }
    }
}

module.exports = OLS4Client;