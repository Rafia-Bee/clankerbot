// Tests for publishing a panel: saving it, posting it, and undoing the save if posting fails.
const test = require("node:test");
const assert = require("node:assert/strict");
const { openStore } = require("../src/store");
const { publishPanel } = require("../src/tickets/publish");

const ID = "123456789012345678";
const config = {
  channelId: ID,
  title: "Tickets",
  description: "Pick one",
  types: [
    { label: "Apply", openCategoryId: ID, closedCategoryId: ID, staffRoleIds: [ID] },
    { label: "Report", openCategoryId: ID, closedCategoryId: ID, staffRoleIds: [ID] },
  ],
};

test("saves the panel, posts it with its buttons and remembers the message", async () => {
  const store = openStore(":memory:");
  const posted = [];
  const result = await publishPanel({
    store,
    config,
    guildId: "1",
    post: async (message, channelId) => {
      posted.push({ message, channelId });
      return "999";
    },
  });
  assert.deepEqual(result.errors, []);
  const panel = store.getPanel(result.panelId);
  assert.equal(panel.message_id, "999");
  assert.equal(panel.guild_id, "1");
  assert.equal(posted[0].channelId, ID);
  const buttons = posted[0].message.components[0].toJSON().components;
  assert.deepEqual(
    buttons.map((b) => b.custom_id),
    panel.types.map((t) => `ticket:open:${result.panelId}:${t.id}`)
  );
});

test("a panel with problems isn't saved or posted", async () => {
  const store = openStore(":memory:");
  let posted = false;
  const result = await publishPanel({
    store,
    config: { ...config, title: "" },
    guildId: "1",
    post: async () => {
      posted = true;
    },
  });
  assert.deepEqual(result.errors, ["title is required (up to 256 characters)"]);
  assert.equal(posted, false);
  assert.equal(store.getPanel(1), undefined);
});

test("if posting fails, the saved panel is removed again", async () => {
  const store = openStore(":memory:");
  await assert.rejects(
    publishPanel({
      store,
      config,
      guildId: "1",
      post: async () => {
        throw new Error("Missing Access");
      },
    }),
    /Missing Access/
  );
  assert.equal(store.getPanel(1), undefined);
});
