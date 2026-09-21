import { describe, it, expect } from "vitest";
import { computeBase, computeScenario } from "../calc";
import type { LifeEvent } from "../types";
import { nextEventId } from "../ids";
import { childPlansToEvents, newChildPlan, DEFAULT_COMMON } from "../childPlan";
import { PARAMS, minimalScenario } from "./fixtures";

describe("one-time cost of sub-events", () => {
  it("is charged exactly once (結婚支援金 was double-counted)", () => {
    const base = computeBase(PARAMS);
    const s = minimalScenario();
    const child: LifeEvent = { id: 700, age: 33, type: "child", label: "第1子", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 22 };
    const wedding: LifeEvent = { id: 701, age: 63, type: "custom", label: "第1子 結婚支援金", oneTimeCostMan: 100, annualCostMan: 0, durationYears: 1, parentId: 700, ageOffset: 30 };
    const r = computeScenario({ ...s, inflationRate: 0, events: [...s.events, child, wedding] }, base, PARAMS, null);
    const y = r.yearResults.find(x => x.age === 63)!;
    const lines = y.eventCostBreakdown.filter(b => b.label.includes("結婚支援金"));
    expect(lines).toHaveLength(1);
    expect(y.eventOnetime).toBe(1_000_000);
  });

  it("still charges top-level simple events once", () => {
    const base = computeBase(PARAMS);
    const s = minimalScenario();
    const travel: LifeEvent = { id: 710, age: 40, type: "travel", label: "旅行", oneTimeCostMan: 50, annualCostMan: 30, durationYears: 0 };
    const r = computeScenario({ ...s, inflationRate: 0, events: [...s.events, travel] }, base, PARAMS, null);
    const y = r.yearResults.find(x => x.age === 40)!;
    expect(y.eventOnetime).toBe(500_000);
    expect(y.eventCostBreakdown.filter(b => b.label.startsWith("旅行")).length).toBe(2); // ongoing + 一時
  });
});

describe("event ids", () => {
  it("are unique and increasing even when generated in a burst", () => {
    const ids = Array.from({ length: 500 }, () => nextEventId());
    expect(new Set(ids).size).toBe(500);
    expect(ids.every((v, i) => i === 0 || v > ids[i - 1])).toBe(true);
  });
  it("gives every generated child event a distinct id", () => {
    const plans = [0, 1, 2].map(i => newChildPlan(i, 33 + i * 2));
    const evts = childPlansToEvents(plans, { ...DEFAULT_COMMON, weddingSupport: { amountMan: 100, childAge: 30 } });
    expect(new Set(evts.map(e => e.id)).size).toBe(evts.length);
  });
});
