function olsResponse(docs, numFound = docs.length, start = 0, status = 200) {
    return {
        status,
        data: {
            response: {
                docs,
                numFound,
                start
            }
        }
    };
}

function iriForTerm(term) {
    if (/^https?:\/\//.test(term)) {
        return term;
    }

    const curieParts = term.split(":");
    if (curieParts.length === 2) {
        return `http://purl.obolibrary.org/obo/${curieParts[0]}_${curieParts[1]}`;
    }

    return `http://example.org/term/${encodeURIComponent(term)}`;
}

function docForTerm(term, overrides = {}) {
    return {
        iri: iriForTerm(term),
        obo_id: term,
        label: term,
        ...overrides
    };
}

function installDefaultOlsMock(axios, options = {}) {
    const notFoundTerms = new Set(options.notFoundTerms || []);

    axios.mockImplementation((config) => {
        const url = new URL(config.url);

        if (url.hostname === "www.ebi.ac.uk" &&
            url.pathname.startsWith("/ena/taxonomy/rest/any-name/")) {
            return Promise.resolve({
                status: 200,
                data: [{taxId: 1, submittable: "true"}]
            });
        }

        if (url.hostname === "resolver.api.identifiers.org") {
            return Promise.resolve({
                status: 200,
                data: {
                    payload: {
                        resolvedResources: [{
                            compactIdentifierResolvedUrl: "http://example.org/resolved"
                        }]
                    }
                }
            });
        }

        const term = url.searchParams.get("q");
        const start = Number(url.searchParams.get("start") || 0);

        if (notFoundTerms.has(term)) {
            return Promise.resolve(olsResponse([], 0, start));
        }

        return Promise.resolve(olsResponse([docForTerm(term)], 1, start));
    });
}

module.exports = {
    docForTerm,
    installDefaultOlsMock,
    iriForTerm,
    olsResponse
};
