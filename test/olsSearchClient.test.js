jest.mock("axios");

const axios = require("axios");
const {olsCache} = require("../src/keywords/shared-cache");
const {
    OlsSearchClient,
    OlsSearchError,
    PAGE_SIZE
} = require("../src/utils/ols_search_client");
const {docForTerm, olsResponse} = require("./olsTestUtils");

describe("OlsSearchClient", () => {
    beforeEach(() => {
        axios.mockReset();
        olsCache.flushAll();
    });

    test("filters unrelated records before deduplicating by IRI", async () => {
        axios.mockResolvedValue(olsResponse([
            docForTerm("OTHER:1", {iri: "http://example.org/other"}),
            docForTerm("BFO:0000040"),
            docForTerm("BFO:0000040", {ontology_name: "importing-ontology"})
        ]));

        const client = new OlsSearchClient();
        await expect(
            client.resolveUniqueIri("BFO:0000040", ["obo_id"])
        ).resolves.toBe("http://purl.obolibrary.org/obo/BFO_0000040");
    });

    test("retains legacy custom endpoint injection without relying on its q parameter", async () => {
        axios.mockResolvedValue(olsResponse([docForTerm("BFO:0000040")]));
        const client = new OlsSearchClient("https://example.org/custom/search?q=");

        await client.resolveUniqueIri("BFO:0000040", ["obo_id"], {
            groupField: true,
            queryFields: "obo_id"
        });

        const request = axios.mock.calls[0][0];
        const requestedUrl = new URL(request.url);
        expect(requestedUrl.origin + requestedUrl.pathname).toBe(
            "https://example.org/custom/search"
        );
        expect(requestedUrl.searchParams.get("q")).toBe("BFO:0000040");
        expect(requestedUrl.searchParams.get("groupField")).toBeNull();
        expect(requestedUrl.searchParams.get("queryFields")).toBeNull();
        expect(request.timeout).toBe(30000);
    });

    test("fetches every page and caches only the completed aggregate", async () => {
        const term = "TARGET:1";
        const firstPage = Array.from({length: PAGE_SIZE}, (_, index) =>
            docForTerm(`OTHER:${index}`, {iri: `http://example.org/${index}`})
        );
        const secondPage = [docForTerm(term)];

        axios.mockImplementation((config) => {
            const start = Number(new URL(config.url).searchParams.get("start"));
            return Promise.resolve(start === 0
                ? olsResponse(firstPage, PAGE_SIZE + 1, 0)
                : olsResponse(secondPage, PAGE_SIZE + 1, PAGE_SIZE));
        });

        const client = new OlsSearchClient();
        await expect(client.resolveUniqueIri(term, ["obo_id"])).resolves.toBe(
            "http://purl.obolibrary.org/obo/TARGET_1"
        );
        await expect(client.resolveUniqueIri(term, ["obo_id"])).resolves.toBe(
            "http://purl.obolibrary.org/obo/TARGET_1"
        );

        expect(axios).toHaveBeenCalledTimes(2);
    });

    test.each([
        ["HTTP response", () => Promise.resolve(olsResponse([], 0, 0, 503)), "HTTP 503"],
        ["malformed response", () => Promise.resolve({status: 200, data: {}}), "malformed response payload"],
        ["incomplete pagination", () => Promise.resolve(olsResponse([], 2, 0)), "incomplete paginated response"]
    ])("classifies %s as an operational error", async (_name, responseFactory, message) => {
        axios.mockImplementation(responseFactory);
        const client = new OlsSearchClient();

        await expect(client.search("BFO:0000040")).rejects.toEqual(
            expect.objectContaining({
                name: "OlsSearchError",
                message: expect.stringContaining(message)
            })
        );
        expect([...olsCache.keys()].filter((key) => key.startsWith("ols-search:"))).toHaveLength(0);
    });

    test("wraps network failures with the searched term", async () => {
        axios.mockRejectedValue(new Error("socket hang up"));
        const client = new OlsSearchClient();

        await expect(client.search("BFO:0000040")).rejects.toBeInstanceOf(OlsSearchError);
        await expect(client.search("BFO:0000040")).rejects.toThrow(
            "OLS search failed for [BFO:0000040]: socket hang up"
        );
    });
});
