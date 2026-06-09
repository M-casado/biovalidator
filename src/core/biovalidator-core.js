const Ajv = require("ajv").default;
const Ajv2019 = require("ajv/dist/2019");
const Ajv2020 = require("ajv/dist/2020");
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
        // Maintain separate AJV contexts per draft family to avoid mixing incompatible drafts
        // '2019' will handle draft-06, draft-07 and draft-2019-09
        // '2020' will handle draft-2020-12
        this.ajvContexts = {};
        this._initAjvContexts(localSchemaPath);
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

    // Returns legacy merged cache shape for backward compatibility:
    // { cachedSchema: [...], referencedSchema: [...] }
    getCachedSchema() {
        const merged = {
            cachedSchema: [],
            referencedSchema: []
        };
        for (const k of Object.keys(this.ajvContexts)) {
            merged.cachedSchema = merged.cachedSchema.concat(this.ajvContexts[k].validatorCache.keys());
            merged.referencedSchema = merged.referencedSchema.concat(this.ajvContexts[k].referencedSchemaCache.keys());
        }
        // De-dup entries while keeping order
        merged.cachedSchema = [...new Set(merged.cachedSchema)];
        merged.referencedSchema = [...new Set(merged.referencedSchema)];
        return merged;
    }

    clearCachedSchema() {
        logger.info("Clearing all cached schemas and removing AJV instance schemas.");
        for (const k of Object.keys(this.ajvContexts)) {
            try {
                this.ajvContexts[k].ajv.removeSchema();
            } catch (e) { /* ignore */ }
            this.ajvContexts[k].validatorCache.flushAll();
            this.ajvContexts[k].referencedSchemaCache.flushAll();
        }
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
            const ajvCtx = this._getAjvContextForSchema(inputSchema);
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
                            logger.error("Validation failed with AJV ValidationError: " + ajvCtx.ajv.errorsText(err.errors, {dataVar: inputObject.alias}));
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
        const ctx = this._getAjvContextForSchema(inputSchema);
        const schemaId = inputSchema['$id'];
        if (schemaId && ctx.validatorCache.has(schemaId)) {
            logger.info(`Returning compiled schema from validator cache (context ${ctx.type}), '$id': ${schemaId}`);
            return Promise.resolve(ctx.validatorCache.get(schemaId));
        }

        logger.debug(`Compiling schema '$id': ${schemaId || "(no '$id')"} (context: ${ctx.type}). This will trigger loading of external references.`);
        const compiledSchemaPromise = ctx.ajv.compileAsync(inputSchema);
        if (schemaId) {
            logger.info(`Saving compiled schema in validator cache (context ${ctx.type}), '$id': ${schemaId}`);
            ctx.validatorCache.set(schemaId, compiledSchemaPromise);
        } else {
            logger.warn("Compiling schema with empty schema '$id'. Schema will not be cached in validator cache.");
        }
        return Promise.resolve(compiledSchemaPromise);
    }

    /**
     * Initialize AJV contexts for different draft families.
     * - '2019' handles draft-06, draft-07 and draft-2019-09
     * - '2020' handles draft-2020-12
     * Each context has its own AJV instance and separate caches to avoid cross-draft contamination.
     */ 
    _initAjvContexts(localSchemaPath) {
        // Build a context object for each draft family
        // Collect schema files once to avoid scanning the directory twice (performance)
        // Ensure we pass an Array to _createAjvContext/_preCompileLocalSchemas since getFiles() returns a Set
        const schemaFilesSet = localSchemaPath ? getFiles(localSchemaPath) : new Set();
        const schemaFiles = Array.from(schemaFilesSet);
        this.ajvContexts['2019'] = this._createAjvContext('2019', schemaFiles);
        this.ajvContexts['2020'] = this._createAjvContext('2020', schemaFiles);
    }

    /**
     * Create an AJV context for a given draft family.
     * Context holds:
     * - ajv: AJV instance (Ajv2019 or Ajv2020)
     * - referencedSchemaCache: cache for schemas loaded via $ref
     * - validatorCache: cache for compiled schema functions
     */
    _createAjvContext(type, schemaFiles) {
        const referencedSchemaCache = new NodeCache({stdTTl: 21600, checkperiod: 3600, useClones: false});
        const validatorCache = new NodeCache({stdTTl: 21600, checkperiod: 3600, useClones: false});

        let AjvClass = (type === '2020') ? Ajv2020 : Ajv2019;

        // loader bound to this context's referencedSchemaCache
        const loadSchema = (uri) => {
            logger.debug(`AJV requesting schema load (context: ${type}) for URI: ${uri}`);
            // skip if it's an official meta-schema
            if (
                uri.startsWith("http://json-schema.org/draft") ||
                uri.startsWith("https://json-schema.org/draft")
            ) {
                logger.debug(`Skipping official meta-schema fetch: ${uri}`);
                return Promise.resolve({});
            }

            // Check this context's cache first
            if (referencedSchemaCache.has(uri)) {
                logger.debug("Returning referenced schema from reference cache: " + uri);
                return Promise.resolve(referencedSchemaCache.get(uri));
            }

            // Check other AJV contexts' caches to avoid unnecessary network fetches
            for (const ctxKey of Object.keys(this.ajvContexts)) {
                const otherCtx = this.ajvContexts[ctxKey];
                if (otherCtx && otherCtx.referencedSchemaCache && otherCtx.referencedSchemaCache.has(uri)) {
                    logger.debug(`Returning referenced schema from reference cache (context: ${ctxKey}): ${uri}`);
                    return Promise.resolve(otherCtx.referencedSchemaCache.get(uri));
                }
            }

            // Not in any cache; fetch from network
            logger.debug(`Fetching referenced schema from network: ${uri}`);
            return new Promise((resolve, reject) => {
                axios({method: "GET", url: uri, responseType: 'json'})
                    .then(resp => {
                        const loadedSchema = resp.data;
                        this._insertAsyncToSchemasAndDefs(loadedSchema);

                        // Prefer storing into the context that matches the schema's $schema if available
                        let targetCtx = null;
                        if (typeof loadedSchema.$schema === 'string' && loadedSchema.$schema.includes('2020')) {
                            targetCtx = this.ajvContexts['2020'];
                        } else {
                            targetCtx = this.ajvContexts['2019'];
                        }

                        if (targetCtx && targetCtx.referencedSchemaCache) {
                            targetCtx.referencedSchemaCache.set(uri, loadedSchema);
                            logger.debug(`Saved referenced schema to cache (context: ${targetCtx.type}): ${uri}`);
                        }

                        resolve(loadedSchema);
                    }).catch(err => {
                        const status = err.response ? err.response.status : "network/DNS/file";
                        logger.error(
                            `Failed to fetch referenced schema URI: ${uri} (Status: ${status}). Error: ${err.message || err}`
                        );
                        reject(
                            new AppError(`Failed to resolve $ref via network/DNS/file (Status: ${status}): ${uri}. Original error: ${err.message}`)
                        );
                    });
            });
        };

        let ajvInstance = new AjvClass({
            allErrors: true,
            strict: false,
            loadSchema: loadSchema,
            $data: true,
        });

        addFormats(ajvInstance);
        require("ajv-errors")(ajvInstance);

        // add custom keywords to this AJV instance
        customKeywordValidators.forEach(customKeywordValidator => {
            ajvInstance = customKeywordValidator.configure(ajvInstance);
        });

        // Pre-compile local schemas into the appropriate context (only once per schemaFiles)
        this._preCompileLocalSchemas(ajvInstance, schemaFiles, {referencedSchemaCache, type});

        return { ajv: ajvInstance, referencedSchemaCache, validatorCache, type };
    }

    /**
     * Select the appropriate AJV context for a schema by inspecting its
     * $schema property. Defaults to the '2019' context for older drafts.
     */
    _getAjvContextForSchema(inputSchema) {
        // Determine which AJV context to use based on the $schema property when available
        const schemaUri = inputSchema && inputSchema.$schema ? inputSchema.$schema : "";
        if (typeof schemaUri === 'string' && schemaUri.includes('2020')) {
            return this.ajvContexts['2020'];
        }
        // default to 2019 context (handles older drafts as well)
        return this.ajvContexts['2019'];
    }

    // Schema loading is context-specific now and implemented per AJV context (see _createAjvContext).

    _addCustomKeywordValidators(ajvInstance) {
        customKeywordValidators.forEach(customKeywordValidator => {
            ajvInstance = customKeywordValidator.configure(ajvInstance);
        });
        logger.info("Custom keywords successfully added. Number of custom keywords: " + customKeywordValidators.length);
        return ajvInstance;
    }

    _preCompileLocalSchemas(ajv, schemaFiles, context) {
        if (schemaFiles && schemaFiles.length) {
            logger.info(`Compiling local schema from: list (count: ${schemaFiles.length}) into context: ${context.type}`);
            for (let file of schemaFiles) {
                let schema = readFile(file);
                this._insertAsyncToSchemasAndDefs(schema);
                // Determine which context the schema belongs to based on its $schema
                const schemaType = (typeof schema.$schema === 'string' && schema.$schema.includes('2020')) ? '2020' : '2019';
                if (schemaType === context.type) {
                    try {
                        ajv.getSchema(schema["$id"] || ajv.compile(schema)); // add to AJV cache if not already present
                        context.referencedSchemaCache.set(schema["$id"], schema);
                        logger.info("Adding compiled local schema to cache: " + schema["$id"] + " in context: " + context.type);
                    } catch (e) {
                        logger.error(`Failed to pre-compile local schema ${schema["$id"] || file} into context ${context.type}: ${e.message || e}`);
                    }
                } else {
                    logger.debug("Skipping local schema for context " + context.type + ": " + (schema["$id"] || '(no $id)'));
                }
            }
        } else {
            logger.debug(`No local schema files to pre-compile for context: ${context.type}`);
        }
    }
}

module.exports = BioValidator;