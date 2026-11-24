// Tests for the roles admins pick with /settings: reading old .env lines, what's missing, problems, and saving.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SETTINGS,
  settingByKey,
  importsFromEnv,
  missingRequired,
  toConfigFields,
  findProblems,
  describeValue,
  addRoleMapEntry,
  removeRoleMapEntry,
} = require("../src/settings/ids");
const { openStore } = require("../src/store");

test("every setting has a unique key, a label and a known kind", () => {
  const keys = SETTINGS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const setting of SETTINGS) {
    assert.ok(setting.label, setting.key);
    assert.ok(["role", "roleMap", "counters"].includes(setting.kind), setting.key);
  }
});

test("importsFromEnv reads the old .env lines, without caring about capitals or spaces", () => {
  const env = {
    GUILD_ROLE_ID: " 111 ",
    TRUSTED_ROLE_ID: "",
    GUEST_ROLE_ID: "333",
    CLASS_ROLES: " Gladiator : 10 ,cleric:11, ",
    BOT_TOKEN: "secret",
  };
  assert.deepEqual(importsFromEnv(env), [
    { key: "GUILD_ROLE_ID", value: "111" },
    { key: "GUEST_ROLE_ID", value: "333" },
    {
      key: "CLASS_ROLES",
      value: [
        { name: "Gladiator", roleId: "10" },
        { name: "cleric", roleId: "11" },
      ],
    },
  ]);
});

test("importsFromEnv skips values that aren't IDs instead of failing", () => {
  assert.deepEqual(importsFromEnv({ GUILD_ROLE_ID: "abc", CLASS_ROLES: "Gladiator" }), []);
  assert.deepEqual(importsFromEnv({ CLASS_ROLES: "Gladiator:" }), []);
});

test("missingRequired lists required roles that are empty", () => {
  const missing = missingRequired({ GUILD_ROLE_ID: "1" }).map((s) => s.key);
  assert.deepEqual(missing, ["TRUSTED_ROLE_ID", "GUEST_ROLE_ID"]);
});

test("toConfigFields gives the role fields verification reads", () => {
  assert.deepEqual(
    toConfigFields({
      GUILD_ROLE_ID: "1",
      GUEST_ROLE_ID: "3",
      CLASS_ROLES: [
        { name: "Gladiator", roleId: "10" },
        { name: "cleric", roleId: "11" },
      ],
    }),
    { guildRoleId: "1", trustedRoleId: null, guestRoleId: "3", classRoles: { gladiator: "10", cleric: "11" } }
  );
  assert.deepEqual(toConfigFields({}).classRoles, {});
});

test("findProblems spots deleted roles and roles the bot can't give", () => {
  const guild = { hasRole: (id) => id !== "gone", canGiveRole: (id) => id !== "high" };
  assert.deepEqual(
    findProblems(
      {
        GUILD_ROLE_ID: "high",
        GUEST_ROLE_ID: "gone",
        CLASS_ROLES: [
          { name: "Ranger", roleId: "gone" },
          { name: "Cleric", roleId: "high" },
        ],
      },
      guild
    ),
    [
      "Guild role: the bot's own role must be above this role to give it out.",
      "Guest role: the role was deleted.",
      "Class roles: the role for Ranger was deleted.",
      "Class roles: the bot's own role must be above the role for Cleric to give it out.",
    ]
  );
});

test("describeValue shows mentions or 'not set'", () => {
  assert.equal(describeValue(settingByKey("GUILD_ROLE_ID"), "1"), "<@&1>");
  assert.equal(describeValue(settingByKey("GUILD_ROLE_ID"), null), "not set");
  assert.equal(describeValue(settingByKey("CLASS_ROLES"), [{ name: "Ranger", roleId: "5" }]), "Ranger → <@&5>");
  assert.equal(describeValue(settingByKey("CLASS_ROLES"), []), "not set");
});

test("class roles: adding replaces the same name, removing drops it", () => {
  let list = addRoleMapEntry([], "Ranger", "1");
  list = addRoleMapEntry(list, " Cleric ", "2");
  list = addRoleMapEntry(list, "ranger", "3");
  assert.deepEqual(list, [
    { name: "ranger", roleId: "3" },
    { name: "Cleric", roleId: "2" },
  ]);
  assert.deepEqual(removeRoleMapEntry(list, "RANGER"), [{ name: "Cleric", roleId: "2" }]);
  assert.throws(() => addRoleMapEntry([], "  ", "1"), /name/);
  assert.throws(() => addRoleMapEntry([], "Ranger:x", "1"), /name/);
});

