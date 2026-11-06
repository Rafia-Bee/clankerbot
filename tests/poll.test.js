// Tests for the /poll rules: reading the answers and the duration, and building the poll.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAnswers, parseDuration, buildPoll } = require("../src/poll");

test("answers are split by semicolons and trimmed", () => {
  assert.deepEqual(parseAnswers(" Pizza ; Sushi;Tacos "), { answers: ["Pizza", "Sushi", "Tacos"] });
});

test("empty answers between semicolons are ignored", () => {
  assert.deepEqual(parseAnswers("Yes;;No; "), { answers: ["Yes", "No"] });
});

test("a poll needs 2 to 10 answers", () => {
  assert.deepEqual(parseAnswers("Only one"), {
    error: "A poll needs at least 2 answers. Separate them with ; like this: Yes; No; Maybe",
  });
  const eleven = Array.from({ length: 11 }, (_, i) => `Answer ${i + 1}`).join(";");
  assert.deepEqual(parseAnswers(eleven), { error: "A poll can have at most 10 answers. You gave 11." });
  const ten = Array.from({ length: 10 }, (_, i) => `Answer ${i + 1}`).join(";");
  assert.equal(parseAnswers(ten).answers.length, 10);
});

test("each answer is at most 55 characters", () => {
  const long = "a".repeat(56);
  assert.deepEqual(parseAnswers(`Short; ${long}`), {
    error: `Answers can be at most 55 characters. This one is 56: ${long}`,
  });
  assert.equal(parseAnswers(`Short; ${"a".repeat(55)}`).answers.length, 2);
});

test("the same answer twice is turned away", () => {
  assert.deepEqual(parseAnswers("Yes; No; yes"), { error: "The answer \"yes\" is in the list twice." });
});

test("durations in hours and days", () => {
  assert.deepEqual(parseDuration("12h"), { hours: 12 });
  assert.deepEqual(parseDuration("3d"), { hours: 72 });
  assert.deepEqual(parseDuration("1d 12h"), { hours: 36 });
  assert.deepEqual(parseDuration("1D12H"), { hours: 36 });
  assert.deepEqual(parseDuration("5"), { hours: 5 });
  assert.deepEqual(parseDuration(" 2d "), { hours: 48 });
});

test("no duration means 24 hours", () => {
  assert.deepEqual(parseDuration(null), { hours: 24 });
  assert.deepEqual(parseDuration(""), { hours: 24 });
});

test("durations must be between 1 hour and 32 days", () => {
  const error = "Polls can be open for 1 hour up to 32 days.";
  assert.deepEqual(parseDuration("0h"), { error });
  assert.deepEqual(parseDuration("33d"), { error });
  assert.deepEqual(parseDuration("32d"), { hours: 768 });
});

test("durations that can't be read explain the format", () => {
  const error = "I couldn't read that duration. Use hours and days, like 12h, 3d or 1d 12h.";
  assert.deepEqual(parseDuration("tomorrow"), { error });
  assert.deepEqual(parseDuration("30m"), { error });
  assert.deepEqual(parseDuration("1.5d"), { error });
  assert.deepEqual(parseDuration("h"), { error });
});

test("builds a Discord poll", () => {
  assert.deepEqual(buildPoll({ question: " Dinner? ", answers: ["Pizza", "Sushi"], hours: 48, multiple: true }), {
    question: { text: "Dinner?" },
    answers: [{ text: "Pizza" }, { text: "Sushi" }],
    duration: 48,
    allowMultiselect: true,
  });
});
