/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Check that conditions are respected when specified in a logpoint.
 */

const Resources = require("resource://devtools/server/actors/resources/index.js");

add_task(
  threadFrontTest(async ({ threadActor, threadFront, debuggee, client }) => {
    let lastMessage, lastExpression;
    const { targetActor } = threadActor;
    // Only Workers are evaluating through the WebConsoleActor.
    // Tabs will be evaluating directly via the frame object.
    targetActor._consoleActor = {
      evaluateJS(expression) {
        lastExpression = expression;
      },
    };

    // And then listen for resource RDP event.
    // Bug 1646677: But we should probably migrate this test to ResourceCommand so that
    // we don't have to hack the server side via Resource.watchResources call.
    targetActor.on(
      "resources-available-array",
      ([[resourceType, resources]]) => {
        if (resourceType == Resources.TYPES.CONSOLE_MESSAGE) {
          lastMessage = resources[0];
        }
      }
    );

    // But both tabs and processes will be going through the ConsoleMessages module
    // We force watching for console message first,
    await Resources.watchResources(targetActor, [
      Resources.TYPES.CONSOLE_MESSAGE,
    ]);

    const packet = await executeOnNextTickAndWaitForPause(
      () => evalCode(debuggee),
      threadFront
    );

    const source = await getSourceById(threadFront, packet.frame.where.actor);

    // Set a logpoint which should invoke console.log.
    threadFront.setBreakpoint(
      {
        sourceUrl: source.url,
        line: 4,
      },
      { logValue: "a", condition: "a === 5" }
    );
    await client.waitForRequestsToSettle();

    // Execute the rest of the code.
    await threadFront.resume();

    // NOTE: logpoints evaluated in a worker have a lastExpression
    if (lastMessage) {
      Assert.equal(lastMessage.level, "logPoint");
      Assert.equal(lastMessage.arguments[0], 5);
      Assert.ok(/\d+\.\d+/.test(lastMessage.timeStamp));
    } else {
      Assert.equal(lastExpression.text, "console.log(...[a])");
      Assert.equal(lastExpression.lineNumber, 4);
    }
  })
);

function evalCode(debuggee) {
  /* eslint-disable */
  Cu.evalInSandbox(
    "debugger;\n" + // 1
      "var a = 1;\n" + // 2
      "while (a < 10) {\n" + // 3
      "  a++;\n" + // 4
      "}",
    debuggee,
    "1.8",
    "test.js",
    1
  );
  /* eslint-enable */
}