test("counters: one entry listing the counter names, never a problem, and not read from .env", () => {
  const counters = settingByKey("COUNTERS");
  assert.equal(counters.required, false);
  assert.equal(counters.kind, "counters");
  assert.equal(describeValue(counters, ["Bad words", "Raid deaths"]), "Bad words, Raid deaths");
  assert.equal(describeValue(counters, []), "none yet");
  assert.deepEqual(findProblems({ COUNTERS: ["x"] }, { hasRole: () => false, canGiveRole: () => false }), []);
  assert.deepEqual(importsFromEnv({ COUNTERS: "x" }), []);
  for (const old of ["BAD_WORDS", "BAD_WORD_REACTION", "BAD_WORD_LEADERBOARD_TITLE"]) assert.equal(settingByKey(old), null);
  assert.deepEqual(missingRequired({}).map((s) => s.key), ["GUILD_ROLE_ID", "TRUSTED_ROLE_ID", "GUEST_ROLE_ID"]);
});

test("the streaming role: optional, a role, and checked for problems like the others", () => {
  const role = settingByKey("STREAMING_ROLE_ID");
  assert.equal(role.required, false);
  assert.equal(role.kind, "role");
  assert.equal(describeValue(role, "7"), "<@&7>");
  const guild = { hasRole: () => false, canGiveRole: () => false };
  assert.deepEqual(findProblems({ STREAMING_ROLE_ID: "7" }, guild), ["Streaming role: the role was deleted."]);
  assert.deepEqual(missingRequired({}).map((s) => s.key), ["GUILD_ROLE_ID", "TRUSTED_ROLE_ID", "GUEST_ROLE_ID"]);
});

test("server settings in the database", async (t) => {
  const store = openStore(":memory:");
  t.after(() => store.close());

  await t.test("saves, reads and clears settings", () => {
    store.setServerSetting("GUILD_ROLE_ID", "1", "admin");
    store.setServerSetting("CLASS_ROLES", [{ name: "Ranger", roleId: "2" }], "admin");
    assert.deepEqual(store.getServerSettings(), {
      GUILD_ROLE_ID: "1",
      CLASS_ROLES: [{ name: "Ranger", roleId: "2" }],
    });
    store.setServerSetting("GUILD_ROLE_ID", null, "admin");
    assert.deepEqual(Object.keys(store.getServerSettings()), ["CLASS_ROLES"]);
  });

  await t.test("copies from .env only once and never overwrites a saved value", () => {
    const first = store.importServerSettingsOnce([
      { key: "CLASS_ROLES", value: [] },
      { key: "TRUSTED_ROLE_ID", value: "9" },
    ]);
    assert.deepEqual(first, ["TRUSTED_ROLE_ID"]);
    assert.deepEqual(store.getServerSettings().CLASS_ROLES, [{ name: "Ranger", roleId: "2" }]);

    store.setServerSetting("TRUSTED_ROLE_ID", null, "admin");
    assert.equal(store.importServerSettingsOnce([{ key: "TRUSTED_ROLE_ID", value: "9" }]), null);
    assert.equal(store.getServerSettings().TRUSTED_ROLE_ID, undefined);
  });
});

const { changesFromOptions, CLASSES } = require("../src/settings/ids");

test("every role setting has an option name for typing it in /settings", () => {
  const roles = SETTINGS.filter((s) => s.kind === "role");
  assert.deepEqual(roles.map((s) => s.option), ["guild-role", "trusted-role", "guest-role", "streaming-role"]);
  assert.deepEqual(CLASSES, ["Gladiator", "Templar", "Assassin", "Ranger", "Sorcerer", "Spiritmaster", "Cleric", "Chanter"]);
});

test("typed options turn into only the settings that were filled in", () => {
  assert.deepEqual(changesFromOptions({}, {}), []);
  const changes = changesFromOptions({}, { GUILD_ROLE_ID: "1", STREAMING_ROLE_ID: "4", GUEST_ROLE_ID: null });
  assert.deepEqual(
    changes.map((c) => [c.setting.key, c.value]),
    [
      ["GUILD_ROLE_ID", "1"],
      ["STREAMING_ROLE_ID", "4"],
    ]
  );
});

test("a typed class and role are added to the class list, replacing that class's old role", () => {
  const values = { CLASS_ROLES: [{ name: "Ranger", roleId: "1" }, { name: "Cleric", roleId: "2" }] };
  const [change] = changesFromOptions(values, { className: "Ranger", classRoleId: "9" });
  assert.equal(change.setting.key, "CLASS_ROLES");
  assert.deepEqual(change.value, [{ name: "Ranger", roleId: "9" }, { name: "Cleric", roleId: "2" }]);
  const [added] = changesFromOptions({}, { className: "Chanter", classRoleId: "3" });
  assert.deepEqual(added.value, [{ name: "Chanter", roleId: "3" }]);
});

test("a class without a role, or a role without a class, is turned down", () => {
  assert.throws(() => changesFromOptions({}, { className: "Ranger" }), /class and class-role/);
  assert.throws(() => changesFromOptions({}, { classRoleId: "3", GUILD_ROLE_ID: "1" }), /class and class-role/);
});
