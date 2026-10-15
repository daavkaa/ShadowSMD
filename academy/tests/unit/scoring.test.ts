import { describe, expect, it } from "vitest";
import { examScorePct, scoreStep, xpForStep } from "@/features/learning/scoring";

describe("scoreStep", () => {
  it("scores single choice", () => {
    expect(scoreStep("single_choice", { correct: "a" }, { choice: "a" }).correct).toBe(true);
    expect(scoreStep("single_choice", { correct: "a" }, { choice: "b" }).correct).toBe(false);
  });
  it("multi choice requires the exact set, order independent, no duplicates", () => {
    const key = { correct: ["a", "c"] };
    expect(scoreStep("multi_choice", key, { choices: ["c", "a"] }).correct).toBe(true);
    expect(scoreStep("multi_choice", key, { choices: ["a"] }).correct).toBe(false);
    expect(scoreStep("multi_choice", key, { choices: ["a", "c", "d"] }).correct).toBe(false);
    expect(scoreStep("multi_choice", key, { choices: ["a", "a", "c"] }).correct).toBe(false);
  });
  it("ordering must match exactly", () => {
    const key = { order: ["a", "b", "c"] };
    expect(scoreStep("ordering", key, { order: ["a", "b", "c"] }).correct).toBe(true);
    expect(scoreStep("ordering", key, { order: ["b", "a", "c"] }).correct).toBe(false);
    expect(scoreStep("ordering", key, { order: ["a", "b"] }).correct).toBe(false);
  });
  it("reflection is unscored but validated", () => {
    expect(scoreStep("reflection", null, { text: "Миний зорилго бол ..." }).correct).toBeNull();
    expect(() => scoreStep("reflection", null, { text: "богино" })).toThrow();
  });
  it("rejects malformed answers instead of scoring them", () => {
    expect(() => scoreStep("single_choice", { correct: "a" }, { choice: 1 })).toThrow();
    expect(() => scoreStep("multi_choice", { correct: ["a"] }, { choices: [] })).toThrow();
    expect(() => scoreStep("single_choice", { correct: "a" }, "a")).toThrow();
  });
  it("client cannot smuggle a correct flag", () => {
    expect(scoreStep("single_choice", { correct: "a" }, { choice: "b", correct: true } as never).correct).toBe(false);
  });
});

describe("xp and exam score", () => {
  it("awards full XP first try, half on retry, none when wrong", () => {
    expect(xpForStep(10, 1, true)).toBe(10);
    expect(xpForStep(10, 2, true)).toBe(5);
    expect(xpForStep(10, 1, false)).toBe(0);
    expect(xpForStep(0, 1, true)).toBe(0);
  });
  it("never rounds a fail up to the pass mark", () => {
    expect(examScorePct(16, 20)).toBe(80);
    expect(examScorePct(15, 20)).toBe(75);
    expect(examScorePct(79, 99)).toBe(79); // 79.79 → 79
    expect(examScorePct(0, 0)).toBe(0);
  });
});
