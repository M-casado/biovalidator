# RelationshipRestriction Keyword

The `relationshipRestriction` keyword provides a powerful and flexible way to validate ontology term relationships in JSON Schema. It generalizes the functionality of existing keywords like `graphRestriction` and supports arbitrary relationship paths, not just subclass hierarchies.

## Schema Structure

```json
{
  "relationshipRestriction": {
    "ontologies": ["efo", "uberon"],
    "targets": ["http://purl.obolibrary.org/obo/EFO_0000001"],
    "relationType": ["rdfs:subClassOf*"],
    "idFormat": "ANY",
    "includeSelf": false,
    "allowImported": true,
    "allowObsolete": false,
    "directChild": false,
    "leafNode": false
  }
}
```

## Configuration Options

### Required Fields

- **`ontologies`** (Array): List of ontology identifiers to search (e.g., `["efo", "uberon"]`)
- **`targets`** (Array): Target term IRIs or CURIEs that define valid relationship endpoints
- **`relationType`** (Array): Ordered chain of relationship properties to traverse

### Optional Fields

- **`idFormat`** (String): Required identifier format - `"CURIE"`, `"IRI"`, or `"ANY"` (default: `"ANY"`)
- **`includeSelf`** (Boolean): Whether to accept the target term itself as valid (default: `false`)
- **`allowImported`** (Boolean): Whether to allow imported terms from other ontologies (default: `true`)
- **`allowObsolete`** (Boolean): Whether to allow obsolete/deprecated terms (default: `false`)
- **`directChild`** (Boolean): Enforce single-hop relationships only (default: `false`)
- **`leafNode`** (Boolean): Require term to be a leaf node with no children (default: `false`)

## Examples

### Basic Subclass Validation
```json
{
  "ontologyTerm": {
    "type": "string",
    "relationshipRestriction": {
      "ontologies": ["efo"],
      "targets": ["http://purl.obolibrary.org/obo/EFO_0000001"],
      "relationType": ["rdfs:subClassOf*"]
    }
  }
}
```

### Multiple Ontologies and Targets
```json
{
  "diseaseTerm": {
    "type": "string",
    "relationshipRestriction": {
      "ontologies": ["efo", "mondo"],
      "targets": [
        "http://purl.obolibrary.org/obo/EFO_0000408",
        "http://purl.obolibrary.org/obo/MONDO_0000001"
      ],
      "relationType": ["rdfs:subClassOf*"],
      "includeSelf": true
    }
  }
}
```

### Strict Format and Leaf Node Requirements
```json
{
  "specificTerm": {
    "type": "string",
    "relationshipRestriction": {
      "ontologies": ["uberon"],
      "targets": ["http://purl.obolibrary.org/obo/UBERON_0000468"],
      "relationType": ["rdfs:subClassOf*"],
      "idFormat": "CURIE",
      "allowObsolete": false,
      "leafNode": true
    }
  }
}
```

### Direct Child Validation
```json
{
  "directChild": {
    "type": "string",
    "relationshipRestriction": {
      "ontologies": ["cl"],
      "targets": ["http://purl.obolibrary.org/obo/CL_0000000"],
      "relationType": ["rdfs:subClassOf"],
      "directChild": true
    }
  }
}
```

## Relationship Types

### Transitive Relationships

Use `*` suffix to indicate transitive closure:
- **`rdfs:subClassOf*`**: All ancestors in the subclass hierarchy
- **`BFO:0000050*`**: All part-of relationships (transitive)

### Direct Relationships

Without `*` suffix for single-hop relationships:
- **`rdfs:subClassOf`**: Immediate parent classes only
- **`rdf:type`**: Direct instance types

### Relationship Chains

Multiple relationships can be chained:
```json
{
  "relationType": ["rdf:type", "rdfs:subClassOf*"]
}
```

This validates that a term is an instance of some class, and that class is a subclass of the target.

## Backward Compatibility

The existing `graphRestriction` and `isChildTermOf` keywords have been refactored to use `relationshipRestriction` internally, maintaining full backward compatibility:

- **`graphRestriction`**: Continues to work exactly as before
- **`isChildTermOf`**: Still supported but deprecated (issues warning)

For new schemas, prefer `relationshipRestriction` for its enhanced capabilities.

## Error Messages

The keyword provides clear error messages:
- Format violations: "Identifier must be in CURIE format"
- Relationship failures: "Term does not satisfy relationship rdfs:subClassOf* to targets [...]"
- Obsolete terms: "Term is obsolete with no replacement"
- Leaf node violations: "Term is not a leaf node in ontology"

## Performance

The keyword integrates with the existing caching system to optimize OLS API calls and improve validation performance in batch scenarios.