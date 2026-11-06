// Tests for checking a panel's settings, building the panel message and the ticket button IDs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkPanelConfig, buildPanelMessage, parseColour } = require("../src/tickets/panel");
const { ticketId, parseTicketId } = require("../src/tickets/ids");

const ID = "123456789012345678";
const type = (extra = {}) => ({
  label: "Apply",
  openCategoryId: ID,
  closedCategoryId: ID,
  staffRoleIds: [ID],
  ...extra,
});
const config = (extra = {}) => ({ channelId: ID, title: "Tickets", description: "Pick one", types: [type()], ...extra });

test("fills in defaults for a minimal panel", () => {
  const { errors, panel } = checkPanelConfig(config());
  assert.deepEqual(errors, []);
  assert.equal(panel.colour, 0x5865f2);
  assert.equal(panel.image, null);
  assert.deepEqual(panel.types[0], {
    label: "Apply",
    slug: "apply",
    emoji: null,
    style: "primary",
    nameSchema: "{type}-{number}",
    openCategoryId: ID,
    closedCategoryId: ID,
    staffRoleIds: [ID],
    openLimit: 1,
    deleteAfterDays: 7,
    messages: [],
  });
});

test("keeps the settings that were given", () => {
  const { errors, panel } = checkPanelConfig(
    config({
      colour: "#3b82f6",
      image: "https://example.com/banner.png",
      types: [
        type({
          emoji: "📝",
          style: "success",
          nameSchema: "{user}-{number}",
          openLimit: 2,
          deleteAfterDays: 0,
          messages: [{ kind: "embed", content: "Hello {member}" }],
        }),
      ],
    })
  );
  assert.deepEqual(errors, []);
  assert.equal(panel.colour, 0x3b82f6);
  assert.equal(panel.image, "https://example.com/banner.png");
  assert.equal(panel.types[0].style, "success");
  assert.equal(panel.types[0].openLimit, 2);
  assert.equal(panel.types[0].deleteAfterDays, 0);
  assert.deepEqual(panel.types[0].messages, [{ kind: "embed", content: "Hello {member}" }]);
});

test("lists every problem with a panel", () => {
  const { errors } = checkPanelConfig({
    channelId: "nope",
    title: "",
    description: "x".repeat(4001),
    colour: "blue",
    types: [
      type({ label: "", style: "pink", staffRoleIds: [], openCategoryId: "x", openLimit: 0, deleteAfterDays: -1 }),
      type({ messages: [{ kind: "video", content: "" }] }),
    ],
  });
  assert.deepEqual(errors, [
    "channelId must be a Discord ID",
    "title is required (up to 256 characters)",
    "description can be at most 4000 characters",
    "colour must look like #3b82f6",
    "types[0].label is required (up to 80 characters)",
    "types[0].style must be primary, secondary, success or danger",
    "types[0].openCategoryId must be a Discord ID",
    "types[0].staffRoleIds needs at least one role ID",
    "types[0].openLimit must be a whole number of 1 or more",
    "types[0].deleteAfterDays must be a whole number of 0 or more",
    "types[1].messages[0].kind must be text or embed",
    "types[1].messages[0].content is required (up to 2000 characters for text, 4000 for embed)",
  ]);
});

test("IDs typed without quotes get a clear explanation", () => {
  const { errors } = checkPanelConfig(
    config({ channelId: 123, types: [type({ openCategoryId: 1567942746155786370, staffRoleIds: [1567942745090429096] })] })
  );
  assert.deepEqual(errors, [
    'channelId must be in quotes, like "123456789012345678". Discord IDs are too long to write without them.',
    'types[0].openCategoryId must be in quotes, like "123456789012345678". Discord IDs are too long to write without them.',
    'types[0].staffRoleIds must be in quotes, like ["123456789012345678"]. Discord IDs are too long to write without them.',
  ]);
});

test("a panel needs 1 to 25 types and each type up to 5 messages", () => {
  assert.deepEqual(checkPanelConfig(config({ types: [] })).errors, ["types needs 1 to 25 ticket types"]);
  const many = Array.from({ length: 26 }, () => type());
  assert.deepEqual(checkPanelConfig(config({ types: many })).errors, ["types needs 1 to 25 ticket types"]);
  const messages = Array.from({ length: 6 }, () => ({ kind: "text", content: "hi" }));
  assert.deepEqual(checkPanelConfig(config({ types: [type({ messages })] })).errors, [
    "types[0].messages can have at most 5 messages",
  ]);
});

test("reads colours", () => {
  assert.equal(parseColour("#3B82F6"), 0x3b82f6);
  assert.equal(parseColour("3b82f6"), 0x3b82f6);
  assert.equal(parseColour("blue"), null);
});

test("builds and reads ticket button IDs", () => {
  assert.equal(ticketId("open", 3, 12), "ticket:open:3:12");
  assert.deepEqual(parseTicketId("ticket:open:3:12"), { action: "open", ids: [3, 12] });
  assert.deepEqual(parseTicketId("ticket:close-yes:9"), { action: "close-yes", ids: [9] });
});

test("the panel message has one button per type, 5 to a row", () => {
  const types = Array.from({ length: 7 }, (_, i) => ({
    id: i + 1,
    label: `Type ${i + 1}`,
    emoji: i === 0 ? "📝" : null,
    style: i === 1 ? "danger" : "primary",
  }));
  const message = buildPanelMessage({
    id: 4,
    title: "Tickets",
    description: "Pick one",
    colour: 0x3b82f6,
    image: "https://example.com/banner.png",
    types,
  });
  const embed = message.embeds[0].toJSON();
  assert.equal(embed.title, "Tickets");
  assert.equal(embed.description, "Pick one");
  assert.equal(embed.color, 0x3b82f6);
  assert.equal(embed.image.url, "https://example.com/banner.png");

  const rows = message.components.map((row) => row.toJSON().components);
  assert.deepEqual(rows.map((row) => row.length), [5, 2]);
  assert.equal(rows[0][0].custom_id, "ticket:open:4:1");
  assert.equal(rows[0][0].label, "Type 1");
  assert.equal(rows[0][0].emoji.name, "📝");
  assert.equal(rows[0][0].style, 1);
  assert.equal(rows[0][1].style, 4);
  assert.equal(rows[1][1].custom_id, "ticket:open:4:7");
});
