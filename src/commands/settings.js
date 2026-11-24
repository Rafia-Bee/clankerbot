// /settings: lets server admins pick the verification and streaming roles from Discord's own role picker, and make and change the /count counters.
// The roles can also be typed as options (/settings guild-role:@Guild); with no options it opens the menu.
//   guildChecks      what findProblems needs to know about the server (does a role exist, can the bot give it)
//   mainView         the overview: every setting, what's missing, problems, and a list to pick one to change
//   roleView         one role's screen: a role picker and Back
//   roleMapView      the class role list's screen: Add, Remove one, Back
//   addEntryModal    the pop-up for adding a class with its role
//   save             saves a setting, refreshes the verification settings and logs the change
//   buildCommand     the /settings command with an option for each role setting, plus class and class-role
//   saveTypedOptions saves the typed options and says what was saved, with any problems with those roles
//   handleComponent  handles every button, list and pop-up on these screens, and passes counter ones to counters/settingsScreens.js

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  SETTINGS,
  settingByKey,
  isEmpty,
  missingRequired,
  findProblems,
  describeValue,
  addRoleMapEntry,
  removeRoleMapEntry,
  changesFromOptions,
  CLASSES,
} = require("../settings/ids");
const { countersView, handleCounterComponent } = require("../counters/settingsScreens");
const { getStore } = require("../store");
const { clearVerifyConfig } = require("../verify/config");

const PREFIX = "settings";
const id = (...parts) => [PREFIX, ...parts].join(":");
const NOT_ADMIN = "Only server admins can change settings.";

function guildChecks(guild) {
  const botTop = guild.members.me?.roles.highest.position ?? 0;
  return {
    hasRole: (roleId) => guild.roles.cache.has(roleId),
    canGiveRole: (roleId) => (guild.roles.cache.get(roleId)?.position ?? Infinity) < botTop,
  };
}

function backButton() {
  return new ButtonBuilder().setCustomId(id("back")).setLabel("Back").setStyle(ButtonStyle.Secondary);
}

function mainView(guild, note = "") {
  const values = { ...getStore().getServerSettings(), COUNTERS: getStore().listCounters(guild.id).map((c) => c.name) };
  const missing = missingRequired(values);
  const problems = findProblems(values, guildChecks(guild));
  const lines = [
    note,
    "Pick a setting from the list below to change it.",
    missing.length ? `**Missing:** ${missing.map((s) => s.label).join(", ")}. Verification is off until they're set.` : "",
    problems.length ? `**Problems:**\n${problems.map((p) => `- ${p}`).join("\n")}` : "",
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(missing.length || problems.length ? 0xf1c40f : 0x8e5cf7)
    .setTitle("Server settings")
    .setDescription(lines.join("\n\n"))
    .addFields(
      SETTINGS.map((setting) => ({
        name: setting.required ? setting.label : `${setting.label} (optional)`,
        value: describeValue(setting, values[setting.key]).slice(0, 1024),
        inline: setting.kind === "role",
      }))
    );

  const picker = new StringSelectMenuBuilder()
    .setCustomId(id("pick"))
    .setPlaceholder("Change a setting")
    .addOptions(
      SETTINGS.map((setting) => ({ label: setting.label, value: setting.key, description: setting.help.slice(0, 100) }))
    );

  return { content: "", embeds: [embed], components: [new ActionRowBuilder().addComponents(picker)] };
}

function roleView(setting) {
  const value = getStore().getServerSettings()[setting.key];
  const embed = new EmbedBuilder()
    .setColor(0x8e5cf7)
    .setTitle(setting.label)
    .setDescription(`${setting.help}\n\n**Now:** ${describeValue(setting, value)}`);
  const picker = new RoleSelectMenuBuilder().setCustomId(id("set", setting.key)).setPlaceholder("Pick a role");
  if (value) picker.setDefaultRoles(value);
  return {
    content: "",
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(picker), new ActionRowBuilder().addComponents(backButton())],
  };
}

