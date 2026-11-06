// The /ticket-setup command: a step-by-step wizard for making a ticket panel, saved as a draft until it's published.
//   optional       reads a pop-up field, or gives a fallback when the field was left out
//   liveProblems   checks the draft against the server: channels and categories still there, the bot can post
//   save           saves the draft and shows a screen
//   publish        posts the panel and ends the setup
//   handleAction   does what a setup button, dropdown or pop-up asked for
//   execute        starts a new setup, or picks up an unfinished one

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require("discord.js");
const { getStore } = require("../store");
const {
  emptyDraft,
  applyPanelText,
  applyTypeBasics,
  applyTypeWhere,
  applyTypeMessages,
  removeType,
  moveType,
  draftProblems,
} = require("../tickets/draft");
const { publishPanel } = require("../tickets/publish");
const {
  mainView,
  typeView,
  panelTextModal,
  typeBasicsModal,
  typeWhereModal,
  typeMessagesModal,
  MESSAGE_BOXES,
} = require("../tickets/setupView");

const PREFIX = "tsetup";
const POST_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];
const ENDED = { content: "This setup has ended. Run /ticket-setup to start a new one.", embeds: [], components: [] };

function optional(read, fallback) {
  try {
    return read() ?? fallback;
  } catch {
    return fallback;
  }
}

function liveProblems(guild, draft) {
  const problems = [];
  const channel = guild.channels.cache.get(draft.channelId);
  if (!channel?.isTextBased()) {
    problems.push("The panel's channel was deleted. Pick another one (Panel text).");
  } else if (!channel.permissionsFor(guild.members.me)?.has(POST_PERMISSIONS)) {
    problems.push(`I can't post in ${channel}. I need View Channel, Send Messages and Embed Links there.`);
  }
  draft.types.forEach((type, i) => {
    const name = type.label || `Ticket type ${i + 1}`;
    for (const [key, which] of [["openCategoryId", "open"], ["closedCategoryId", "closed"]]) {
      if (guild.channels.cache.get(type[key])?.type !== ChannelType.GuildCategory) {
        problems.push(`${name}: the category for ${which} tickets was deleted. Pick another one (Where and who).`);
      }
    }
    if (type.staffRoleIds.some((role) => !guild.roles.cache.has(role))) {
      problems.push(`${name}: one of the staff roles was deleted. Pick them again (Where and who).`);
    }
  });
  return { channel, problems };
}

function save(interaction, draft, view) {
  getStore().saveDraft(interaction.user.id, interaction.guildId, draft);
  return interaction.update(view);
}

async function publish(interaction, draft) {
  const store = getStore();
  const problems = draftProblems(draft);
  if (problems.length) return interaction.update(mainView(draft, { note: "Fix what's still needed first." }));
  const live = liveProblems(interaction.guild, draft);
  if (live.problems.length) {
    return interaction.update(mainView(draft, { note: `Can't publish yet:\n- ${live.problems.join("\n- ")}` }));
  }

  await interaction.deferUpdate();
  try {
    const result = await publishPanel({
      store,
      config: draft,
      guildId: interaction.guildId,
      post: async (message) => (await live.channel.send(message)).id,
    });
    if (result.errors.length) {
      return interaction.editReply(mainView(draft, { note: `Can't publish yet:\n- ${result.errors.join("\n- ")}` }));
    }
    store.deleteDraft(interaction.user.id, interaction.guildId);
    return interaction.editReply({
      content: `Published the panel in ${live.channel}. Members can open tickets now.`,
      embeds: [],
      components: [],
    });
  } catch (error) {
    console.warn(`Publishing a ticket panel failed: ${error.message}`);
    return interaction.editReply(mainView(draft, { note: `I couldn't post the panel: ${error.message}` }));
  }
}

