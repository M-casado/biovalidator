class ValidationError {
  constructor(errorObject) {
    // Determine property name from known AJV params keys (missingProperty, additionalProperty, unevaluatedProperty)
    const propName = errorObject.params && (
      errorObject.params.missingProperty ||
      errorObject.params.additionalProperty ||
      errorObject.params.unevaluatedProperty ||
      errorObject.params.propertyName ||
      null
    );

    if (propName) {
      this.dataPath = (errorObject.instancePath || "") + "/" + propName;
    } else {
      this.dataPath = errorObject.instancePath || "";
    }

    const baseMsg = errorObject.message || "";

    if (errorObject.params && errorObject.params.allowedValues) { // enum case
      this.errors = [baseMsg + ": " + JSON.stringify(errorObject.params.allowedValues)];
    } else if (propName) {
      // Make the message more helpful by including the property name
      this.errors = [baseMsg + `: '${propName}'`];
    } else {
      this.errors = [baseMsg];
    }
  }
}

module.exports = ValidationError;
