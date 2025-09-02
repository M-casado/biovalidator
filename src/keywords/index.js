const isChildTermOf = require('./ischildtermof');
const isValidTaxonomy = require('./isvalidtaxonomy');
const isValidTerm = require('./isvalidterm');
const RelationshipRestriction = require('./relationshipRestriction');

module.exports = {
    isChildTermOf: isChildTermOf,
    isValidTaxonomy: isValidTaxonomy,
    isValidTerm: isValidTerm,
    RelationshipRestriction: RelationshipRestriction
}
