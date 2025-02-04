/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { TabStateFlusher } = ChromeUtils.importESModule(
  "resource:///modules/sessionstore/TabStateFlusher.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.groups.enabled", true]],
  });
  forgetSavedTabGroups();
  window.gTabsPanel.init();
});

function forgetSavedTabGroups() {
  const tabGroups = SessionStore.getSavedTabGroups();
  tabGroups.forEach(tabGroup => SessionStore.forgetSavedTabGroup(tabGroup.id));
}

/**
 * @param {Window} win
 * @returns {Promise<PanelView>}
 */
async function openTabsMenu(win = window) {
  let viewShown = BrowserTestUtils.waitForEvent(
    win.document.getElementById("allTabsMenu-allTabsView"),
    "ViewShown"
  );
  win.document.getElementById("alltabs-button").click();
  return (await viewShown).target;
}

/**
 * @param {Window} win
 * @returns {Promise<void>}
 */
async function closeTabsMenu(win = window) {
  let panel = win.document
    .getElementById("allTabsMenu-allTabsView")
    .closest("panel");
  if (!panel) {
    return;
  }
  let hidden = BrowserTestUtils.waitForPopupEvent(panel, "hidden");
  panel.hidePopup();
  await hidden;
}

async function assertTabMenuContains(expectedLabels) {
  let allTabsMenu = await openTabsMenu();
  let tabButtons = allTabsMenu.querySelectorAll(
    "#allTabsMenu-allTabsView-tabs .all-tabs-button"
  );

  tabButtons.forEach((button, i) => {
    Assert.equal(
      button.label,
      expectedLabels[i],
      `Expected: ${expectedLabels[i]}`
    );
  });

  await closeTabsMenu();
}

/**
 * Tests that grouped tabs in alltabsmenu are prepended by
 * a group indicator
 */
add_task(async function test_allTabsView() {
  let tabs = [];
  for (let i = 1; i <= 5; i++) {
    tabs.push(
      await addTab(`data:text/plain,tab${i}`, {
        skipAnimation: true,
      })
    );
  }
  let testGroup = gBrowser.addTabGroup([tabs[0], tabs[1]], {
    label: "Test Group",
  });
  gBrowser.addTabGroup([tabs[2], tabs[3]]);

  await assertTabMenuContains([
    "New Tab",
    "data:text/plain,tab5",
    "Test Group",
    "data:text/plain,tab1",
    "data:text/plain,tab2",
    "Unnamed Group",
    "data:text/plain,tab3",
    "data:text/plain,tab4",
  ]);

  testGroup.collapsed = true;
  await assertTabMenuContains([
    "New Tab",
    "data:text/plain,tab5",
    "Test Group",
    // tab1 and tab2 rows should be hidden when Test Group is collapsed
    "Unnamed Group",
    "data:text/plain,tab3",
    "data:text/plain,tab4",
  ]);

  for (let tab of tabs) {
    BrowserTestUtils.removeTab(tab);
  }
});

/**
 * @param {XULToolbarButton} triggerNode
 * @param {string} contextMenuId
 * @returns {Promise<XULMenuElement|XULPopupElement>}
 */
async function getContextMenu(triggerNode, contextMenuId) {
  let win = triggerNode.ownerGlobal;
  triggerNode.scrollIntoView();
  const contextMenu = win.document.getElementById(contextMenuId);
  Assert.equal(contextMenu.state, "closed", "context menu is initially closed");
  const contextMenuShown = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "shown"
  );

  EventUtils.synthesizeMouseAtCenter(
    triggerNode,
    { type: "contextmenu", button: 2 },
    win
  );
  await contextMenuShown;
  Assert.equal(contextMenu.state, "open", "context menu has been opened");
  return contextMenu;
}

/**
 * Tests that groups appear in the supplementary group menu
 * when they are saved (and closed,) or open in another window.
 * Clicking an open group in this menu focuses it,
 * and clicking on a saved group restores it.
 */
