const CurieExpansion = require("../utils/curie_expansion");
const Ajv = require("ajv");
const axios = require('axios');
const CustomAjvError = require("../model/custom-ajv-error");
const {logger} = require("../utils/winston");
const NodeCache = require("node-cache");
const relationshipRestriction = require("./relationshipRestriction");

class GraphRestriction {
    constructor(keywordName, olsSearchUrl) {
        this.keywordName = keywordName ? keywordName : "graphRestriction";
        this.olsSearchUrl = olsSearchUrl;
        // Keep a reference to the keyword object; no constructor call
        this.relationshipRestriction = relationshipRestriction;
    }

    configure(ajv) {
        // Don't register the keyword here anymore since it's handled in index.js
        return ajv;
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
                    throw new Ajv.ValidationError([
                        generateErrorObject("Missing required variable in schema graphRestriction, required properties are: classes and ontologies.")
                    ]);
                }

                // Convert graphRestriction schema to relationshipRestriction format
                const relationshipSchema = {
                    ontologies: schema.ontologies,
                    targets: schema.classes,
                    relationType: ["rdfs:subClassOf*"],
                    includeSelf: schema.includeSelf || false,
                    allowObsolete: false,
                    allowImported: true,
                    idFormat: "ANY"
                };

                logger.debug(`GraphRestriction delegating to RelationshipRestriction for term: ${data}`);

                // Compile RR and validate data
                const rrValidate = this.relationshipRestriction.compile(relationshipSchema);
                try {
                    const ok = await rrValidate(data);
                    if (ok) return true;
                    
                    // Re-map RR errors to legacy graphRestriction message(s)
                    const rrErrors = rrValidate.errors || [];
                    const graphRestrictionErrors = rrErrors.map(err => {
                        let message = err.message || String(err);
                        if (message.includes("does not satisfy relationship")) {
                            message = `Provided term is not child of [${schema.classes.join(', ')}]`;
                        }
                        return new CustomAjvError("graphRestriction", message, {});
                    });
                    throw new Ajv.ValidationError(graphRestrictionErrors);
                } catch (error) {
                    // Convert relationshipRestriction errors to graphRestriction format
                    if (error instanceof Ajv.ValidationError) {
                        const graphRestrictionErrors = error.errors.map(err => {
                            let message = err.message || err.toString();
                            if (message.includes("does not satisfy relationship")) {
                                message = `Provided term is not child of [${schema.classes.join(', ')}]`;
                            }
                            return new CustomAjvError("graphRestriction", message, {});
                        });
                        throw new Ajv.ValidationError(graphRestrictionErrors);
                    }
                    throw error;
                }

            } catch (error) {
                if (error instanceof Ajv.ValidationError) {
                    throw error;
                }
                logger.error(`GraphRestriction validation error: ${error.message}`);
                throw new Ajv.ValidationError([generateErrorObject("Something went wrong while validating term, try again.")]);
            }
        };
    }
}

module.exports = GraphRestriction;