async function handleAction(interaction, draft, action, index) {
  const fields = interaction.fields;
  switch (action) {
    case "panel":
      return interaction.showModal(panelTextModal(draft));
    case "panel-save":
      draft = applyPanelText(draft, {
        title: fields.getTextInputValue("title"),
        description: fields.getTextInputValue("description"),
        colour: fields.getTextInputValue("colour"),
        image: fields.getTextInputValue("image"),
        channelId: optional(() => fields.getSelectedChannels("channel")?.first()?.id, draft.channelId),
      });
      return save(interaction, draft, mainView(draft));
    case "add":
      return interaction.showModal(typeBasicsModal(draft, null));
    case "basics":
      return interaction.showModal(typeBasicsModal(draft, index));
    case "basics-save": {
      const result = applyTypeBasics(draft, index, {
        label: fields.getTextInputValue("label"),
        emoji: fields.getTextInputValue("emoji"),
        style: optional(() => fields.getStringSelectValues("style")[0], "primary"),
        nameSchema: fields.getTextInputValue("naming"),
        deleteAfterDays: fields.getTextInputValue("delete_days"),
      });
      const note = index == null ? "Ticket type added. Next, press Where and who." : null;
      return save(interaction, result.draft, typeView(result.draft, result.index, { note }));
    }
    case "where":
      return interaction.showModal(typeWhereModal(draft, index));
    case "where-save":
      draft = applyTypeWhere(draft, index, {
        openCategoryId: optional(() => fields.getSelectedChannels("open_category")?.first()?.id, null),
        closedCategoryId: optional(() => fields.getSelectedChannels("closed_category")?.first()?.id, null),
        staffRoleIds: optional(() => [...fields.getSelectedRoles("staff").keys()], []),
        openLimit: fields.getTextInputValue("open_limit"),
      });
      return save(interaction, draft, typeView(draft, index));
    case "messages":
      return interaction.showModal(typeMessagesModal(draft, index));
    case "messages-save":
      draft = applyTypeMessages(draft, index, {
        texts: Array.from({ length: MESSAGE_BOXES }, (_, i) => fields.getTextInputValue(`message_${i}`)),
        embeds: optional(() => fields.getCheckboxGroup("embeds"), []),
      });
      return save(interaction, draft, typeView(draft, index));
    case "edit":
      return interaction.update(typeView(draft, Number(interaction.values[0])));
    case "up":
    case "down": {
      const moved = moveType(draft, index, action === "up" ? -1 : 1);
      return save(interaction, moved.draft, typeView(moved.draft, moved.index));
    }
    case "remove": {
      const name = draft.types[index].label || `Ticket type ${index + 1}`;
      draft = removeType(draft, index);
      return save(interaction, draft, mainView(draft, { note: `Removed ${name}.` }));
    }
    case "back":
      return interaction.update(mainView(draft));
    case "publish":
      return publish(interaction, draft);
    case "cancel":
      getStore().deleteDraft(interaction.user.id, interaction.guildId);
      return interaction.update({ content: "Setup cancelled. Nothing was posted.", embeds: [], components: [] });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("Set up a ticket panel step by step")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  customIdPrefix: PREFIX,
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "You need the Manage Server permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const store = getStore();
    const saved = store.getDraft(interaction.user.id, interaction.guildId);
    const draft = saved ?? emptyDraft(interaction.channelId);
    if (!saved) store.saveDraft(interaction.user.id, interaction.guildId, draft);
    const note = saved ? "Picking up where you left off. Press Cancel to start over." : null;
    return interaction.reply({ ...mainView(draft, { note }), flags: MessageFlags.Ephemeral });
  },
  async handleComponent(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "You need the Manage Server permission to do this.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const draft = getStore().getDraft(interaction.user.id, interaction.guildId);
    if (!draft) return interaction.update(ENDED);

    const [, action, arg] = interaction.customId.split(":");
    const index = arg === undefined || arg === "new" ? null : Number(arg);
    if (index != null && !draft.types[index]) {
      return interaction.update(mainView(draft, { note: "That ticket type is gone." }));
    }
    return handleAction(interaction, draft, action, index);
  },
};