function roleMapView(setting) {
  const list = getStore().getServerSettings()[setting.key] ?? [];
  const embed = new EmbedBuilder()
    .setColor(0x8e5cf7)
    .setTitle(setting.label)
    .setDescription(`${setting.help}\n\n${describeValue(setting, list)}`.slice(0, 4096));

  const rows = [];
  if (list.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(id("remove", setting.key))
          .setPlaceholder(`Remove a ${setting.entryName.toLowerCase()}`)
          .addOptions(list.slice(0, 25).map((entry) => ({ label: entry.name, value: entry.name })))
      )
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(id("add", setting.key))
        .setLabel(`Add or change a ${setting.entryName.toLowerCase()}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(list.length >= 25),
      backButton()
    )
  );
  return { content: "", embeds: [embed], components: rows };
}

function addEntryModal(setting) {
  const name = new TextInputBuilder().setCustomId("name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50);
  const role = new RoleSelectMenuBuilder().setCustomId("role").setRequired(true);
  return new ModalBuilder()
    .setCustomId(id("addsave", setting.key))
    .setTitle(`Add a ${setting.entryName.toLowerCase()}`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(`${setting.entryName} name`)
        .setDescription("As the game spells it. Capitals don't matter. An existing name gets the new role.")
        .setTextInputComponent(name),
      new LabelBuilder().setLabel("Role").setRoleSelectMenuComponent(role)
    );
}

function save(interaction, setting, value) {
  const before = getStore().getServerSettings()[setting.key];
  getStore().setServerSetting(setting.key, isEmpty(value) ? null : value, interaction.user.id);
  clearVerifyConfig();
  const show = (v) => (isEmpty(v) ? "not set" : JSON.stringify(v));
  console.log(`Setting ${setting.key} changed by ${interaction.user.tag}: ${show(before)} -> ${show(value)}`);
}

function viewFor(setting, guild) {
  if (setting.kind === "counters") return countersView(guild.id);
  return setting.kind === "roleMap" ? roleMapView(setting) : roleView(setting);
}

async function handleComponent(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: NOT_ADMIN, flags: MessageFlags.Ephemeral });
  }
  const [, action, key, counterId] = interaction.customId.split(":");
  if (action === "counter") return handleCounterComponent(interaction, key, counterId);
  const setting = key ? settingByKey(key) : null;
  if (key && !setting) return interaction.update(mainView(interaction.guild));

  if (action === "back") return interaction.update(mainView(interaction.guild));
  if (action === "pick") return interaction.update(viewFor(settingByKey(interaction.values[0]), interaction.guild));
  if (action === "add") return interaction.showModal(addEntryModal(setting));

  if (action === "set") {
    save(interaction, setting, interaction.values[0]);
    return interaction.update(mainView(interaction.guild, `Saved **${setting.label}**.`));
  }
  if (action === "remove") {
    const list = getStore().getServerSettings()[setting.key] ?? [];
    save(interaction, setting, removeRoleMapEntry(list, interaction.values[0]));
    return interaction.update(roleMapView(setting));
  }
  if (action === "addsave") {
    const roleId = interaction.fields.getSelectedRoles("role")?.first()?.id;
    const list = getStore().getServerSettings()[setting.key] ?? [];
    let updated;
    try {
      updated = addRoleMapEntry(list, interaction.fields.getTextInputValue("name"), roleId);
    } catch (error) {
      return interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
    }
    save(interaction, setting, updated);
    return interaction.update(roleMapView(setting));
  }
}

const ROLE_SETTINGS = SETTINGS.filter((setting) => setting.kind === "role");

function buildCommand() {
  const command = new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Pick the verification and streaming roles, and the counters. Fill in options to set roles directly")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
  for (const setting of ROLE_SETTINGS) {
    command.addRoleOption((option) => option.setName(setting.option).setDescription(setting.help.slice(0, 100)));
  }
  return command
    .addStringOption((option) =>
      option
        .setName("class")
        .setDescription("A class to give a role to. Fill in class-role too")
        .addChoices(CLASSES.map((name) => ({ name, value: name })))
    )
    .addRoleOption((option) => option.setName("class-role").setDescription("The role for the class picked in class"));
}

function saveTypedOptions(interaction) {
  const typed = Object.fromEntries(
    ROLE_SETTINGS.map((setting) => [setting.key, interaction.options.getRole(setting.option)?.id])
  );
  const className = interaction.options.getString("class");
  const classRoleId = interaction.options.getRole("class-role")?.id;
  const values = getStore().getServerSettings();
  let changes;
  try {
    changes = changesFromOptions(values, { ...typed, className, classRoleId });
  } catch (error) {
    return interaction.reply({ content: error.message, flags: MessageFlags.Ephemeral });
  }
  for (const { setting, value } of changes) save(interaction, setting, value);

  const saved = changes.map(({ setting, value }) =>
    setting.kind === "roleMap" ? `- Class role for ${className}: <@&${classRoleId}>` : `- ${setting.label}: <@&${value}>`
  );
  const labels = changes.map(({ setting }) => setting.label);
  const problems = findProblems(getStore().getServerSettings(), guildChecks(interaction.guild)).filter((problem) =>
    labels.some((label) => problem.startsWith(`${label}:`))
  );
  const lines = ["**Saved:**", ...saved];
  if (problems.length) lines.push("", "**Problems:**", ...problems.map((p) => `- ${p}`));
  return interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
}

module.exports = {
  data: buildCommand(),
  customIdPrefix: PREFIX,
  handleComponent,
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: NOT_ADMIN, flags: MessageFlags.Ephemeral });
    }
    if (interaction.options.data.length) return saveTypedOptions(interaction);
    return interaction.reply({ ...mainView(interaction.guild), flags: MessageFlags.Ephemeral });
  },
};
