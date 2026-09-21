import { describe, it, expect } from "vitest";
import { parseNumericText, normalizeNumericText, stepValue, clampNumber, stepDecimals, formatNumericDisplay } from "../numInput";

describe("numInput helpers", () => {
  it("normalizes full-width text and separators", () => {
    expect(normalizeNumericText("１，２３４．５")).toBe("1234.5");
    expect(normalizeNumericText("－１０")).toBe("-10");
    expect(normalizeNumericText(" 1 000 ")).toBe("1000");
  });

  it("parses complete numbers and rejects partial input", () => {
    expect(parseNumericText("700")).toBe(700);
    expect(parseNumericText("1,500")).toBe(1500);
    expect(parseNumericText("0.5")).toBe(0.5);
    expect(parseNumericText("-2")).toBe(-2);
    expect(parseNumericText("")).toBeNull();
    expect(parseNumericText("-")).toBeNull();
    expect(parseNumericText(".")).toBeNull();
    expect(parseNumericText("abc")).toBeNull();
    expect(parseNumericText("1.")).toBe(1);
  });

  it("clamps and steps with proper precision", () => {
    expect(clampNumber(5, 10, 20)).toBe(10);
    expect(clampNumber(25, 10, 20)).toBe(20);
    expect(clampNumber(15, undefined, undefined)).toBe(15);
    expect(stepDecimals(0.25)).toBe(2);
    expect(stepDecimals(1000)).toBe(0);
    expect(stepValue(0.1, 1, 0.1)).toBe(0.2);
    expect(stepValue(0.7, 1, 0.1)).toBe(0.8);
    expect(stepValue(700, 1, 10, 10)).toBe(800);
    expect(stepValue(18, -1, 1, 1, 18)).toBe(18);
    expect(stepValue(99, 1, 5, 1, undefined, 100)).toBe(100);
  });

  it("formats display values", () => {
    expect(formatNumericDisplay(55000)).toBe("55,000");
    expect(formatNumericDisplay(1.5)).toBe("1.5");
    expect(formatNumericDisplay(NaN)).toBe("");
  });
});
