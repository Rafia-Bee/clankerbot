// Rules for /poll, kept apart from Discord so they can be tested.
//   parseAnswers   splits the answers on ";" and checks there are 2 to 10, short enough and not repeated
//   parseDuration  reads a duration like 12h, 3d or 1d 12h into hours (24 when empty)
//   buildPoll      turns the checked parts into a Discord poll

const MIN_ANSWERS = 2;
const MAX_ANSWERS = 10;
const MAX_ANSWER_LENGTH = 55;
const DEFAULT_HOURS = 24;
const MAX_HOURS = 32 * 24;

function parseAnswers(raw) {
  const answers = raw
    .split(";")
    .map((answer) => answer.trim())
    .filter(Boolean);
  if (answers.length < MIN_ANSWERS) {
    return { error: "A poll needs at least 2 answers. Separate them with ; like this: Yes; No; Maybe" };
  }
  if (answers.length > MAX_ANSWERS) {
    return { error: `A poll can have at most ${MAX_ANSWERS} answers. You gave ${answers.length}.` };
  }
  const tooLong = answers.find((answer) => answer.length > MAX_ANSWER_LENGTH);
  if (tooLong) {
    return {
      error: `Answers can be at most ${MAX_ANSWER_LENGTH} characters. This one is ${tooLong.length}: ${tooLong}`,
    };
  }
  const seen = new Set();
  for (const answer of answers) {
    const key = answer.toLowerCase();
    if (seen.has(key)) return { error: `The answer "${answer}" is in the list twice.` };
    seen.add(key);
  }
  return { answers };
}

function parseDuration(raw) {
  const text = (raw ?? "").trim();
  if (!text) return { hours: DEFAULT_HOURS };

  let hours;
  const daysAndHours = /^(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?$/i.exec(text);
  if (/^\d+$/.test(text)) {
    hours = Number(text);
  } else if (daysAndHours && (daysAndHours[1] || daysAndHours[2])) {
    hours = Number(daysAndHours[1] ?? 0) * 24 + Number(daysAndHours[2] ?? 0);
  } else {
    return { error: "I couldn't read that duration. Use hours and days, like 12h, 3d or 1d 12h." };
  }

  if (hours < 1 || hours > MAX_HOURS) return { error: "Polls can be open for 1 hour up to 32 days." };
  return { hours };
}

function buildPoll({ question, answers, hours, multiple }) {
  return {
    question: { text: question.trim() },
    answers: answers.map((text) => ({ text })),
    duration: hours,
    allowMultiselect: multiple,
  };
}

module.exports = { parseAnswers, parseDuration, buildPoll };
