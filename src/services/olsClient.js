const axios = require('axios');
const { doubleEncodeIri } = require('../utils/iri');

const OLS4_BASE = process.env.OLS4_BASE || 'https://www.ebi.ac.uk/ols4/api';
const OLS1_BASE = process.env.OLS1_BASE || 'https://www.ebi.ac.uk/ols/api';

async function httpGetJson(fullUrl) {
	try {
		const response = await axios.get(fullUrl, {
			headers: { Accept: 'application/json' }
		});
		return response.data;
	} catch (error) {
		throw error;
	}
}

async function fetchEntityByIri(ontology, iri) {
	const encOnt = encodeURIComponent(ontology);
	const encIri = doubleEncodeIri(iri);
	const url = `${OLS4_BASE}/ontologies/${encOnt}/terms/${encIri}`;
	return httpGetJson(url);
}

async function fetchEntityByCurie(ontology, curie) {
	const encOnt = encodeURIComponent(ontology);
	const encCurie = encodeURIComponent(curie);
	const url = `${OLS1_BASE}/ontologies/${encOnt}/terms?obo_id=${encCurie}`;
	const res = await httpGetJson(url);
	const terms = res && res._embedded && res._embedded.terms ? res._embedded.terms : [];
	return terms[0] || null;
}

async function getParents(ontology, iri) {
	const encOnt = encodeURIComponent(ontology);
	const encIri = doubleEncodeIri(iri);
	const url = `${OLS4_BASE}/ontologies/${encOnt}/terms/${encIri}/parents`;
	return httpGetJson(url);
}

async function getAncestors(ontology, iri) {
	const encOnt = encodeURIComponent(ontology);
	const encIri = doubleEncodeIri(iri);
	const url = `${OLS4_BASE}/ontologies/${encOnt}/terms/${encIri}/hierarchicalAncestors`;
	return httpGetJson(url);
}

async function getChildren(ontology, iri) {
	const encOnt = encodeURIComponent(ontology);
	const encIri = doubleEncodeIri(iri);
	const url = `${OLS4_BASE}/ontologies/${encOnt}/terms/${encIri}/children`;
	return httpGetJson(url);
}

module.exports = {
	fetchEntityByIri,
	fetchEntityByCurie,
	getParents,
	getAncestors,
	getChildren
};
