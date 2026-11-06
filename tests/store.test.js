// Tests for the saved characters in the database.
const test = require("node:test");
const assert = require("node:assert/strict");
const { openStore } = require("../src/store");

const kfc = (extra = {}) => ({
  discordId: "100",
  charName: "KFC",
  characterId: "abc=",
  legion: "Entropy",
  confirmed: true,
  ...extra,
});

let store;
test.beforeEach(() => {
  store = openStore(":memory:");
});

test("saves and reads back a verification", () => {
  assert.equal(store.saveVerification(kfc()), true);
  const saved = store.getVerification("100");
  assert.equal(saved.discord_id, "100");
  assert.equal(saved.char_name, "KFC");
  assert.equal(saved.character_id, "abc=");
  assert.equal(saved.legion, "Entropy");
  assert.equal(saved.confirmed, 1);
  assert.ok(saved.verified_at > 0);
  assert.equal(store.getVerification("999"), undefined);
});

test("finds who owns a character by ID, or by name when there's no ID", () => {
  store.saveVerification(kfc());
  store.saveVerification(kfc({ discordId: "200", charName: "Shugo", characterId: null }));
  assert.equal(store.findClaimOwner({ characterId: "abc=", name: "Renamed" }), "100");
  assert.equal(store.findClaimOwner({ characterId: null, name: "kfc" }), "100");
  assert.equal(store.findClaimOwner({ characterId: null, name: "SHUGO" }), "200");
  assert.equal(store.findClaimOwner({ characterId: "zzz=", name: "Nobody" }), null);
});

test("names that weren't found on the server don't block anyone", () => {
  store.saveVerification(kfc({ confirmed: false, characterId: null }));
  assert.equal(store.findClaimOwner({ characterId: null, name: "KFC" }), null);
  assert.equal(store.saveVerification(kfc({ discordId: "200" })), true);
});

test("a confirmed character can't be saved for a second member", () => {
  store.saveVerification(kfc());
  assert.equal(store.saveVerification(kfc({ discordId: "200" })), false);
  assert.equal(store.saveVerification(kfc({ discordId: "200", characterId: null })), false);
  assert.equal(store.getVerification("200"), undefined);
});

test("verifying again replaces the member's old character and frees it", () => {
  store.saveVerification(kfc());
  const first = store.getVerification("100").verified_at;
  assert.equal(store.saveVerification(kfc({ charName: "Other", characterId: "zzz=", legion: null })), true);
  const saved = store.getVerification("100");
  assert.equal(saved.char_name, "Other");
  assert.equal(saved.legion, null);
  assert.ok(saved.verified_at >= first);
  assert.equal(store.findClaimOwner({ characterId: "abc=", name: "KFC" }), null);
});

test("the same member can verify the same character again", () => {
  store.saveVerification(kfc());
  assert.equal(store.saveVerification(kfc({ legion: "Other" })), true);
  assert.equal(store.getVerification("100").legion, "Other");
});

test("removes a verification", () => {
  store.saveVerification(kfc());
  assert.equal(store.removeVerification("100"), true);
  assert.equal(store.removeVerification("100"), false);
  assert.equal(store.getVerification("100"), undefined);
});

test("lists confirmed verifications only", () => {
  store.saveVerification(kfc());
  store.saveVerification(kfc({ discordId: "200", charName: "Typo", characterId: null, confirmed: false }));
  assert.deepEqual(
    store.listConfirmedVerifications().map((row) => row.discord_id),
    ["100"]
  );
});

test("updates the saved name after a rename", () => {
  store.saveVerification(kfc());
  store.updateCharacterName("100", "Kfc");
  assert.equal(store.getVerification("100").char_name, "Kfc");
  assert.equal(store.findClaimOwner({ characterId: null, name: "kfc" }), "100");
});
