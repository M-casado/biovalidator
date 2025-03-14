const Ajv = require("ajv").default;
const addFormats = require("ajv-formats");
const axios = require('axios');
const AppError = require("../model/application-error");
const {getFiles, readFile} = require("../utils/file_utils");
const {isChildTermOf, isValidTerm, isValidTaxonomy} = require("../keywords");
const GraphRestriction = require("../keywords/graphRestriction");
const IsValidIdentifier = require("../keywords/isvalididentifier");
const ValidationError = require("../model/validation-error");
const {logger} = require("../utils/winston");
const NodeCache = require("node-cache");
const constants = require("../utils/constants");

const customKeywordValidators = [
    new isChildTermOf(null, constants.OLS_SEARCH_URL),
    new isValidTerm(null, constants.OLS_SEARCH_URL),
    new isValidTaxonomy(null),
    new GraphRestriction(null, constants.OLS_SEARCH_URL),
    new IsValidIdentifier()
];

class BioValidator {
    constructor(localSchemaPath) {
        this.validatorCache = new NodeCache({stdTTl: 21600, checkperiod: 3600, useClones: false});
        this.referencedSchemaCache = new NodeCache({stdTTl: 21600, checkperiod: 3600, useClones: false});
        this.ajvInstance = this._getAjvInstance(localSchemaPath);
    }

    // wrapper around _validate to process output
    validate(inputSchema, inputObject) {
        return new Promise((resolve, reject) => {
            this._validate(inputSchema, inputObject)
                .then((validationResult) => {
                        if (validationResult.length === 0) {
                            resolve([]);
                        } else {
                            let ajvErrors = [];
                            validationResult.forEach(validationError => {
                                ajvErrors.push(validationError);
                            });
                            resolve(this.convertToValidationErrors(ajvErrors));
                        }
                    }
                ).catch((error) => {
                if (error.errors) {
                    logger.error("An error occurred while running the validation: " + JSON.stringify(error))
                    reject(new AppError(error.errors));
                } else {
                    logger.error("An error occurred while running the validation: " + JSON.stringify(error));
                    reject(error);
                }
            });
        });
    }

    getCachedSchema() {
        return {
            "cachedSchema": this.validatorCache.keys(),
            "referencedSchema": this.referencedSchemaCache.keys()
        };
    }

    clearCachedSchema() {
        this.ajvInstance.removeSchema();
        this.validatorCache.flushAll();
        this.referencedSchemaCache.flushAll();
    }

    // AJV requires $async keyword in schemas if they use any of async custom defined keywords.
    // We populate all schemas/defs with $async as a workaround to avoid users manually entering $async in schemas.
    _insertAsyncToSchemasAndDefs(inputSchema) {
        // If it's the known meta-schema ID, skip
        if (typeof inputSchema.$schema === "string") {
            if (inputSchema.$schema.startsWith("http://json-schema.org/draft")
                || inputSchema.$schema.startsWith("https://json-schema.org/draft")) {
                return;
            }
        }

        inputSchema["$async"] = true;
        if (inputSchema.hasOwnProperty("definitions")) {
            let defs = Object.keys(inputSchema.definitions);
            for (let x = 0; x < defs.length; x++) {
                inputSchema.definitions[defs[x]]["$async"] = true;
            }
        }
    }

    _validate(inputSchema, inputObject) {
        this._insertAsyncToSchemasAndDefs(inputSchema);

        return new Promise((resolve, reject) => {
            const compiledSchemaPromise = this.getValidationFunction(inputSchema);

            compiledSchemaPromise.then((validate) => {
                Promise.resolve(validate(inputObject))
                    .then((data) => {
                            if (validate.errors) {
                                resolve(validate.errors);
                            } else {
                                resolve([]);
                            }
                        }
                    ).catch((err) => {
                    if (!(err instanceof Ajv.ValidationError)) {
                        logger.error("An error occurred while running the validation. " + err);
                        reject(new AppError("An error occurred while running the validation. " + err));
                    } else {
                        logger.info("Validation failed with errors: " + this.ajvInstance.errorsText(err.errors, {dataVar: inputObject.alias}));
                        resolve(err.errors);
                    }
                });
            }).catch((err) => {
                logger.error("Failed to compile schema: " + JSON.stringify(err));
                reject(new AppError("Failed to compile schema: " + JSON.stringify(err)));
            });
        });
    }

