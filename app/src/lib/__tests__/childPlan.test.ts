import { describe, it, expect } from "vitest";
import type { LifeEvent } from "../types";
import { eventsToChildPlans, childPlansToEvents, replaceChildEvents, newChildPlan, TEMPLATES, matchTemplate, buildStages, householdChildCostByAge, DEFAULT_COMMON } from "../childPlan";

const common = { ...DEFAULT_COMMON, birthCostMan: 60, baseCareMan: 40, weddingSupport: { amountMan: 100, childAge: 30 }, leave: { ...DEFAULT_COMMON.leave, spouseReturnRatio: 80, spouseReturnYears: 3 } };

describe("childPlan ⇄ events", () => {
  it("round-trips plans through events, keeping parent ids and leave settings", () => {
    const a = { ...newChildPlan(0, 33, TEMPLATES[2]), id: 1001, leaveSelfMonths: 12, leaveSpouseMonths: 6 };
    const b = { ...newChildPlan(1, 35, TEMPLATES[3]), id: 1002 };
    const events = childPlansToEvents([a, b], common);

    const parents = events.filter(e => e.type === "child");
    expect(parents.map(p => p.id)).toEqual([1001, 1002]);
    expect(parents[0].parentalLeave).toEqual({ self: { months: 12, benefit: true, returnRatio: 100, returnYears: 0 }, spouse: { months: 6, benefit: true, returnRatio: 80, returnYears: 3 } });
    expect(parents[1].parentalLeave).toBeUndefined();
    expect(events.filter(e => e.type === "education" && e.parentId === 1001)).toHaveLength(6);
    expect(events.filter(e => e.type === "custom")).toHaveLength(2); // 結婚支援金 × 2人

    const back = eventsToChildPlans(events);
    expect(back.plans.map(p => [p.id, p.name, p.birthAge, p.leaveSelfMonths, p.leaveSpouseMonths])).toEqual([[1001, "第1子", 33, 12, 6], [1002, "第2子", 35, 0, 0]]);
    expect(matchTemplate(back.plans[0].stages)).toBe("mixed");
    expect(matchTemplate(back.plans[1].stages)).toBe("rural_pub");
    expect(back.common.birthCostMan).toBe(60);
    expect(back.common.baseCareMan).toBe(40);
    expect(back.common.weddingSupport).toEqual({ amountMan: 100, childAge: 30 });
    expect(back.common.leave.spouseReturnRatio).toBe(80);
    expect(back.common.leave.spouseReturnYears).toBe(3);
  });

  it("recognizes a custom stage set", () => {
    const stages = buildStages(TEMPLATES[0]);
    stages[2] = { ...stages[2], annualMan: 99 };
    expect(matchTemplate(stages)).toBe("custom");
  });

  it("replaceChildEvents keeps unrelated events and drops old child sub-events", () => {
    const car: LifeEvent = { id: 5, age: 40, type: "car", label: "車", oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0 };
    const old = childPlansToEvents([{ ...newChildPlan(0, 33), id: 1 }], DEFAULT_COMMON);
    const next = replaceChildEvents([car, ...old], [{ ...newChildPlan(0, 34), id: 1 }, { ...newChildPlan(1, 36), id: 2 }], DEFAULT_COMMON);
    expect(next.filter(e => e.type === "car")).toHaveLength(1);
    expect(next.filter(e => e.type === "child").map(e => e.age)).toEqual([34, 36]);
    expect(next.every((e, i) => i === 0 || next[i - 1].age <= e.age)).toBe(true);
  });

  it("sums household costs by parent age across children", () => {
    const rows = householdChildCostByAge([{ ...newChildPlan(0, 30), id: 1 }, { ...newChildPlan(1, 32), id: 2 }], { ...DEFAULT_COMMON, baseCareMan: 10, birthCostMan: 50 });
    const at = (age: number) => rows.find(r => r.age === age)!;
    expect(at(30)).toMatchObject({ care: 10, oneTime: 50 });
    expect(at(32)).toMatchObject({ care: 20, oneTime: 50 });   // 2人
    expect(at(32).edu).toBe(26 + 26);                          // 保育園 × 2（0〜3歳）
  });
});
