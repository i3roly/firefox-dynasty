/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { FeatureGate } = ChromeUtils.importESModule(
  "resource://featuregates/FeatureGate.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const kDefinitionDefaults = {
  id: "test-feature",
  title: "Test Feature",
  description: "A feature for testing",
  restartRequired: false,
  type: "boolean",
  preference: "test.feature",
  defaultValue: false,
  isPublic: false,
};

function definitionFactory(override = {}) {
  return Object.assign({}, kDefinitionDefaults, override);
}

class DefinitionServer {
  constructor(definitionOverrides = []) {
    this.server = new HttpServer();
    this.server.registerPathHandler("/definitions.json", this);
    this.definitions = {};

    for (const override of definitionOverrides) {
      this.addDefinition(override);
    }

    this.server.start();
    registerCleanupFunction(
      () => new Promise(resolve => this.server.stop(resolve))
    );
  }

  // for nsIHttpRequestHandler
  handle(request, response) {
    // response.setHeader("Content-Type", "application/json");
    response.write(JSON.stringify(this.definitions));
  }

  get definitionsUrl() {
    const { primaryScheme, primaryHost, primaryPort } = this.server.identity;
    return `${primaryScheme}://${primaryHost}:${primaryPort}/definitions.json`;
  }

  addDefinition(overrides = {}) {
    const definition = definitionFactory(overrides);
    // convert targeted values, used by fromId
    definition.isPublicJexl = definition.isPublic ? "!testFact" : "testFact";
    definition.defaultValueJexl = definition.defaultValue
      ? "!testFact"
      : "testFact";
    this.definitions[definition.id] = definition;
    return definition;
  }
}

// ============================================================================
add_task(async function testReadAll() {
  const server = new DefinitionServer();
  let ids = ["test-featureA", "test-featureB", "test-featureC"];
  for (let id of ids) {
    server.addDefinition({ id });
  }
  let sortedIds = ids.sort();
  const features = await FeatureGate.all(server.definitionsUrl);
  for (let feature of features) {
    equal(
      feature.id,
      sortedIds.shift(),
      "Features are returned in order of definition"
    );
  }
  equal(sortedIds.length, 0, "All features are returned when calling all()");
});

// The getters and setters should read correctly from the definition
add_task(async function testReadFromDefinition() {
  const server = new DefinitionServer();
  const definition = server.addDefinition({ id: "test-feature" });
  const feature = await FeatureGate.fromId(
    "test-feature",
    server.definitionsUrl
  );

  // simple fields
  equal(feature.id, definition.id, "id should be read from definition");
  equal(
    feature.title,
    definition.title,
    "title should be read from definition"
  );
  equal(
    feature.description,
    definition.description,
    "description should be read from definition"
  );
  equal(
    feature.restartRequired,
    definition.restartRequired,
    "restartRequired should be read from definition"
  );
  equal(feature.type, definition.type, "type should be read from definition");
  equal(
    feature.preference,
    definition.preference,
    "preference should be read from definition"
  );

  // targeted fields
  equal(
    feature.defaultValue,
    false,
    "defaultValue should be false because testFact was not provided."
  );

  equal(
    feature.isPublic,
    false,
    "isPublic should be false because testFact was not provided."
  );

  // cleanup
  Services.prefs.getDefaultBranch("").deleteBranch("test.feature");
});

// Targeted values should return the correct value
add_task(async function testTargetedValues() {
  const targetingFacts = {
    true1: true,
    true2: true,
    false1: false,
    false2: false,
  };

  Assert.equal(
    await FeatureGate.evaluateJexlValue("true1", targetingFacts),
    true,
    "A true value should be reflected"
  );
  Assert.equal(
    await FeatureGate.evaluateJexlValue("false1", targetingFacts),
    false,
    "A false value should be reflected"
  );
  Assert.equal(
    await FeatureGate.evaluateJexlValue("false"),
    false,
    "Boolean literal false should work"
  );

  Assert.equal(
    await FeatureGate.evaluateJexlValue("true"),
    true,
    "Boolean literal true should work"
  );

  Assert.equal(
    await FeatureGate.evaluateJexlValue("false2 || true1", targetingFacts),
    true,
    "Compound expressions work."
  );

  Assert.equal(
    await FeatureGate.evaluateJexlValue("testFact", {}),
    false,
    "Non-existing terms in the expression get coerced to bool false."
  );
  Assert.equal(
    await FeatureGate.evaluateJexlValue("testFact", { testFact: true }),
    true,
    "Providing testFact=true, the expression returns true."
  );
});

// getValue should work
add_task(async function testGetValue() {
  equal(
    Services.prefs.getPrefType("test.feature.1"),
    Services.prefs.PREF_INVALID,
    "Before creating the feature gate, the preference should not exist"
  );

  const server = new DefinitionServer([
    { id: "test-feature-1", defaultValue: false, preference: "test.feature.1" },
    { id: "test-feature-2", defaultValue: true, preference: "test.feature.2" },
  ]);

  equal(
    await FeatureGate.getValue("test-feature-1", server.definitionsUrl),
    false,
    "getValue() starts by returning the default value"
  );
  equal(
    await FeatureGate.getValue("test-feature-2", server.definitionsUrl),
    true,
    "getValue() starts by returning the default value"
  );

  Services.prefs.setBoolPref("test.feature.1", true);
  equal(
    await FeatureGate.getValue("test-feature-1", server.definitionsUrl),
    true,
    "getValue() return the new value"
  );

  Services.prefs.setBoolPref("test.feature.1", false);
  equal(
    await FeatureGate.getValue("test-feature-1", server.definitionsUrl),
    false,
    "getValue() should return the second value"
  );

  // cleanup
  Services.prefs.getDefaultBranch("").deleteBranch("test.feature.");
});

