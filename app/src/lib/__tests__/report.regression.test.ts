import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { computeBase, computeScenario } from "../calc";
import { generateReport, generateAnalysisPrompt } from "../report";
import { PARAMS, richBaseScenario, linkedDeathScenario } from "./fixtures";

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-01T00:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });

describe("text report regression", () => {
  const base = computeBase(PARAMS);
  const A = richBaseScenario();
  const opts = { rr: PARAMS.rr, inflationRate: PARAMS.inflationRate, hasRet: PARAMS.hasRet, retAmt: PARAMS.retAmt };

  it("base scenario report", () => {
    const r = computeScenario(A, base, PARAMS, null);
    expect(generateReport(r, opts, true, null)).toMatchSnapshot();
  });

  it("linked scenario report", () => {
    const r = computeScenario(linkedDeathScenario(), base, PARAMS, A);
    expect(generateReport(r, opts, false, A)).toMatchSnapshot();
  });

  it("analysis prompt", () => {
    expect(generateAnalysisPrompt()).toMatchSnapshot();
  });
});
