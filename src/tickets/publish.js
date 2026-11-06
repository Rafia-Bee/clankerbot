// Publishes a ticket panel: checks its settings, saves it, posts it and saves the message ID. Used by the wizard and the script.
//   publishPanel  returns the problems if the settings are wrong; undoes the save if posting fails

const { checkPanelConfig, buildPanelMessage } = require("./panel");

async function publishPanel({ store, config, guildId, post }) {
  const { errors, panel } = checkPanelConfig(config);
  if (errors.length > 0) return { errors };

  const { panelId } = store.createPanel({ ...panel, guildId });
  const message = buildPanelMessage({ ...panel, id: panelId, types: store.getPanel(panelId).types });
  try {
    const messageId = await post(message, panel.channelId);
    store.setPanelMessage(panelId, messageId);
  } catch (error) {
    store.deletePanel(panelId);
    throw error;
  }
  return { errors: [], panelId, panel };
}

module.exports = { publishPanel };
