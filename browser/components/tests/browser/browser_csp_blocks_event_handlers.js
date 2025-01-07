/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_blocks_event_handlers() {
  let main = document.documentElement;

  registerCleanupFunction(() => {
    delete window.dont_run_me;
    main.removeAttribute("onclick");
  });

  window.dont_run_me = function () {
    ok(false, "Should not run!");
  };

  let violationPromise = BrowserTestUtils.waitForEvent(
    document,
    "securitypolicyviolation"
  );

  main.setAttribute("onclick", "dont_run_me()");
  main.click();

  let violation = await violationPromise;
  is(
    violation.effectiveDirective,
    "script-src-attr",
    "effectiveDirective matches"
  );
  is(violation.sourceFile, "chrome", "sourceFile matches");
});
