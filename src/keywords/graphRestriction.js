const CurieExpansion = require("../utils/curie_expansion");
const ajv = require("ajv").default;
const CustomAjvError = require("../model/custom-ajv-error");
const {logger} = require("../utils/winston");
const {
    OlsSearchClient,
    OlsResolutionError
} = require("../utils/ols_search_client");

const SUPPORTED_QUERY_FIELDS = new Set(["obo_id", "label"]);

class GraphRestriction {
    constructor(keywordName, olsSearchUrl) {
        const constants = require('../utils/constants');
        this.keywordName = keywordName ? keywordName : "graphRestriction";
        this.olsSearchUrl = olsSearchUrl || constants.OLS_SEARCH_URL;
        this.olsClient = new OlsSearchClient(this.olsSearchUrl);
    }

    /**
     *
     * Given an AJV validator, returns the validator with the graph-restriction keyword applied
     *
     * @param ajv
     */
    configure(ajv) {
        const keywordDefinition = {
            keyword: this.keywordName,
            async: GraphRestriction._isAsync(),
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
        return GraphRestriction._isAsync();
    }

    static _isAsync() {
        return true;
    }

    generateKeywordFunction() {
        const curieExpansion = new CurieExpansion(this.olsSearchUrl);

        const callCurieExpansion = (terms) => {
            let expanded = terms.map((t) => {
                if (CurieExpansion.isCurie(t)) {
                    return curieExpansion.expandCurie(t);
                } else {
                    return t
                }
            });

            return Promise.all(expanded);
        };

        const generateErrorObject = (message) => {
            return new CustomAjvError("graphRestriction", message, {});
        };

        return async (schema, data) => {
            const parentTerms = schema.classes;
            const ontologyIds = schema.ontologies;
            const queryFields = schema.queryFields || ["obo_id"];

            if (!parentTerms || !ontologyIds) {
                throw new ajv.ValidationError([
                    generateErrorObject(
                        "Missing required variable in schema graphRestriction, required properties are: classes and ontologies."
                    )
                ]);
            }
            if (!Array.isArray(queryFields) || queryFields.length === 0 ||
                queryFields.some((field) => !SUPPORTED_QUERY_FIELDS.has(field))) {
                throw new ajv.ValidationError([
                    generateErrorObject(
                        "Invalid graphRestriction queryFields. Supported fields are: obo_id, label."
                    )
                ]);
            }

            if (schema.includeSelf === true && parentTerms.includes(data)) {
                return data;
            }

            let parentIris;
            try {
                parentIris = await callCurieExpansion(parentTerms);
            } catch (error) {
                if (error instanceof OlsResolutionError) {
                    throw new ajv.ValidationError([generateErrorObject(error.message)]);
                }
                logger.error(`OLS service failure while expanding graphRestriction classes: ${error.message || error}`);
                throw error;
            }

            const parentTerm = parentIris.join(",");
            const ontologyId = ontologyIds.join(",").replace(/obo:/g, "");

            try {
                await this.olsClient.resolveUniqueIri(data, queryFields, {
                    allChildrenOf: parentTerm,
                    ontology: ontologyId
                });
                logger.debug(`Returning resolved term from OLS: [${data}]`);
                return true;
            } catch (error) {
                if (!(error instanceof OlsResolutionError)) {
                    logger.error(`OLS service failure while evaluating graphRestriction for [${data}]: ${error.message || error}`);
                    throw error;
                }

                const message = error.code === "ambiguous"
                    ? error.message
                    : `Provided term is not child of [${parentTerm}]`;
                throw new ajv.ValidationError([generateErrorObject(message)]);
            }
        };

    }
}

module.exports = GraphRestriction;
