const Ajv = require("ajv").default;
const axios = require("axios");
const {logger} = require("../utils/winston");
const CustomAjvError = require("../model/custom-ajv-error");
const {default: ajv} = require("ajv");

const taxonomySearchUrl = "https://www.ebi.ac.uk/ena/taxonomy/rest/any-name";
const NoResults = "No results.";

class IsValidTaxonomy {
    constructor(keywordName) {
        this.keywordName = keywordName ? keywordName : "isValidTaxonomy";
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
        const { enaTaxonomyCache } = require('./shared-cache');
        return (schema, data) => {
            return new Promise((resolve, reject) => {
                if (schema) {
                    let errors = [];

                    const taxonomyExpression = data;
                    const encodedTaxonomyUri = encodeURIComponent(taxonomyExpression);
                    const url = [taxonomySearchUrl, encodedTaxonomyUri].join("/");

                    logger.log("debug", `Looking for taxonomy [${taxonomyExpression}] with ENA taxonomy validator.`);

                    const cacheHit = enaTaxonomyCache.has(url);
                    let taxonomyPromise;
                    if (cacheHit) {
                        taxonomyPromise = Promise.resolve(enaTaxonomyCache.get(url));
                        logger.debug("Returning cached response for ENA taxonomy request: " + url);
                    } else {
                        taxonomyPromise = axios({method: "GET", url: url, responseType: 'json'});
                    }

                    taxonomyPromise
                        .then((response) => {
                            if (response.status === 200 && response.data) {
                                if (!cacheHit) {
                                    // Store successful upstream responses without extending TTL on cache hits.
                                    enaTaxonomyCache.set(url, response);
                                }
                                let numFound = response.data.length;

                                if (numFound === 1 && response.data[0]["taxId"] && response.data[0]["submittable"] === "true") {
                                    logger.debug(`Returning resolved term from ENA taxonomy: [${taxonomyExpression}]`);
                                } else if (numFound === 0) {
                                    generateNotExistsErrorMessage()
                                } else {
                                    errors.push(new CustomAjvError(
                                        "isValidTaxonomy", `Failed to resolve taxonomy. Something went wrong while validating the given taxonomy expression [${taxonomyExpression}], try again.`,
                                        {keyword: "isValidTaxonomy"})
                                    );
                                }
                            } else {
                                generateNotExistsErrorMessage();
                            }

                            function generateNotExistsErrorMessage() {
                                logger.warn(`Failed to resolve taxonomy. Term not present: [${taxonomyExpression}]`);
                                errors.push(new CustomAjvError(
                                    "isValidTaxonomy", `provided taxonomy expression does not exist: [${taxonomyExpression}]`, {keyword: "isValidTaxonomy"})
                                );
                            }

                        })
                        .catch((error) => {
                            logger.error(`Failed to resolve taxonomy. [${error.response && error.response.data && error.response.data.errorMessage ? error.response.data.errorMessage : error}]`);
                            errors.push(new CustomAjvError(
                                "isValidTaxonomy", "Something went wrong while validating term, try again." + (error.response && error.response.data && error.response.data.errorMessage ? error.response.data.errorMessage : ''),
                                {keyword: "isValidTaxonomy"})
                            );
                        })
                        .finally(() => {
                            if (errors.length > 0) {
                                reject(new ajv.ValidationError(errors));
                            } else {
                                resolve(true);
                            }
                        });
                } else {
                    resolve(true);
                }
            });

        };    }
}

module.exports = IsValidTaxonomy;
