const {logger} = require("../utils/winston");
const CustomAjvError = require("../model/custom-ajv-error");
const {default: ajv} = require("ajv");
const {
    OlsSearchClient,
    OlsResolutionError
} = require("../utils/ols_search_client");

class IsValidTerm {
    constructor(keywordName, olsSearchUrl) {
        const constants = require('../utils/constants');
        this.keywordName = keywordName ? keywordName : "isValidTerm";
        this.olsSearchUrl = olsSearchUrl || constants.OLS_SEARCH_URL;
        this.olsClient = new OlsSearchClient(this.olsSearchUrl);
    }

    configure(ajv) {
        const keywordDefinition = {
            keyword: this.keywordName,
            async: this.isAsync(),
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

    generateKeywordFunction() {
        return async (schema, data) => {
            if (!schema) {
                logger.warn(`Trying to work with empty schema. Why are we here : [${schema}]`);
                return true;
            }

            try {
                await this.olsClient.resolveUniqueIri(data, ["iri"]);
                logger.debug(`Returning resolved term from OLS: [${data}]`);
                return true;
            } catch (error) {
                if (!(error instanceof OlsResolutionError)) {
                    logger.error(`OLS service failure while validating term [${data}]: ${error.message || error}`);
                    throw error;
                }

                const message = error.code === "ambiguous"
                    ? error.message
                    : `provided term does not exist in OLS: [${data}]`;
                logger.warn(`Failed to resolve term from OLS: ${message}`);
                throw new ajv.ValidationError([
                    new CustomAjvError(
                        "isValidTerm",
                        message,
                        {keyword: "isValidTerm"}
                    )
                ]);
            }
        };
    }
}

module.exports = IsValidTerm;
