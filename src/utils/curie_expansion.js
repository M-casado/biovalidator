const {OlsSearchClient} = require("./ols_search_client");

class CurieExpansion {
    constructor(olsSearchUrl) {
        const constants = require('../utils/constants');
        this.olsSearchUrl = olsSearchUrl || constants.OLS_SEARCH_URL;
        this.olsClient = new OlsSearchClient(this.olsSearchUrl);
    }

    static isCurie(term) {
        let curie = true;
        if (term.split(":").length !== 2 || term.includes("http")) {
            curie = false;
        }
        return curie;
    }

    async expandCurie(term) {
        return this.olsClient.resolveUniqueIri(term, ["obo_id"]);
    }
}

module.exports = CurieExpansion;