    convertToValidationErrors(ajvErrorObjects) {
        let localErrors = [];
        ajvErrorObjects.forEach((errorObject) => {
            let tempValError = new ValidationError(errorObject);
            let index = localErrors.findIndex(valError => (valError.dataPath === tempValError.dataPath));

            if (index !== -1) {
                localErrors[index].errors.push(tempValError.errors[0]);
            } else {
                localErrors.push(tempValError);
            }
        });
        return localErrors;
    }

    getValidationFunction(inputSchema) {
        const schemaId = inputSchema['$id'];
        if (this.validatorCache.has(schemaId)) {
            logger.info("Returning compiled schema from cache, $id: " + schemaId);
            return Promise.resolve(this.validatorCache.get(schemaId));
        } else {
            const compiledSchemaPromise = this.ajvInstance.compileAsync(inputSchema);
            if (schemaId) {
                logger.info("Saving compiled schema in cache, $id: " + schemaId);
                this.validatorCache.set(schemaId, compiledSchemaPromise);
            } else {
                logger.warn("Compiling schema with empty schema $id. Schema will not be cached.");
            }
            return Promise.resolve(compiledSchemaPromise);
        }
    }

    _getAjvInstance(localSchemaPath) {
        const ajvInstance = new Ajv({
            allErrors: true,
            strict: false,
            loadSchema: this._resolveReference(),
            $data: true,   // for older draft usage
            next: true     // helps with 2019 features
        });
        
        addFormats(ajvInstance);
        require("ajv-errors")(ajvInstance)

        this._addCustomKeywordValidators(ajvInstance);
        this._preCompileLocalSchemas(ajvInstance, localSchemaPath);

        return ajvInstance
    }

    _resolveReference() {
        return (uri) => {
            // skip if it's an official meta-schema
            if (uri.startsWith("http://json-schema.org/draft") 
                || uri.startsWith("https://json-schema.org/draft")) {
                logger.debug(`Skipping meta-schema fetch: ${uri}`);
                return Promise.resolve({});
            }
            if (this.referencedSchemaCache.has(uri)) {
                logger.info("Returning referenced schema from cache: " + uri);
                return Promise.resolve(this.referencedSchemaCache.get(uri));
            } else {
                return new Promise((resolve, reject) => {
                    axios({method: "GET", url: uri, responseType: 'json'})
                        .then(resp => {
                            logger.info("Returning referenced schema from network : " + uri);
                            const loadedSchema = resp.data;
                            this._insertAsyncToSchemasAndDefs(loadedSchema);
                            this.referencedSchemaCache.set(uri, loadedSchema);
                            resolve(loadedSchema);
                        }).catch(err => {
                        logger.error("Failed to retrieve referenced schema: " + uri + ", " + JSON.stringify(err))
                        reject(new AppError("Failed to resolve $ref: " + uri + ", status: " + err.statusCode));
                    });
                });
            }
        };
    }

    _addCustomKeywordValidators(ajvInstance) {
        customKeywordValidators.forEach(customKeywordValidator => {
            ajvInstance = customKeywordValidator.configure(ajvInstance);
        });

        logger.info("Custom keywords successfully added. Number of custom keywords: " + customKeywordValidators.length);
        return ajvInstance;
    }

    _preCompileLocalSchemas(ajv, localSchemaPath) {
        if (localSchemaPath) {
            logger.info("Compiling local schema from: " + localSchemaPath)
            let schemaFiles = getFiles(localSchemaPath);
            for (let file of schemaFiles) {
                let schema = readFile(file);
                this._insertAsyncToSchemasAndDefs(schema);
                ajv.getSchema(schema["$id"] || ajv.compile(schema)); // add to AJV cache if not already present
                this.referencedSchemaCache.set(schema["$id"], schema);
                logger.info("Adding compiled local schema to cache: " + schema["$id"])
            }
        }
    }
}

module.exports = BioValidator;
