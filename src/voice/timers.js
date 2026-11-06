// Countdowns for deleting empty voice channels, one per channel.
//   createDeleteTimers  returns schedule (start or restart a countdown), cancel and has, calling onExpire when one runs out

function createDeleteTimers(delayMs, onExpire) {
  const pending = new Map();

  function cancel(id) {
    clearTimeout(pending.get(id));
    pending.delete(id);
  }

  function schedule(id) {
    cancel(id);
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id);
        onExpire(id);
      }, delayMs)
    );
  }

  return { schedule, cancel, has: (id) => pending.has(id) };
}

module.exports = { createDeleteTimers };
