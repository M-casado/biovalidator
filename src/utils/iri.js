/**
 * Double-encode IRI for OLS4 API endpoints
 * OLS4 requires double URL encoding for IRIs in path parameters
 * 
 * @param {string} iri - The IRI to encode
 * @returns {string} - Double-encoded IRI
 */
function doubleEncodeIri(iri) {
    // First encoding
    const firstEncoded = encodeURIComponent(iri);
    // Second encoding
    return encodeURIComponent(firstEncoded);
}

module.exports = {
    doubleEncodeIri
};