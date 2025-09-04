/**
 * Per-validation memoization for OLS queries
 * 
 * This memo is designed to prevent duplicate HTTP calls within a single Ajv validation execution.
 * Unlike the shared LRU cache which persists across validation runs, the memo is scoped to
 * a single validation run and disposed afterward.
 * 
 * This is particularly useful when multiple properties in the same schema need the same
 * ontology data during validation.
 */

/**
 * Create a new memo instance for a validation run
 * @returns {Object} Memo instance with get, set, and has methods
 */
function createMemo() {
    const store = new Map();
    
    return {
        /**
         * Get a value from the memo
         * @param {string} key - The memo key
         * @returns {any} The stored value, or undefined if not found
         */
        get(key) {
            return store.get(key);
        },
        
        /**
         * Set a value in the memo
         * @param {string} key - The memo key
         * @param {any} value - The value to store
         */
        set(key, value) {
            store.set(key, value);
        },
        
        /**
         * Check if the memo contains a key
         * @param {string} key - The memo key
         * @returns {boolean} True if the key exists
         */
        has(key) {
            return store.has(key);
        },
        
        /**
         * Get the number of entries in the memo (for testing)
         * @returns {number} Number of entries
         */
        size() {
            return store.size;
        },
        
        /**
         * Clear all entries from the memo (for testing)
         */
        clear() {
            store.clear();
        }
    };
}

module.exports = { createMemo };