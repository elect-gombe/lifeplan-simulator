import { describe, it, expect } from "vitest";
import { defaultPlan, defaultChild, defaultHousingPhase, defaultProperty } from "@/domain/model";
import { draftFromPlan, buildPlan } from "@/features/onboarding/Onboarding";

describe("入力ウィザード（再編集）", () => {
  it("既存プランから初期値を拾い、そのまま適用すると主要項目が保たれる", () => {
    const p = defaultPlan();
    p.self.name = "たろう"; p.self.age = 40; p.self.income = [{ age: 40, value: 800 }];
    p.children = [defaultChild(0, 36)];
    p.housing = [{ ...defaultHousingPhase(40, "rent"), rentMonthly: 15 }, { ...defaultHousingPhase(45, "own"), property: defaultProperty({ price: 6000, downPayment: 1000 }) }];
    const d = draftFromPlan(p);
    expect(d).toMatchObject({ age: 40, income: 800, housing: "planToBuy", rent: 15, price: 6000, downPayment: 1000, buyAge: 45 });
    expect(d.children[0]).toMatchObject({ birthAge: 36, id: p.children[0].id });
    const built = buildPlan(p, d);
    expect(built.self.name).toBe("たろう");
    expect(built.children).toEqual(p.children); // 子どもはそのまま（進路・育休はまとめて編集モーダルで変える）
    expect(built.assets).toBe(p.assets);           // 貯蓄合計が同じなら内訳を維持
    expect(built.events).toBe(p.events);           // ウィザード外の項目はそのまま
  });
  it("貯蓄合計を変えると現金に寄せる", () => {
    const p = defaultPlan();
    const built = buildPlan(p, { ...draftFromPlan(p), cash: 1234 });
    expect(built.assets.cash).toBe(1234);
  });
});
