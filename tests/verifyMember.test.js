// Tests for fetching a member before verifying: the bot must ask Discord for their current roles, not use an old copy.
const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchFreshMember } = require("../src/verify/member");

const guildWith = (fetch) => ({ members: { fetch } });

test("asks Discord for the member instead of using the saved copy", async () => {
  let asked;
  const member = { id: "100" };
  const result = await fetchFreshMember(
    guildWith(async (options) => {
      asked = options;
      return member;
    }),
    "100"
  );
  assert.equal(result, member);
  assert.deepEqual(asked, { user: "100", force: true });
});

test("returns null when the member isn't in the server", async () => {
  const result = await fetchFreshMember(
    guildWith(async () => {
      throw new Error("Unknown Member");
    }),
    "100"
  );
  assert.equal(result, null);
});
