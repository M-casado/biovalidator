"use strict";

const crypto = require("crypto");
const SecurityLimitError = require("../model/security-limit-error");

function canonicalize(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

function digestJson(value) {
    return crypto.createHash("sha256").update(canonicalize(value)).digest("hex");
}

function cloneJson(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
}

function inspectJsonComplexity(value, options = {}) {
    const maxDepth = options.maxDepth;
    const maxValues = options.maxValues;
    const stack = [{value, depth: 0}];
    let values = 0;
    let observedDepth = 0;

    while (stack.length > 0) {
        const current = stack.pop();
        values += 1;
        observedDepth = Math.max(observedDepth, current.depth);
        if (maxValues && values > maxValues) {
            throw new SecurityLimitError(
                `JSON content exceeded this Biovalidator deployment's ${maxValues}-value limit.`,
                {
                    code: options.valueCode || "JSON_VALUE_LIMIT",
                    status: options.status || 422,
                    configuration: options.valueConfiguration,
                    limit: {name: options.valueName || "json_max_values", configured: maxValues, observed: values, unit: "values"}
                }
            );
        }
        if (maxDepth && current.depth > maxDepth) {
            throw new SecurityLimitError(
                `JSON content exceeded this Biovalidator deployment's nesting-depth limit of ${maxDepth}.`,
                {
                    code: options.depthCode || "JSON_DEPTH_LIMIT",
                    status: options.status || 422,
                    configuration: options.depthConfiguration,
                    limit: {name: options.depthName || "json_max_depth", configured: maxDepth, observed: current.depth, unit: "levels"}
                }
            );
        }
        const candidate = current.value;
        if (!candidate || typeof candidate !== "object") {
            continue;
        }
        const children = Array.isArray(candidate) ? candidate : Object.values(candidate);
        for (const child of children) {
            stack.push({value: child, depth: current.depth + 1});
        }
    }
    return {values, maxDepth: observedDepth};
}

function findForbiddenKey(value, forbiddenKey) {
    const stack = [value];
    while (stack.length > 0) {
        const candidate = stack.pop();
        if (!candidate || typeof candidate !== "object") {
            continue;
        }
        if (!Array.isArray(candidate) && Object.prototype.hasOwnProperty.call(candidate, forbiddenKey)) {
            return true;
        }
        for (const child of Array.isArray(candidate) ? candidate : Object.values(candidate)) {
            stack.push(child);
        }
    }
    return false;
}

function findAjvDataReference(value) {
    const stack = [value];
    while (stack.length > 0) {
        const candidate = stack.pop();
        if (!candidate || typeof candidate !== "object") {
            continue;
        }
        if (!Array.isArray(candidate) && Object.prototype.hasOwnProperty.call(candidate, "$data") &&
            typeof candidate.$data === "string") {
            return true;
        }
        for (const child of Array.isArray(candidate) ? candidate : Object.values(candidate)) {
            stack.push(child);
        }
    }
    return false;
}

module.exports = {
    canonicalize,
    cloneJson,
    digestJson,
    findAjvDataReference,
    findForbiddenKey,
    inspectJsonComplexity
};
