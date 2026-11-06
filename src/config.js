// Checks the bot's settings from .env.
//   missingSettings  lists the named settings that are missing or blank

function missingSettings(env, names) {
  return names.filter((name) => !env[name]?.trim());
}

module.exports = { missingSettings };
