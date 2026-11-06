// Reads the verification settings from .env: the legion and the three roles.
//   loadVerifyConfig  builds the settings from a set of .env values, failing if a role is missing
//   getVerifyConfig   loads the settings from .env once and reuses them

const REQUIRED_ROLES = { guildRoleId: "GUILD_ROLE_ID", trustedRoleId: "TRUSTED_ROLE_ID", guestRoleId: "GUEST_ROLE_ID" };

let loaded = null;

function loadVerifyConfig(env) {
  const config = { legion: env.VERIFY_LEGION?.trim() || "Entropy" };
  const missing = [];
  for (const [field, key] of Object.entries(REQUIRED_ROLES)) {
    const value = env[key]?.trim();
    if (value) config[field] = value;
    else missing.push(key);
  }
  if (missing.length > 0) throw new Error(`Missing role settings in .env: ${missing.join(", ")}`);
  return config;
}

function getVerifyConfig() {
  loaded ??= loadVerifyConfig(process.env);
  return loaded;
}

module.exports = { loadVerifyConfig, getVerifyConfig };
