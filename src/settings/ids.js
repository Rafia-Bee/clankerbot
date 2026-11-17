// The roles admins pick with /settings, and the rules around them.
//   SETTINGS            every setting: its old .env name, label, kind, and whether it's required
//   settingByKey        finds a setting by its key
//   importsFromEnv      the roles found in the old .env lines, ready to copy into the database
//   isEmpty             true when a setting has no value
//   missingRequired     the required roles that aren't set
//   toConfigFields      turns saved values into the role fields verification reads
//   findProblems        deleted roles, and roles the bot can't give out
//   describeValue       a setting's value as Discord mentions, or "not set"
//   addRoleMapEntry     adds or replaces a class in the class role list
//   removeRoleMapEntry  removes a class from the class role list

const SETTINGS = [
  { key: "GUILD_ROLE_ID", label: "Guild role", kind: "role", required: true, help: "Given, with the Trusted role, to members whose character is in the guild's legion." },
  { key: "TRUSTED_ROLE_ID", label: "Trusted role", kind: "role", required: true, help: "Given together with the Guild role." },
  { key: "GUEST_ROLE_ID", label: "Guest role", kind: "role", required: true, help: "Given to everyone else who verifies: other legions, no legion, or a name not found on the server." },
  { key: "CLASS_ROLES", label: "Class roles", kind: "roleMap", entryName: "Class", help: "Each class and its role: Gladiator, Templar, Assassin, Ranger, Sorcerer, Spiritmaster, Cleric, Chanter." },
];

const ID = /^\d+$/;

function settingByKey(key) {
  return SETTINGS.find((setting) => setting.key === key) ?? null;
}

function roleMapFromEnv(text) {
  const entries = [];
  for (const entry of text.split(",").map((part) => part.trim()).filter(Boolean)) {
    const [name, roleId, ...rest] = entry.split(":").map((part) => part.trim());
    if (!name || !ID.test(roleId ?? "") || rest.length > 0) return null;
    entries.push({ name, roleId });
  }
  return entries;
}

function valueFromEnv(setting, raw) {
  const text = raw?.trim();
  if (!text) return null;
  if (setting.kind === "roleMap") return roleMapFromEnv(text);
  return ID.test(text) ? text : null;
}

function importsFromEnv(env) {
  return SETTINGS.map((setting) => ({ key: setting.key, value: valueFromEnv(setting, env[setting.key]) })).filter(
    ({ value }) => !isEmpty(value)
  );
}

function isEmpty(value) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function missingRequired(values) {
  return SETTINGS.filter((setting) => setting.required && isEmpty(values[setting.key]));
}

function toConfigFields(values) {
  const one = (key) => (isEmpty(values[key]) ? null : values[key]);
  const classRoles = {};
  for (const { name, roleId } of values.CLASS_ROLES ?? []) classRoles[name.toLowerCase()] = roleId;
  return {
    guildRoleId: one("GUILD_ROLE_ID"),
    trustedRoleId: one("TRUSTED_ROLE_ID"),
    guestRoleId: one("GUEST_ROLE_ID"),
    classRoles,
  };
}

function findProblems(values, guild) {
  const problems = [];
  for (const setting of SETTINGS) {
    const value = values[setting.key];
    if (isEmpty(value)) continue;
    if (setting.kind === "role") {
      if (!guild.hasRole(value)) problems.push(`${setting.label}: the role was deleted.`);
      else if (!guild.canGiveRole(value)) {
        problems.push(`${setting.label}: the bot's own role must be above this role to give it out.`);
      }
    } else {
      for (const { name, roleId } of value) {
        if (!guild.hasRole(roleId)) problems.push(`${setting.label}: the role for ${name} was deleted.`);
        else if (!guild.canGiveRole(roleId)) {
          problems.push(`${setting.label}: the bot's own role must be above the role for ${name} to give it out.`);
        }
      }
    }
  }
  return problems;
}

function describeValue(setting, value) {
  if (isEmpty(value)) return "not set";
  if (setting.kind === "role") return `<@&${value}>`;
  return value.map(({ name, roleId }) => `${name} → <@&${roleId}>`).join("\n");
}

function addRoleMapEntry(list, rawName, roleId) {
  const name = rawName.trim();
  if (!name || name.includes(":") || name.includes(",") || name.length > 50) {
    throw new Error("The name can't be empty, longer than 50 letters, or contain : or ,");
  }
  const lower = name.toLowerCase();
  const index = list.findIndex((entry) => entry.name.toLowerCase() === lower);
  const entry = { name, roleId };
  if (index === -1) return [...list, entry];
  return list.map((existing, i) => (i === index ? entry : existing));
}

function removeRoleMapEntry(list, name) {
  const lower = name.trim().toLowerCase();
  return list.filter((entry) => entry.name.toLowerCase() !== lower);
}

module.exports = {
  SETTINGS,
  settingByKey,
  importsFromEnv,
  isEmpty,
  missingRequired,
  toConfigFields,
  findProblems,
  describeValue,
  addRoleMapEntry,
  removeRoleMapEntry,
};
