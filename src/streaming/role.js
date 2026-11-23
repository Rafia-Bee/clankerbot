// Gives members the streaming role (picked in /settings) while they're live on Twitch, and takes it away when they stop.
//   createStreamingRole   the functions below, for a logged-in client
//   streamingRoleIn       the streaming role in a server, or null when it isn't set or was deleted
//   updateMember          adds or removes the role for one member, going by their status
//   handlePresence        reacts to a member's status changing
//   checkOnStartup        catches up on streams that started or ended while the bot was off

const { getStore } = require("../store");
const { isStreamingOnTwitch, streamingRoleChange } = require("./rules");

function createStreamingRole(client, store = getStore()) {
  function streamingRoleIn(guild) {
    const roleId = store.getServerSettings().STREAMING_ROLE_ID;
    return (roleId && guild.roles.cache.get(roleId)) || null;
  }

  async function updateMember(member, role, activities) {
    const change = streamingRoleChange({
      streaming: isStreamingOnTwitch(activities),
      hasRole: member.roles.cache.has(role.id),
    });
    if (change === "add") await member.roles.add(role, "Started streaming on Twitch");
    if (change === "remove") await member.roles.remove(role, "Stopped streaming on Twitch");
  }

  async function handlePresence(oldPresence, newPresence) {
    const { guild } = newPresence;
    const role = guild && streamingRoleIn(guild);
    if (!role) return;
    const member = newPresence.member ?? (await guild.members.fetch(newPresence.userId).catch(() => null));
    if (!member || member.user.bot) return;
    await updateMember(member, role, newPresence.activities);
  }

  async function checkOnStartup() {
    for (const guild of client.guilds.cache.values()) {
      const role = streamingRoleIn(guild);
      if (!role) continue;
      const members = await guild.members.fetch({ withPresences: true });
      for (const member of members.values()) {
        if (member.user.bot) continue;
        await updateMember(member, role, member.presence?.activities).catch((error) =>
          console.error(`Couldn't update the streaming role for ${member.user.tag}:`, error.message)
        );
      }
    }
  }

  return { handlePresence, checkOnStartup };
}

module.exports = { createStreamingRole };
