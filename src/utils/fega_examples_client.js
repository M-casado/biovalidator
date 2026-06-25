const axios = require("axios");
const path = require("path");

const DEFAULT_REPO = "M-casado/fega-metadata-schema";
const DEFAULT_REF = "main";
const DEFAULT_CACHE_TTL_SECONDS = 3600;
const EXAMPLE_PATTERN = "schemas/entities/*/examples/valid/*minimal*.json";
const EXAMPLE_PATH_REGEX = /^schemas\/entities\/([^/]+)\/examples\/valid\/([^/]*minimal[^/]*\.json)$/;

class FegaExamplesClient {
    constructor(options = {}) {
        this.repo = options.repo || process.env.FEGA_METADATA_SCHEMA_REPO || DEFAULT_REPO;
        this.ref = options.ref || process.env.FEGA_METADATA_SCHEMA_REF || DEFAULT_REF;
        this.cacheTtlSeconds = Number(
            options.cacheTtlSeconds ||
            process.env.FEGA_EXAMPLES_CACHE_TTL_SECONDS ||
            DEFAULT_CACHE_TTL_SECONDS
        );
        if (!Number.isFinite(this.cacheTtlSeconds) || this.cacheTtlSeconds < 0) {
            this.cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS;
        }
        this.cache = null;
    }

    async getExamples() {
        const now = Date.now();
        if (this.cache && this.cache.expiresAt > now) {
            return this.cache.payload;
        }

        const payload = await this._fetchExamples();
        this.cache = {
            payload,
            expiresAt: now + (this.cacheTtlSeconds * 1000)
        };
        return payload;
    }

    clearCache() {
        this.cache = null;
    }

    async _fetchExamples() {
        const tree = await this._fetchGitTree();
        const exampleFiles = tree
            .filter((entry) => entry && entry.type === "blob" && EXAMPLE_PATH_REGEX.test(entry.path))
            .map((entry) => entry.path)
            .sort((left, right) => left.localeCompare(right));

        const examples = await Promise.all(exampleFiles.map((filePath) => this._fetchExample(filePath)));
        examples.sort((left, right) => (
            left.entity.localeCompare(right.entity) ||
            left.name.localeCompare(right.name)
        ));

        return {
            source: this.repo,
            ref: this.ref,
            pattern: EXAMPLE_PATTERN,
            examples
        };
    }

    async _fetchGitTree() {
        const url = `https://api.github.com/repos/${this.repo}/git/trees/${this.ref}?recursive=1`;
        const response = await axios({method: "GET", url, responseType: "json"});
        if (!response || !response.data || !Array.isArray(response.data.tree)) {
            throw new Error("Malformed FEGA metadata schema tree response");
        }
        return response.data.tree;
    }

    async _fetchExample(filePath) {
        const match = filePath.match(EXAMPLE_PATH_REGEX);
        if (!match) {
            throw new Error(`Invalid FEGA example path: ${filePath}`);
        }

        const entity = match[1];
        const name = path.posix.basename(filePath);
        const id = name.replace(/\.json$/, "");
        const rawUrl = this._rawUrl(filePath);
        const response = await axios({method: "GET", url: rawUrl, responseType: "json"});
        const wrapper = response && response.data;

        if (!wrapper || typeof wrapper !== "object" || Array.isArray(wrapper) ||
            !Object.prototype.hasOwnProperty.call(wrapper, "schema") ||
            !Object.prototype.hasOwnProperty.call(wrapper, "data") ||
            !wrapper.schema || typeof wrapper.schema !== "object" || Array.isArray(wrapper.schema)) {
            throw new Error(`Malformed FEGA example wrapper: ${filePath}`);
        }

        return {
            id,
            entity,
            name,
            path: filePath,
            rawUrl,
            schema: wrapper.schema,
            data: wrapper.data
        };
    }

    _rawUrl(filePath) {
        return `https://raw.githubusercontent.com/${this.repo}/${this.ref}/${filePath}`;
    }
}

module.exports = {
    FegaExamplesClient,
    EXAMPLE_PATH_REGEX,
    EXAMPLE_PATTERN
};
