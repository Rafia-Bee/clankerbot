// The verification settings: the legion from .env, and the roles admins picked with /settings.
//   loadVerifyConfig          builds the settings from .env values and the saved roles (missing roles are null)
//   getVerifyConfig           loads the settings once and reuses them until they change
//   clearVerifyConfig         makes the next getVerifyConfig read the saved roles again
//   missingRoles              the names of the required roles that aren't picked yet
//   importRoleSettingsFromEnv copies the old role lines from .env into the database, the first time only

const { importsFromEnv, missingRequired, toConfigFields } = require("../settings/ids");
const { getStore } = require("../store");

let loaded = null;

function loadVerifyConfig(env, saved) {
  return { legion: env.VERIFY_LEGION?.trim() || "Entropy", ...toConfigFields(saved) };
}

function getVerifyConfig() {
  loaded ??= loadVerifyConfig(process.env, getStore().getServerSettings());
  return loaded;
}

function clearVerifyConfig() {
  loaded = null;
}

function missingRoles() {
  return missingRequired(getStore().getServerSettings()).map((setting) => setting.label);
}

function importRoleSettingsFromEnv() {
  const imported = getStore().importServerSettingsOnce(importsFromEnv(process.env));
  if (imported?.length) {
    console.log(`Copied these settings from .env into the database (change them with /settings): ${imported.join(", ")}`);
  }
  loaded = null;
}

module.exports = { loadVerifyConfig, getVerifyConfig, clearVerifyConfig, missingRoles, importRoleSettingsFromEnv };