add_task(async function test_tabGroupsView() {
  const savedGroupId = "test-saved-group";

  let tabs = [];
  for (let i = 1; i <= 5; i++) {
    let tab = await addTab(`data:text/plain,tab${i}`, {
      skipAnimation: true,
    });
    await TabStateFlusher.flush(tab.linkedBrowser);
    tabs.push(tab);
  }
  let group1 = gBrowser.addTabGroup([tabs[0], tabs[1]], {
    id: savedGroupId,
    label: "Test Saved Group",
  });
  let group2 = gBrowser.addTabGroup([tabs[2], tabs[3]], {
    label: "Test Open Group",
  });

  let allTabsMenu = await openTabsMenu(window);
  Assert.equal(
    allTabsMenu.querySelectorAll("#allTabsMenu-groupsView toolbaritem").length,
    0,
    "should not list tab groups that are in the same window"
  );

  let newWindow = await BrowserTestUtils.openNewBrowserWindow();
  newWindow.gTabsPanel.init();

  allTabsMenu = await openTabsMenu(newWindow);
  Assert.equal(
    allTabsMenu.querySelectorAll("#allTabsMenu-groupsView toolbaritem").length,
    2,
    "should list tab groups that are in another window"
  );
  Assert.equal(
    allTabsMenu.querySelectorAll("#allTabsMenu-groupsView .all-tabs-button")
      .length,
    2,
    "both groups should be shown as open"
  );

  await closeTabsMenu(newWindow);

  group1.save();
  await removeTabGroup(group1);

  Assert.ok(!gBrowser.getTabGroupById(savedGroupId), "Group 1 removed");

  allTabsMenu = await openTabsMenu(newWindow);
  Assert.equal(
    allTabsMenu.querySelectorAll("#allTabsMenu-groupsView toolbaritem").length,
    2,
    "Both groups should be shown in groups list"
  );
  let savedGroupButton = allTabsMenu.querySelector(
    "#allTabsMenu-groupsView .all-tabs-button.all-tabs-group-saved-group"
  );
  Assert.equal(
    savedGroupButton.label,
    "Test Saved Group",
    "Saved group appears as saved"
  );

  // Clicking on an open group should select that group in the origin window
  let openGroupButton = allTabsMenu.querySelector(
    "#allTabsMenu-groupsView .all-tabs-button:not(.all-tabs-group-saved-group)"
  );
  openGroupButton.click();
  Assert.equal(
    gBrowser.selectedTab.group.id,
    group2.id,
    "Tab in group 2 is selected"
  );

  await BrowserTestUtils.closeWindow(newWindow, { animate: false });

  // Clicking on a saved group should restore the group to the current window
  allTabsMenu = await openTabsMenu();
  savedGroupButton = allTabsMenu.querySelector(
    "#allTabsMenu-groupsView .all-tabs-button.all-tabs-group-saved-group"
  );
  savedGroupButton.click();
  group1 = gBrowser.getTabGroupById(savedGroupId);
  Assert.ok(group1, "Group 1 has been restored");
  allTabsMenu = await openTabsMenu();
  Assert.ok(
    !allTabsMenu.querySelector("#allTabsMenu-groupsView .all-tabs-button"),
    "Groups list is now empty for this window"
  );

  await closeTabsMenu();

  newWindow = await BrowserTestUtils.openNewBrowserWindow();
  newWindow.gTabsPanel.init();

  allTabsMenu = await openTabsMenu(newWindow);
  let group1MenuItem = allTabsMenu.querySelector(
    `#allTabsMenu-groupsView [data-tab-group-id="${savedGroupId}"]`
  );
  let menu = await getContextMenu(
    group1MenuItem,
    "open-tab-group-context-menu"
  );
  let waitForGroup = BrowserTestUtils.waitForEvent(
    newWindow.gBrowser.tabContainer,
    "TabGroupCreate"
  );
  menu.querySelector("#open-tab-group-context-menu_moveToThisWindow").click();
  await waitForGroup;

  Assert.equal(
    window.gBrowser.tabGroups.length,
    1,
    "tab group should have moved from other window"
  );
  Assert.equal(
    newWindow.gBrowser.tabGroups.length,
    1,
    "tab group should have moved to new window"
  );
  Assert.equal(
    newWindow.gBrowser.tabGroups[0].id,
    savedGroupId,
    "tab group in new window should be the one that was moved"
  );

  await closeTabsMenu(newWindow);

  allTabsMenu = await openTabsMenu(window);
  group1MenuItem = allTabsMenu.querySelector(
    `#allTabsMenu-groupsView [data-tab-group-id="${savedGroupId}"]`
  );
  menu = await getContextMenu(group1MenuItem, "open-tab-group-context-menu");
  waitForGroup = BrowserTestUtils.waitForEvent(
    newWindow.gBrowser.tabContainer,
    "TabGroupRemoved"
  );
  menu.querySelector("#open-tab-group-context-menu_moveToNewWindow").click();
  await waitForGroup;

  await closeTabsMenu(window);

  Assert.equal(
    newWindow.gBrowser.tabGroups.length,
    0,
    "tab group should have moved out of the new window to some newer window"
  );

  allTabsMenu = await openTabsMenu(window);
  group1MenuItem = allTabsMenu.querySelector(
    `#allTabsMenu-groupsView [data-tab-group-id="${savedGroupId}"]`
  );
  menu = await getContextMenu(group1MenuItem, "open-tab-group-context-menu");

  menu.querySelector("#open-tab-group-context-menu_delete").click();
  menu.hidePopup();
  await TestUtils.waitForCondition(
    () => gBrowser.getAllTabGroups().length == 1,
    "wait for tab group to be deleted"
  );

  await closeTabsMenu(window);

  Assert.equal(
    gBrowser.getAllTabGroups().length,
    1,
    "the only tab group left should be the unnamed group in the original window"
  );

  let moreTabs = [];
  for (let i = 1; i <= 2; i++) {
    moreTabs.push(
      await addTabTo(newWindow.gBrowser, `data:text/plain,tab${i}`, {
        skipAnimation: true,
      })
    );
  }
  group1 = newWindow.gBrowser.addTabGroup([moreTabs[0], moreTabs[1]], {
    id: savedGroupId,
    label: "Test Saved Group",
  });

  group1.save();
  await removeTabGroup(group1);

  Assert.ok(!gBrowser.getTabGroupById(savedGroupId), "Group 1 removed");

  allTabsMenu = await openTabsMenu(newWindow);
  savedGroupButton = allTabsMenu.querySelector(
    `#allTabsMenu-groupsView [data-tab-group-id="${savedGroupId}"]`
  );
  Assert.equal(
    savedGroupButton.label,
    "Test Saved Group",
    "Saved group once again appears as saved"
  );

  menu = await getContextMenu(savedGroupButton, "saved-tab-group-context-menu");
  waitForGroup = BrowserTestUtils.waitForEvent(newWindow, "SSWindowStateReady");
  menu.querySelector("#saved-tab-group-context-menu_openInThisWindow").click();
  menu.hidePopup();
  await waitForGroup;
  await closeTabsMenu(newWindow);

  group1 = gBrowser.getTabGroupById(savedGroupId);
  Assert.equal(group1.name, "Test Saved Group", "Saved group was reopened");

  info("save the group once again");
  group1.save();
  await removeTabGroup(group1);

  Assert.ok(!gBrowser.getTabGroupById(savedGroupId), "Group 1 removed");

  // TODO Bug 1940112: "Open Group in New Window" should directly restore saved tab groups into a new window
  // allTabsMenu = await openTabsMenu(newWindow);
  // savedGroupButton = allTabsMenu.querySelector(
  //   `#allTabsMenu-groupsView [data-tab-group-id="${savedGroupId}"]`
  // );
  // Assert.equal(
  //   savedGroupButton.label,
  //   "Test Saved Group",
  //   "Saved group once again appears as saved"
  // );

  // menu = await getContextMenu(savedGroupButton, "saved-tab-group-context-menu");

  // menu
  //   .querySelector("#saved-tab-group-context-menu_openInNewWindow")
  //   .click();
  // menu.hidePopup();
  // await TestUtils.waitForCondition(
  //   () => gBrowser.getAllTabGroups().length == 2,
  //   "wait for saved group to be reopened in a new window"
  // );

  // await closeTabsMenu(newWindow);

  // group1 = gBrowser.getTabGroupById(savedGroupId);
  // info("save the group yet again");
  // group1.save();
  // await removeTabGroup(group1);

  allTabsMenu = await openTabsMenu(newWindow);
  savedGroupButton = allTabsMenu.querySelector(
    `#allTabsMenu-groupsView [data-tab-group-id="${savedGroupId}"]`
  );
  Assert.ok(savedGroupButton, "saved group should be in the TOM");

  menu = await getContextMenu(savedGroupButton, "saved-tab-group-context-menu");
  menu.querySelector("#saved-tab-group-context-menu_delete").click();
  menu.hidePopup();
  await closeTabsMenu(newWindow);

  allTabsMenu = await openTabsMenu(newWindow);
  savedGroupButton = allTabsMenu.querySelector(
    `#allTabsMenu-groupsView [data-tab-group-id="${savedGroupId}"]`
  );
  Assert.ok(!savedGroupButton, "saved group should have been forgotten");
  await closeTabsMenu(newWindow);

  await BrowserTestUtils.closeWindow(newWindow, { animate: false });

  for (let tab of tabs) {
    BrowserTestUtils.removeTab(tab);
  }
  forgetSavedTabGroups();
});

