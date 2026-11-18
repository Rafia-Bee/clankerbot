// The replies for /badword and /badword-count, kept apart from Discord so they can be tested.
//   badWordAddedReply  the reply after adding 1 to a member's count
//   badWordCountReply  the reply showing a member's count

function badWordAddedReply(userId, count) {
  return `Added 1 to <@${userId}>. Their count is now ${count}.`;
}

function badWordCountReply(userId, count) {
  return `<@${userId}>'s count is ${count}.`;
}

module.exports = { badWordAddedReply, badWordCountReply };
