const CurieExpansion = require("../utils/curie_expansion");
const ajv = require("ajv").default;
const axios = require('axios');
const CustomAjvError = require("../model/custom-ajv-error");
const {logger} = require("../utils/winston");
const NodeCache = require("node-cache");
const RelationshipRestriction = require("./relationshipRestriction");

class GraphRestriction {
    constructor(keywordName, olsSearchUrl) {
        this.keywordName = keywordName ? keywordName : "graphRestriction";
        this.olsSearchUrl = olsSearchUrl;
        this.relationshipRestriction = new RelationshipRestriction("_internal_relationship", olsSearchUrl?.replace('/api/search?q=', '/'));
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
        const generateErrorObject = (message) => {
            return new CustomAjvError("graphRestriction", message, {});
        };

        return async (schema, data) => {
            try {
                // Validate required fields for graphRestriction
                if (!schema.classes || !schema.ontologies) {
                    throw new ajv.ValidationError([
                        generateErrorObject("Missing required variable in schema graphRestriction, required properties are: classes and ontologies.")
                    ]);
                }

                // Convert graphRestriction schema to relationshipRestriction format
                const relationshipSchema = {
                    ontologies: schema.ontologies,
                    targets: schema.classes,
                    relationType: ["rdfs:subClassOf*"],
                    includeSelf: schema.includeSelf || false,
                    allowObsolete: false, // graphRestriction traditionally rejects obsolete terms
                    allowImported: true, // graphRestriction traditionally allows imported terms
                    directChild: false,
                    leafNode: false,
                    idFormat: "ANY"
                };

                logger.debug(`GraphRestriction delegating to RelationshipRestriction for term: ${data}`);

                // Use the relationshipRestriction validation function
                const relationshipValidateFunction = this.relationshipRestriction.generateKeywordFunction();
                
                try {
                    const result = await relationshipValidateFunction(relationshipSchema, data);
                    return result;
                } catch (error) {
                    // Convert relationshipRestriction errors to graphRestriction format
                    if (error instanceof ajv.ValidationError) {
                        const graphRestrictionErrors = error.errors.map(err => {
                            // Convert the error message to match graphRestriction expectations
                            let message = err.message || err.toString();
                            if (message.includes("does not satisfy relationship")) {
                                message = `Provided term is not child of [${schema.classes.join(', ')}]`;
                            }
                            return new CustomAjvError("graphRestriction", message, {});
                        });
                        throw new ajv.ValidationError(graphRestrictionErrors);
                    }
                    throw error;
                }

            } catch (error) {
                if (error instanceof ajv.ValidationError) {
                    throw error;
                }
                logger.error(`GraphRestriction validation error: ${error.message}`);
                throw new ajv.ValidationError([generateErrorObject("Something went wrong while validating term, try again.")]);
            }
        };
    }
}

module.exports = GraphRestriction;