/**
 * Tests that the groups view initially shows at most 6 closed groups, or 5
 * plus a "show more" button.
 */
add_task(async function test_groupsViewShowMore() {
  const savedGroupId = "test-saved-group";

  let tabs = [];
  let groups = [];
  for (let i = 1; i <= 7; i++) {
    let tab = await addTab(`data:text/plain,tab${i}`, {
      skipAnimation: true,
    });
    await TabStateFlusher.flush(tab.linkedBrowser);
    tabs.push(tab);
    let group = gBrowser.addTabGroup([tab], {
      id: savedGroupId + i,
      label: "Test Saved Group " + i,
    });
    groups.push(group);
  }

  for (let i = 0; i < 5; i++) {
    groups[i].save();
    await removeTabGroup(groups[i]);
  }
  let allTabsMenu = await openTabsMenu(window);
  Assert.equal(
    allTabsMenu.querySelectorAll("#allTabsMenu-groupsView .all-tabs-group-item")
      .length,
    5,
    "5 groups should be shown in groups list"
  );
  Assert.ok(
    !allTabsMenu.querySelector("#allTabsMenu-groupsViewShowMore"),
    "Show more button should not be shown"
  );
  await closeTabsMenu(window);

  groups[5].save();
  await removeTabGroup(groups[5]);
  allTabsMenu = await openTabsMenu(window);
  Assert.equal(
    allTabsMenu.querySelectorAll("#allTabsMenu-groupsView .all-tabs-group-item")
      .length,
    6,
    "6 groups should be shown in groups list"
  );
  Assert.ok(
    !allTabsMenu.querySelector("#allTabsMenu-groupsViewShowMore"),
    "Show more button should not be shown"
  );
  await closeTabsMenu(window);

  groups[6].save();
  await removeTabGroup(groups[6]);
  allTabsMenu = await openTabsMenu(window);
  Assert.equal(
    allTabsMenu.querySelectorAll("#allTabsMenu-groupsView .all-tabs-group-item")
      .length,
    5,
    "5 groups should be shown in groups list"
  );
  let showMore = allTabsMenu.querySelector("#allTabsMenu-groupsViewShowMore");
  Assert.ok(showMore, "Show more button should be shown");
  showMore.click();
  Assert.equal(
    allTabsMenu.querySelectorAll("#allTabsMenu-groupsView .all-tabs-group-item")
      .length,
    7,
    "7 groups should be shown in groups list"
  );
  Assert.ok(
    !allTabsMenu.querySelector("#allTabsMenu-groupsViewShowMore"),
    "Show more button should not be shown"
  );
  await closeTabsMenu(window);

  forgetSavedTabGroups();
});
