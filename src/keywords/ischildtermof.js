const Ajv = require("ajv").default;
const axios = require('axios');
const {logger} = require("../utils/winston");
const CustomAjvError = require("../model/custom-ajv-error");
const {default: ajv} = require("ajv");
const RelationshipRestriction = require("./relationshipRestriction");

class IsChildTermOf {
    constructor(keywordName, olsSearchUrl) {
        this.keywordName = keywordName ? keywordName : "isChildTermOf";
        this.olsSearchUrl = olsSearchUrl;
        this.relationshipRestriction = new RelationshipRestriction("_internal_relationship", olsSearchUrl?.replace('/api/search?q=', '/'));
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
            try {
                // Validate required fields for isChildTermOf
                if (!schema.parentTerm || !schema.ontologyId) {
                    const error = new CustomAjvError(
                        "isChildTermOf",
                        "Missing required variable in schema isChildTermOf, required properties are: parentTerm and ontologyId.",
                        {keyword: "isChildTermOf"}
                    );
                    throw new Ajv.ValidationError([error]);
                }

                // Add deprecation warning
                logger.warn("isChildTermOf keyword is deprecated. Please use relationshipRestriction instead for new schemas.");

                // Convert isChildTermOf schema to relationshipRestriction format
                const relationshipSchema = {
                    ontologies: [schema.ontologyId],
                    targets: [schema.parentTerm],
                    relationType: ["rdfs:subClassOf*"],
                    includeSelf: false, // isChildTermOf traditionally doesn't include self
                    allowObsolete: false,
                    allowImported: true,
                    directChild: false,
                    leafNode: false,
                    idFormat: "ANY"
                };

                logger.debug(`IsChildTermOf delegating to RelationshipRestriction for term: ${data}`);

                // Use the relationshipRestriction validation function
                const relationshipValidateFunction = this.relationshipRestriction.generateKeywordFunction();
                
                try {
                    const result = await relationshipValidateFunction(relationshipSchema, data);
                    return result;
                } catch (error) {
                    // Convert relationshipRestriction errors to isChildTermOf format
                    if (error instanceof ajv.ValidationError) {
                        const isChildTermOfErrors = error.errors.map(err => {
                            // Convert the error message to match isChildTermOf expectations
                            let message = err.message || err.toString();
                            
                            // Handle various error types that should be converted to "not child of"
                            if (message.includes("does not satisfy relationship") ||
                                message.includes("OLS API error") ||
                                message.includes("found in ontology") ||
                                message.includes("not found") ||
                                message.includes("Failed to parse identifier")) {
                                message = `Provided term is not child of [${schema.parentTerm}]`;
                            }
                            
                            return new CustomAjvError("isChildTermOf", message, {keyword: "isChildTermOf"});
                        });
                        throw new ajv.ValidationError(isChildTermOfErrors);
                    }
                    throw error;
                }

            } catch (error) {
                if (error instanceof ajv.ValidationError) {
                    throw error;
                }
                logger.error(`IsChildTermOf validation error: ${error.message}`);
                const customError = new CustomAjvError(
                    "isChildTermOf", 
                    "Something went wrong while validating term, try again." + error.message,
                    {keyword: "isChildTermOf"}
                );
                throw new Ajv.ValidationError([customError]);
            }
        };
    }
}

module.exports = IsChildTermOf;
