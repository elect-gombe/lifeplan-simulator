import { describe, it, expect } from "vitest";
import { defaultPlan, defaultMember, defaultChild, defaultHousingPhase } from "../model";
import { resolvePlan, resolveAll, overrideGroup, relinkGroup, materialize, copyGroup } from "../link";
import type { LinkGroup } from "../model";

function setup() {
  const base = defaultPlan({ id: "A", name: "A", self: defaultMember({ age: 40, income: [{ age: 40, value: 700 }] }), children: [defaultChild(0, 42)] });
  const linked = { ...structuredClone(base), id: "B", name: "B", link: { baseId: "A", overrides: [] as never[] } };
  return { base, linked };
}

describe("plan link", () => {
  it("上書きなしならベースの値がそのまま使われる（ベース変更に追従）", () => {
    const { base, linked } = setup();
    const base2 = { ...base, self: { ...base.self, income: [{ age: 40, value: 900 }] }, housing: [defaultHousingPhase(40, "own")] };
    const r = resolvePlan(linked, [base2, linked]);
    expect(r.id).toBe("B"); expect(r.name).toBe("B");
    expect(r.self.income[0].value).toBe(900);
    expect(r.housing[0].kind).toBe("own");
    expect(r.children.length).toBe(1);
  });
  it("overrideGroup で上書きしたグループだけ自分の値になる", () => {
    const { base, linked } = setup();
    let b = overrideGroup(linked, [base, linked], "housing");
    expect(b.link?.overrides).toEqual(["housing"]);
    b = { ...b, housing: [{ ...defaultHousingPhase(40, "rent"), rentMonthly: 30 }] };
    const base2 = { ...base, self: { ...base.self, income: [{ age: 40, value: 900 }] } };
    const r = resolvePlan(b, [base2, b]);
    expect(r.housing[0].rentMonthly).toBe(30);
    expect(r.self.income[0].value).toBe(900);
    const back = relinkGroup(b, "housing");
    expect(resolvePlan(back, [base2, back]).housing[0].rentMonthly).toBe(base.housing[0].rentMonthly);
  });
  it("events/risk は死亡イベントと他イベントを分けて扱う", () => {
    const { base, linked } = setup();
    const baseE = { ...base, events: [{ id: "e1", kind: "expense" as const, label: "旅行", enabled: true, startAge: 41, years: 5, every: 1, amount: 30, inflate: true, taxable: false, stopOnSelfDeath: false }] };
    let b = overrideGroup(linked, [baseE, linked], "risk");
    b = { ...b, events: [...b.events, { id: "d", kind: "death" as const, member: "self" as const, age: 50, label: "", enabled: true }] };
    const r = resolvePlan(b, [baseE, b]);
    expect(r.events.some(e => e.kind === "death")).toBe(true);
    expect(r.events.some(e => e.kind === "expense")).toBe(true);
  });
  it("family を上書きすれば配偶者の有無も自分の値になる", () => {
    const { base, linked } = setup();
    const own = { ...structuredClone(linked), spouse: defaultMember({ name: "配偶者", age: 38 }), link: { baseId: "A", overrides: ["family" as const] } };
    const r = resolvePlan(own, [base, own]);
    expect(r.spouse?.name).toBe("配偶者");
    const to = structuredClone(base); copyGroup("income", own, to);
    expect(to.spouse).toBeNull();
  });
  it("materialize でリンクが外れ値が固定される", () => {
    const { base, linked } = setup();
    const m = materialize(linked, [base, linked]);
    expect(m.link).toBeNull();
    expect(m.self.income[0].value).toBe(700);
  });
  it("循環参照でも落ちない", () => {
    const a = { ...defaultPlan({ id: "A" }), link: { baseId: "B", overrides: [] } };
    const b = { ...defaultPlan({ id: "B" }), link: { baseId: "A", overrides: [] } };
    expect(() => resolvePlan(a, [a, b])).not.toThrow();
  });
});

describe("resolveAll のオブジェクト同一性", () => {
  it("無関係なプランの変更や名称変更では、他プランの解決結果が同じオブジェクトのまま", () => {
    const base = defaultPlan(); base.id = "base";
    const linked = { ...defaultPlan(), id: "b", link: { baseId: "base", overrides: [] as LinkGroup[] } };
    const indep = defaultPlan(); indep.id = "c";
    const r1 = resolveAll([base, linked, indep]);
    // 独立プランはそのまま
    expect(r1[0]).toBe(base); expect(r1[2]).toBe(indep);
    // 名称変更（リンク先ではない独立プラン）→ リンク済みプランの解決結果は同じ参照
    const r2 = resolveAll([base, linked, { ...indep, name: "x" }]);
    expect(r2[1]).toBe(r1[1]);
    // ベースを編集すると再解決される
    const base2 = { ...base, endAge: base.endAge + 1 };
    const r3 = resolveAll([base2, linked, indep]);
    expect(r3[1]).not.toBe(r1[1]); expect(r3[1].endAge).toBe(base2.endAge);
  });
});
