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
    assert.ok(["role", "roleMap"].includes(setting.kind), setting.key);
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
