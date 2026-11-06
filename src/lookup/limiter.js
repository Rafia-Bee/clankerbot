// Spaces out requests to a lookup site so the bot stays under its rate limit.
//   createLimiter  makes a queue that runs one request at a time with a gap between them, and can be paused

function createLimiter(getGapMs) {
  let queue = Promise.resolve();
  let nextRequestAt = 0;
  let pausedUntil = 0;

  return {
    isPaused: () => Date.now() < pausedUntil,
    pause(ms) {
      pausedUntil = Math.max(pausedUntil, Date.now() + ms);
    },
    reset() {
      nextRequestAt = 0;
      pausedUntil = 0;
    },
    run(fn) {
      const run = queue.then(async () => {
        const wait = nextRequestAt - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          return await fn();
        } finally {
          nextRequestAt = Date.now() + getGapMs();
        }
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

module.exports = { createLimiter };