// getValue should work
add_task(async function testGetValue() {
  const server = new DefinitionServer([
    { id: "test-feature-1", defaultValue: false, preference: "test.feature.1" },
    { id: "test-feature-2", defaultValue: true, preference: "test.feature.2" },
  ]);

  equal(
    Services.prefs.getPrefType("test.feature.1"),
    Services.prefs.PREF_INVALID,
    "Before creating the feature gate, the first preference should not exist"
  );
  equal(
    Services.prefs.getPrefType("test.feature.2"),
    Services.prefs.PREF_INVALID,
    "Before creating the feature gate, the second preference should not exist"
  );

  equal(
    await FeatureGate.isEnabled("test-feature-1", server.definitionsUrl),
    false,
    "isEnabled() starts by returning the default value"
  );
  equal(
    await FeatureGate.isEnabled("test-feature-2", server.definitionsUrl),
    true,
    "isEnabled() starts by returning the default value"
  );

  Services.prefs.setBoolPref("test.feature.1", true);
  equal(
    await FeatureGate.isEnabled("test-feature-1", server.definitionsUrl),
    true,
    "isEnabled() return the new value"
  );

  Services.prefs.setBoolPref("test.feature.1", false);
  equal(
    await FeatureGate.isEnabled("test-feature-1", server.definitionsUrl),
    false,
    "isEnabled() should return the second value"
  );

  // cleanup
  Services.prefs.getDefaultBranch("").deleteBranch("test.feature.");
});

// adding and removing event observers should work
add_task(async function testGetValue() {
  const preference = "test.pref";
  const server = new DefinitionServer([
    { id: "test-feature", defaultValue: false, preference },
  ]);
  const observer = {
    onChange: sinon.stub(),
    onEnable: sinon.stub(),
    onDisable: sinon.stub(),
  };

  let rv = await FeatureGate.addObserver(
    "test-feature",
    observer,
    server.definitionsUrl
  );
  equal(rv, false, "addObserver returns the current value");

  Assert.deepEqual(observer.onChange.args, [], "onChange should not be called");
  Assert.deepEqual(observer.onEnable.args, [], "onEnable should not be called");
  Assert.deepEqual(
    observer.onDisable.args,
    [],
    "onDisable should not be called"
  );

  Services.prefs.setBoolPref(preference, true);
  await Promise.resolve(); // Allow events to be called async
  Assert.deepEqual(
    observer.onChange.args,
    [[true]],
    "onChange should be called with the new value"
  );
  Assert.deepEqual(observer.onEnable.args, [[]], "onEnable should be called");
  Assert.deepEqual(
    observer.onDisable.args,
    [],
    "onDisable should not be called"
  );

  Services.prefs.setBoolPref(preference, false);
  await Promise.resolve(); // Allow events to be called async
  Assert.deepEqual(
    observer.onChange.args,
    [[true], [false]],
    "onChange should be called again with the new value"
  );
  Assert.deepEqual(
    observer.onEnable.args,
    [[]],
    "onEnable should not be called a second time"
  );
  Assert.deepEqual(
    observer.onDisable.args,
    [[]],
    "onDisable should be called for the first time"
  );

  Services.prefs.setBoolPref(preference, false);
  await Promise.resolve(); // Allow events to be called async
  Assert.deepEqual(
    observer.onChange.args,
    [[true], [false]],
    "onChange should not be called if the value did not change"
  );
  Assert.deepEqual(
    observer.onEnable.args,
    [[]],
    "onEnable should not be called again if the value did not change"
  );
  Assert.deepEqual(
    observer.onDisable.args,
    [[]],
    "onDisable should not be called if the value did not change"
  );

  // remove the listener and make sure the observer isn't called again
  FeatureGate.removeObserver("test-feature", observer);
  await Promise.resolve(); // Allow events to be called async

  Services.prefs.setBoolPref(preference, true);
  await Promise.resolve(); // Allow events to be called async
  Assert.deepEqual(
    observer.onChange.args,
    [[true], [false]],
    "onChange should not be called after observer was removed"
  );
  Assert.deepEqual(
    observer.onEnable.args,
    [[]],
    "onEnable should not be called after observer was removed"
  );
  Assert.deepEqual(
    observer.onDisable.args,
    [[]],
    "onDisable should not be called after observer was removed"
  );

  // cleanup
  Services.prefs.getDefaultBranch("").deleteBranch(preference);
});

if (AppConstants.platform != "android") {
  // All preferences should have default values.
  add_task(async function testAllHaveDefault() {
    const featuresList = await FeatureGate.all();
    for (let feature of featuresList) {
      notEqual(
        typeof feature.defaultValue,
        "undefined",
        `Feature ${feature.id} should have a defined default value!`
      );
      notEqual(
        feature.defaultValue,
        null,
        `Feature ${feature.id} should have a non-null default value!`
      );
    }
  });

  // All preference defaults should match service pref defaults
  add_task(async function testAllDefaultsMatchSettings() {
    const featuresList = await FeatureGate.all();
    for (let feature of featuresList) {
      let value = Services.prefs
        .getDefaultBranch("")
        .getBoolPref(feature.preference);
      equal(
        feature.defaultValue,
        value,
        `Feature ${feature.preference} should match runtime value.`
      );
    }
  });
}
