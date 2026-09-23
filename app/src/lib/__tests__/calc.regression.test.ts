import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { computeBase, computeScenario, calcNecessaryProtection } from "../calc";
import { PARAMS, richBaseScenario, linkedDeathScenario, linkedSpouseDeathScenario, minimalScenario, relocationScenario } from "./fixtures";

// Survivor pension depends on the calendar year of death; pin the clock.
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-01T00:00:00Z")); });
afterAll(() => { vi.useRealTimers(); });

/** Round floats so snapshots are stable across trivially different evaluation orders. */
function normalize(v: unknown): unknown {
  if (typeof v === "number") return Number.isInteger(v) ? v : Number(v.toFixed(4));
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === "scenario") continue; // input echo, not worth snapshotting
      out[k] = normalize(x);
    }
    return out;
  }
  return v;
}

describe("simulation engine regression", () => {
  const base = computeBase(PARAMS);
  const A = richBaseScenario();

  it("computeBase", () => {
    expect(base).toMatchSnapshot();
  });

  it("minimal scenario", () => {
    const r = computeScenario(minimalScenario(), base, PARAMS, null);
    expect(normalize(r)).toMatchSnapshot();
  });

  it("rich base scenario A", () => {
    const r = computeScenario(A, base, PARAMS, null);
    expect(r.yearResults).toHaveLength(60);
    expect(normalize(r)).toMatchSnapshot();
  });

  it("linked scenario B (self death, danshin, relocation)", () => {
    const r = computeScenario(linkedDeathScenario(), base, PARAMS, A);
    expect(normalize(r)).toMatchSnapshot();
  });

  it("linked scenario C (spouse death, annuity DC, property sale)", () => {
    const r = computeScenario(linkedSpouseDeathScenario(), base, PARAMS, A);
    expect(normalize(r)).toMatchSnapshot();
  });

  it("standalone scenario D (legacy rent, relocation purchase, spouse death with NISA)", () => {
    const r = computeScenario(relocationScenario(), base, PARAMS, null);
    expect(normalize(r)).toMatchSnapshot();
  });

  it("necessary protection", () => {
    const r = computeScenario(A, base, PARAMS, null);
    expect(normalize(calcNecessaryProtection(r.yearResults, A))).toMatchSnapshot();
  });
});
