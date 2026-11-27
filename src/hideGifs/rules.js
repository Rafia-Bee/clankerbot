// Rules for /hidegifs, kept apart from Discord so they can be tested.
//   parseTime    reads a time like 30s, 5m, 1h 30m or 2d into milliseconds (a plain number is seconds)
//   formatTime   writes milliseconds out in words, like "1 hour 30 minutes"
//   isGifMessage whether a message has a GIF link (Tenor, Giphy, Klipy or a link ending in .gif) or a GIF preview
//   hideDelay    how long until a GIF's preview should be hidden, counted from when it was posted

const UNITS = [
  { names: ["d", "day", "days"], ms: 24 * 60 * 60 * 1000, word: "day" },
  { names: ["h", "hr", "hrs", "hour", "hours"], ms: 60 * 60 * 1000, word: "hour" },
  { names: ["m", "min", "mins", "minute", "minutes"], ms: 60 * 1000, word: "minute" },
  { names: ["s", "sec", "secs", "second", "seconds"], ms: 1000, word: "second" },
];

const TIME_ERROR = "I couldn't read that time. Use something like 30s, 5m, 1h 30m or 2d.";

const GIF_LINK =
  /https?:\/\/(?:[\w-]+\.)*(?:tenor\.com|giphy\.com|klipy\.com)\/\S+|https?:\/\/\S+?\.gifv?(?:[?#]\S*)?(?=\s|$)/i;

function parseTime(raw) {
  const text = (raw ?? "").trim().toLowerCase();
  if (/^\d+$/.test(text)) return { ms: Number(text) * 1000 };

  const parts = [...text.matchAll(/(\d+)\s*([a-z]+)\s*/g)];
  if (parts.length === 0 || parts.map((p) => p[0]).join("") !== text) return { error: TIME_ERROR };

  let ms = 0;
  const used = new Set();
  for (const [, amount, name] of parts) {
    const unit = UNITS.find((u) => u.names.includes(name));
    if (!unit || used.has(unit)) return { error: TIME_ERROR };
    used.add(unit);
    ms += Number(amount) * unit.ms;
  }
  return { ms };
}

function formatTime(ms) {
  const words = [];
  let left = Math.round(ms / 1000) * 1000;
  for (const unit of UNITS) {
    const count = Math.floor(left / unit.ms);
    left -= count * unit.ms;
    if (count > 0) words.push(`${count} ${unit.word}${count === 1 ? "" : "s"}`);
  }
  return words.length ? words.join(" ") : "0 seconds";
}

function isGifMessage(message) {
  if (GIF_LINK.test(message.content ?? "")) return true;
  return (message.embeds ?? []).some((embed) => (embed.data?.type ?? embed.type) === "gifv");
}

function hideDelay(postedAt, timerMs, now) {
  return Math.max(0, postedAt + timerMs - now);
}

module.exports = { parseTime, formatTime, isGifMessage, hideDelay };
