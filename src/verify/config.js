// Reads the verification settings from .env: the legion, the three roles and the class roles.
//   parseClassRoles   turns "Gladiator:123,Cleric:456" into { gladiator: "123", cleric: "456" }, failing on a bad entry
//   loadVerifyConfig  builds the settings from a set of .env values, failing if a role is missing
//   getVerifyConfig   loads the settings from .env once and reuses them

const REQUIRED_ROLES = { guildRoleId: "GUILD_ROLE_ID", trustedRoleId: "TRUSTED_ROLE_ID", guestRoleId: "GUEST_ROLE_ID" };

let loaded = null;

function parseClassRoles(value = "") {
  const classRoles = {};
  for (const entry of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const [className, roleId, ...rest] = entry.split(":").map((part) => part.trim());
    if (!className || !roleId || rest.length > 0) {
      throw new Error(`CLASS_ROLES in .env should look like Gladiator:123,Cleric:456, but has "${entry}"`);
    }
    classRoles[className.toLowerCase()] = roleId;
  }
  return classRoles;
}

function loadVerifyConfig(env) {
  const config = { legion: env.VERIFY_LEGION?.trim() || "Entropy" };
  const missing = [];
  for (const [field, key] of Object.entries(REQUIRED_ROLES)) {
    const value = env[key]?.trim();
    if (value) config[field] = value;
    else missing.push(key);
  }
  if (missing.length > 0) throw new Error(`Missing role settings in .env: ${missing.join(", ")}`);
  config.classRoles = parseClassRoles(env.CLASS_ROLES);
  return config;
}

function getVerifyConfig() {
  loaded ??= loadVerifyConfig(process.env);
  return loaded;
}

module.exports = { loadVerifyConfig, getVerifyConfig };
