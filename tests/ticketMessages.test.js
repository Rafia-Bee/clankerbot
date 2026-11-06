// Tests for the opening messages posted in a new ticket.
const test = require("node:test");
const assert = require("node:assert/strict");
const { fillPlaceholders, buildOpeningMessages } = require("../src/tickets/messages");

const context = { memberId: "1", staffRoleIds: ["10", "11"], typeLabel: "Apply", colour: 0x3b82f6 };

test("fills in member, staff and type", () => {
  assert.deepEqual(fillPlaceholders("{member} hi {staff}, this is {type}", context), {
    text: "<@1> hi <@&10> <@&11>, this is Apply",
    users: ["1"],
    roles: ["10", "11"],
  });
});

test("only placeholders that are used can ping", () => {
  assert.deepEqual(fillPlaceholders("Thanks for your {type} ticket", context), {
    text: "Thanks for your Apply ticket",
    users: [],
    roles: [],
  });
});

test("text messages ping only what the placeholders name", () => {
  const [message] = buildOpeningMessages({ ...context, messages: [{ kind: "text", content: "@everyone {member}" }] });
  assert.equal(message.content, "@everyone <@1>");
  assert.deepEqual(message.allowedMentions, { parse: [], users: ["1"], roles: [] });
});

test("embed messages get the panel colour", () => {
  const [message] = buildOpeningMessages({ ...context, messages: [{ kind: "embed", content: "Answer these: {type}" }] });
  const embed = message.embeds[0].toJSON();
  assert.equal(embed.description, "Answer these: Apply");
  assert.equal(embed.color, 0x3b82f6);
  assert.deepEqual(message.allowedMentions, { parse: [], users: [], roles: [] });
});

test("messages keep their order", () => {
  const messages = buildOpeningMessages({
    ...context,
    messages: [
      { kind: "text", content: "first" },
      { kind: "text", content: "second" },
    ],
  });
  assert.deepEqual(messages.map((m) => m.content), ["first", "second"]);
});

test("a type without messages gets a short default", () => {
  const [message] = buildOpeningMessages({ ...context, messages: [] });
  assert.equal(message.content, "<@1> opened a **Apply** ticket. Staff will be with you soon.");
  assert.deepEqual(message.allowedMentions, { parse: [], users: ["1"], roles: [] });
});
