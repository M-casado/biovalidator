"use strict";

const HELP = "This is a safety limit imposed by this Biovalidator deployment. " +
    "Deploy Biovalidator locally or change the documented configuration when trusted schemas or data require a higher limit.";

class SecurityLimitError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "SecurityLimitError";
        this.code = options.code || "SECURITY_LIMIT";
        this.status = options.status || 422;
        this.limit = options.limit;
        this.configuration = options.configuration;
        this.help = options.help || HELP;
        this.expose = true;
    }

    toJSON() {
        const body = {
            error: this.message,
            code: this.code
        };
        if (this.limit) {
            body.limit = this.limit;
        }
        if (this.configuration) {
            body.configuration = this.configuration;
        }
        body.help = this.help;
        return body;
    }
}

module.exports = SecurityLimitError;
module.exports.SECURITY_LIMIT_HELP = HELP;
