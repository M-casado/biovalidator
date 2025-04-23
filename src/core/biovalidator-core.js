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
        const sid = inputSchema["$id"] || "(no '$id')";
        logger.debug(`BioValidator.validate() called for initial schema '$id': '${sid}'`);

        return new Promise((resolve, reject) => {
            this._validate(inputSchema, inputObject)
                .then((validationResult) => {
                    if (validationResult.length === 0) {
                        resolve([]);
                    } else {
                        const ajvErrors = [...validationResult];
                        resolve(this.convertToValidationErrors(ajvErrors));
                    }
                })
                .catch((error) => {
                    logger.error(`BioValidator.validate() caught error processing schema '$id': '${sid}'. Error: ${error.message || JSON.stringify(error)}`);
                    if (error.errors) {
                        logger.error("AJV validation errors encountered: " + JSON.stringify(error.errors));
                        reject(new AppError(error.errors));
                    } else {
                        logger.error("Non-AJV error during validation: " + JSON.stringify(error));
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
        logger.info("Clearing all cached schemas and removing AJV instance schemas.");
        this.ajvInstance.removeSchema();
        this.validatorCache.flushAll();
        this.referencedSchemaCache.flushAll();
    }

    // AJV requires $async keyword in schemas if they use any of async custom defined keywords.
    // We populate all schemas/defs with $async as a workaround to avoid users manually entering $async in schemas.
    _insertAsyncToSchemasAndDefs(inputSchema) {
        const schemaIdForLog = inputSchema.$id || "[no '$id' at root]"; // Use for logging
        // If it's the known meta-schema ID, skip adding $async
        if (
            typeof inputSchema.$id === "string" &&
            (
                inputSchema.$id.startsWith("http://json-schema.org/draft") ||
                inputSchema.$id.startsWith("https://json-schema.org/draft")
            )
        ) {
            logger.debug(`Skipping "$async" injection for official meta-schema '$id': '${schemaIdForLog}'`);
            return;
        }

        if (!inputSchema.hasOwnProperty("$async")) {
            inputSchema["$async"] = true;
            logger.debug(`Auto-injected "$async": true at root for schema '$id': '${schemaIdForLog}'`);
        } else if (inputSchema.$async === true) {
            logger.debug(`Root already has "$async": '${inputSchema["$async"]}' for schema '$id': '${schemaIdForLog}'`);
        } else if (inputSchema.$async === false) {
            logger.debug(`Root already has "$async": '${inputSchema["$async"]}' ('$async' injection will be skipped for definitions) for schema '$id': '${schemaIdForLog}'`);
            return; // Don't inject if explicitly false
        }

        // Also inject into definitions/$defs if root $async is true (or missing)
        if (inputSchema.hasOwnProperty("definitions")) {
            let defs = Object.keys(inputSchema.definitions);
            for (let x = 0; x < defs.length; x++) {
                if (typeof inputSchema.definitions[defs[x]] === 'object' && inputSchema.definitions[defs[x]] !== null) {
                     inputSchema.definitions[defs[x]]["$async"] = true;
                }
            }
        } else if (inputSchema.hasOwnProperty("$defs")) { // support draft‑2019/2020 keyword ($defs)
             for (const k of Object.keys(inputSchema.$defs)) {
                if (typeof inputSchema.$defs[k] === 'object' && inputSchema.$defs[k] !== null) {
                    inputSchema.$defs[k]["$async"] = true;
                }
             }
        }
    }

    _validate(inputSchema, inputObject) {
        const schemaIdForLog = inputSchema.$id || "[no $id in schema]"; // Use for logging
        this._insertAsyncToSchemasAndDefs(inputSchema);
        // The following is useful for when doing a deep-debugging of schema issues, but too verbose otherwise
        // logger.debug("Final schema after injection:\n" + JSON.stringify(inputSchema, null, 2));

        return new Promise((resolve, reject) => {
            const compiledSchemaPromise = this.getValidationFunction(inputSchema);

            compiledSchemaPromise.then((validate) => {
                logger.info(`Successfully obtained compiled function for schema '$id': '${schemaIdForLog}'.`);
                Promise.resolve(validate(inputObject))
                    .then((data) => {
                        if (validate.errors) {
                            logger.info(`Validation finished with errors for schema '$id': '${schemaIdForLog}'.`);
                            resolve(validate.errors);
                        } else {
                           logger.info(`Validation finished successfully for schema '$id': '${schemaIdForLog}'.`);
                            resolve([]);
                        }
                    })
                    .catch((err) => {
                        if (!(err instanceof Ajv.ValidationError)) {
                            logger.error("An unexpected error occurred during data validation execution. " + (err.message || err));
                            reject(new AppError("An error occurred while running the validation. " + (err.message || err)));
                        } else {
                            logger.error("Validation failed with AJV ValidationError: " + this.ajvInstance.errorsText(err.errors, {dataVar: inputObject.alias}));
                            resolve(err.errors);
                        }
                    });
             }).catch(err => {
                 logger.error(`Failed to compile/get validation function for schema '$id': '${schemaIdForLog}'. Error: ${err.message || JSON.stringify(err)}`);
                 if (err instanceof Ajv.MissingRefError) {
                     logger.error(
                         `AJV MissingRefError (Failed to compile)` +
                         `. Missing '$ref': ${err.missingRef}'. ` +
                         `Base URI/Schema where error occurred: '${err.missingSchema || inputSchema.$id || "(root)"}'`
                     );
                 } else if (err instanceof AppError) {
                     logger.error(`AppError during compile: ${err.error || err.message || JSON.stringify(err)}`);
                 } else if (err.errors && err.errors.length) {
                     logger.error(
                         "AJV schema compilation errors:\n" +
                         err.errors
                            .map(e => ` ${e.message || JSON.stringify(e)} @ ${e.schemaPath || 'unknown path'}`)
                            .join("\n")
                     );
                 } else {
                     logger.error("Unexpected compile failure type: " + (err.stack || err));
                 }
                 reject(new AppError("Failed to compile schema. See server log for details."));
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
        if (schemaId && this.validatorCache.has(schemaId)) {
            logger.info("Returning compiled schema from validator cache, '$id': " + schemaId);
            return Promise.resolve(this.validatorCache.get(schemaId));
        }

        logger.debug(`Compiling schema '$id': ${schemaId || "(no '$id')"}. This will trigger loading of external references.`);
        const compiledSchemaPromise = this.ajvInstance.compileAsync(inputSchema);
        if (schemaId) {
            logger.info("Saving compiled schema in validator cache, '$id': " + schemaId);
            this.validatorCache.set(schemaId, compiledSchemaPromise);
        } else {
            logger.warn("Compiling schema with empty schema '$id'. Schema will not be cached in validator cache.");
        }
        return Promise.resolve(compiledSchemaPromise);
    }

    _getAjvInstance(localSchemaPath) {
        const ajvInstance = new Ajv({
            allErrors: true,
            strict: false, // Setting strict: false might hide some issues but is often needed for complex schemas. If needed, set it to 'log' or true for debugging.
            loadSchema: this._resolveReference(),
            $data: true,   // for older draft usage
        });

        addFormats(ajvInstance);
        require("ajv-errors")(ajvInstance);

        this._addCustomKeywordValidators(ajvInstance);
        this._preCompileLocalSchemas(ajvInstance, localSchemaPath);

        return ajvInstance;
    }

     _resolveReference() {
         // Ensure 'this' context is correct when loadSchema is called by Ajv
         const self = this;
         return (uri) => {
            logger.debug(`AJV requesting schema load for URI: ${uri}`);
             // skip if it's an official meta-schema
             if (
                 uri.startsWith("http://json-schema.org/draft") ||
                 uri.startsWith("https://json-schema.org/draft")
             ) {
                 logger.debug(`Skipping official meta-schema fetch: ${uri}`);
                 return Promise.resolve({});
             }
             if (self.referencedSchemaCache.has(uri)) {
                 logger.debug("Returning referenced schema from reference cache: " + uri);
                 return Promise.resolve(self.referencedSchemaCache.get(uri));
             } else {
                 logger.debug(`Attempting to fetch schema from network/local: ${uri}`);
                 return new Promise((resolve, reject) => {
                     axios({method: "GET", url: uri, responseType: 'json'})
                         .then(resp => {
                             logger.debug(`Successfully fetched schema via network: ${uri}`);
                             const loadedSchema = resp.data;
                             self._insertAsyncToSchemasAndDefs(loadedSchema);
                             self.referencedSchemaCache.set(uri, loadedSchema);
                             resolve(loadedSchema);
                         }).catch(err => {
                            // If Axios reached the server but got an HTTP error (e.g., 404, 500...), 
                            //      err.response exists, and we keep the numeric status
                            // If the request never left the host (e.g., bad domain), err.response is
                            //      undefined (?), and we label it "network/DNS/file"
                             const status = err.response ? err.response.status : "network/DNS/file";
                             logger.error(
                                 `Failed to fetch referenced schema URI: ${uri} (Status: ${status}). Error: ${err.message || err}`
                             );
                             reject(
                                 new AppError(`Failed to resolve $ref via network/DNS/file (Status: ${status}): ${uri}. Original error: ${err.message}`)
                             );
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
            logger.info("Compiling local schema from: " + localSchemaPath);
            let schemaFiles = getFiles(localSchemaPath);
            for (let file of schemaFiles) {
                let schema = readFile(file);
                this._insertAsyncToSchemasAndDefs(schema);
                ajv.getSchema(schema["$id"] || ajv.compile(schema)); // add to AJV cache if not already present
                this.referencedSchemaCache.set(schema["$id"], schema);
                logger.info("Adding compiled local schema to cache: " + schema["$id"]);
            }
        }
    }
}

module.exports = BioValidator;