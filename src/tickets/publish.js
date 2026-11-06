// Publishes ticket panels and saves edits to them. Used by the wizard, /ticket-panels and the script.
//   publishPanel    checks, saves and posts a new panel; undoes the save if posting fails
//   savePanelEdits  checks and saves an edited panel, then updates (or reposts) its message

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

async function savePanelEdits({ store, config, panelId, deliver }) {
  const current = store.getPanel(panelId);
  if (!current || current.deleted_at) return { errors: ["This panel was deleted, so it can't be edited."] };
  const { errors, panel } = checkPanelConfig(config);
  if (errors.length > 0) return { errors };

  store.updatePanel(panelId, panel);
  const message = buildPanelMessage({ ...panel, id: panelId, types: store.getPanel(panelId).types });
  const { channelId, messageId } = await deliver(message, panel.channelId);
  store.setPanelLocation(panelId, channelId, messageId);
  return { errors: [], panelId, panel };
}

module.exports = { publishPanel, savePanelEdits };
