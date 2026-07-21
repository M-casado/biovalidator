const {logger} = require("../utils/winston");
const CustomAjvError = require("../model/custom-ajv-error");
const {default: ajv} = require("ajv");
const {
    OlsSearchClient,
    OlsResolutionError
} = require("../utils/ols_search_client");
const SecurityLimitError = require("../model/security-limit-error");
const {loadSecurityConfig} = require("../utils/security-config");

class IsChildTermOf {
    constructor(keywordName, olsSearchUrl, options = {}) {
        const constants = require('../utils/constants');
        this.keywordName = keywordName ? keywordName : "isChildTermOf";
        this.olsSearchUrl = olsSearchUrl || constants.OLS_SEARCH_URL;
        this.securityConfig = options.securityConfig || loadSecurityConfig();
        this.olsClient = new OlsSearchClient(this.olsSearchUrl, options);
    }

    configure(ajv) {
        const keywordDefinition = {
            keyword: this.keywordName,
            async: this.isAsync(),
            type: "string",
            validate: this.generateKeywordFunction(),
            errors: true,
            schemaType: "object",
            metaSchema: {
                type: "object",
                additionalProperties: false,
                required: ["parentTerm", "ontologyId"],
                properties: {
                    parentTerm: {type: "string", minLength: 1},
                    ontologyId: {type: "string", minLength: 1}
                }
            }
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
            const parentTerm = schema.parentTerm;
            const ontologyId = schema.ontologyId;

            for (const value of [data, parentTerm, ontologyId]) {
                if (typeof value === "string" && Buffer.byteLength(value) > this.securityConfig.customKeywordStringMaxBytes) {
                    throw new SecurityLimitError(
                        `An isChildTermOf value exceeded this Biovalidator deployment's ${this.securityConfig.customKeywordStringMaxBytes}-byte limit.`,
                        {
                            code: "CUSTOM_KEYWORD_STRING_LIMIT",
                            configuration: "BIOVALIDATOR_CUSTOM_KEYWORD_STRING_MAX_BYTES"
                        }
                    );
                }
            }

            if (!parentTerm || !ontologyId) {
                logger.error("Failed to resolve relationship from OLS. Missing required variable in schema isChildTermOf, required properties are: parentTerm and ontologyId");
                throw new ajv.ValidationError([
                    new CustomAjvError(
                        "isChildTermOf",
                        "Missing required variable in schema isChildTermOf, required properties are: parentTerm and ontologyId.",
                        {keyword: "isChildTermOf"}
                    )
                ]);
            }

            try {
                await this.olsClient.resolveUniqueIri(data, ["iri"], {
                    allChildrenOf: parentTerm,
                    ontology: ontologyId
                });
                logger.debug(`Returning resolved relationship from OLS: [${parentTerm}] -> [${ontologyId}]`);
                return true;
            } catch (error) {
                if (!(error instanceof OlsResolutionError)) {
                    logger.error(`OLS service failure while resolving relationship for [${data}]: ${error.message || error}`);
                    throw error;
                }

                const message = error.code === "ambiguous"
                    ? error.message
                    : `Provided term is not child of [${parentTerm}]`;
                throw new ajv.ValidationError([
                    new CustomAjvError(
                        "isChildTermOf",
                        message,
                        {keyword: "isChildTermOf"}
                    )
                ]);
            }
        }
    }
}

module.exports = IsChildTermOf;
