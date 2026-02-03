const Ajv = require("ajv").default;
const axios = require('axios');
const {logger} = require("../utils/winston");
const CustomAjvError = require("../model/custom-ajv-error");
const {default: ajv} = require("ajv");

class IsChildTermOf {
    constructor(keywordName, olsSearchUrl) {
        const constants = require('../utils/constants');
        this.keywordName = keywordName ? keywordName : "isChildTermOf";
        this.olsSearchUrl = olsSearchUrl || constants.OLS_SEARCH_URL;
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
        return (schema, data) => {
            return new Promise((resolve, reject) => {
                const parentTerm = schema.parentTerm;
                const ontologyId = schema.ontologyId;
                let errors = [];

                if (parentTerm && ontologyId) {
                    const termUri = encodeURIComponent(data);
                    const url = this.olsSearchUrl + termUri
                        + "&exact=true&groupField=true&allChildrenOf=" + encodeURIComponent(parentTerm)
                        + "&ontology=" + ontologyId + "&queryFields=iri";

                    logger.log("debug", `Evaluating isChildTermOf, query url: [${url}]`);
                    const { olsCache } = require('./shared-cache');
                    let olsPromise;
                    if (olsCache.has(url)) {
                        olsPromise = Promise.resolve(olsCache.get(url));
                        logger.debug("Returning cached response for OLS request: " + url);
                    } else {
                        olsPromise = axios({method: "GET", url: url, responseType: 'json'});
                    }
                    olsPromise.then((response) => {
                        olsCache.set(url, response);
                        if (response.status === 200 && response.data.response.numFound >= 1) {
                            logger.debug(`Returning resolved relationship from OLS: [${parentTerm}] -> [${ontologyId}]`);
                        } else if (response.status === 200 && response.data.response.numFound === 0) {
                            logger.warn(`Failed to resolve relationship from OLS. [${parentTerm}] is not a child of [${parentTerm}]`);
                            errors.push(
                                new CustomAjvError(
                                    "isChildTermOf", `Provided term is not child of [${parentTerm}]`,
                                    {keyword: "isChildTermOf"})
                            );
                        } else {
                            logger.error(`Failed to resolve relationship from OLS. Unknown error resolving [${parentTerm}] -> [${parentTerm}]`);
                            errors.push(new CustomAjvError(
                                "isChildTermOf", "Something went wrong while validating term, try again.",
                                {keyword: "isChildTermOf"})
                            );
                        }
                    }).catch((error) => {
                        logger.error(`Failed to resolve relationship from OLS. Unknown error resolving [${parentTerm}] -> [${parentTerm}]. [${error.response && error.response.data && error.response.data.errorMessage ? error.response.data.errorMessage : error}]`);
                        errors.push(new CustomAjvError(
                            "isChildTermOf", "Something went wrong while validating term, try again." + (error.response && error.response.data && error.response.data.errorMessage ? error.response.data.errorMessage : ''),
                            {keyword: "isChildTermOf"})
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
                    logger.error("Failed to resolve relationship from OLS. Missing required variable in schema isChildTermOf, required properties are: parentTerm and ontologyId");
                    errors.push(new CustomAjvError(
                        "isChildTermOf",
                        "Missing required variable in schema isChildTermOf, required properties are: parentTerm and ontologyId.",
                        {keyword: "isChildTermOf"})
                    );
                    reject(new Ajv.ValidationError(errors));
                }
            });
        }
    }
}

module.exports = IsChildTermOf;
