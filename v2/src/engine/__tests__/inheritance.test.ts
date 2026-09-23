import { describe, it, expect } from "vitest";
import { inheritanceTax, homeInheritanceValue } from "../inheritance";
import { defaultPlan, defaultMember, defaultChild, defaultHousingPhase, defaultProperty } from "@/domain/model";
import { simulate } from "../simulate";

const MAN = 10_000;
const man = (v: number) => v * MAN;

describe("相続税", () => {
  it("配偶者＋子2人・遺産1億: 基礎控除4,800万、配偶者の税額軽減で納付は総額の半分", () => {
    const d = inheritanceTax(man(10_000), 0, 0, 2, true);
    expect(d.heirs).toBe(3);
    expect(d.basicDeduction).toBe(man(4_800));
    expect(d.taxableEstate).toBe(man(5_200));
    expect(d.spouseTax).toBe(man(340));   // 2,600万 × 15% − 50万
    expect(d.childTax).toBe(man(145));    // 1,300万 × 15% − 50万
    expect(d.totalTax).toBe(man(630));
    expect(d.spouseCredit).toBe(man(315));
    expect(d.tax).toBe(man(315));
  });

  it("葬儀費用は債務控除として課税価格から引く", () => {
    const none = inheritanceTax(man(10_000), 0, 0, 2, true, 0);
    const paid = inheritanceTax(man(10_000), 0, 0, 2, true, man(500));
    expect(paid.debts).toBe(man(500));
    expect(paid.total).toBe(none.total - man(500));
    expect(paid.tax).toBe(man(277.5));
    expect(none.tax - paid.tax).toBe(man(37.5));
  });

  it("死亡保険金・死亡退職金はそれぞれ 500万×法定相続人 まで非課税", () => {
    const d = inheritanceTax(man(4_000), man(2_000), man(1_000), 2, true);
    expect(d.insuranceExempt).toBe(man(1_500));  // 500万 × 3人
    expect(d.retirementExempt).toBe(man(1_000)); // 受取額が上限
    expect(d.total).toBe(man(4_500));            // 4,000 + (2,000 − 1,500) + 0
    expect(d.taxableEstate).toBe(0);             // 基礎控除 4,800万 以下
    expect(d.tax).toBe(0);
  });

  it("配偶者がいないと税額軽減がなく、基礎控除も小さい", () => {
    const d = inheritanceTax(man(10_000), 0, 0, 1, false);
    expect(d.heirs).toBe(1);
    expect(d.basicDeduction).toBe(man(3_600));
    expect(d.spouseCredit).toBe(0);
    expect(d.tax).toBe(man(1_220));  // 6,400万 × 30% − 700万
    expect(d.tax).toBeGreaterThan(inheritanceTax(man(10_000), 0, 0, 1, true).tax);
  });

  it("子がいなければ法定相続人は配偶者 1 人（直系尊属・兄弟姉妹は数えない簡略化）", () => {
    const d = inheritanceTax(man(3_000), 0, 0, 0, true);
    expect(d.heirs).toBe(1);
    expect(d.basicDeduction).toBe(man(3_600));
    expect(d.total).toBe(man(3_000));
    expect(d.taxableEstate).toBe(0);
    expect(d.totalTax).toBe(0);
    expect(d.tax).toBe(0);
  });
});

describe("団信と相続財産", () => {
  const build = (danshin: boolean) => {
    const p = defaultPlan();
    p.self.age = 45; p.self.income = [{ age: 45, value: 800 }];
    p.spouse = defaultMember({ name: "配偶者", age: 43 }); p.spouse.income = [{ age: 43, value: 400 }];
    p.children = [defaultChild(0, 30), defaultChild(1, 33)];
    p.assets = { ...p.assets, cash: 2000 };
    const own = defaultHousingPhase(46, "own");
    own.property = { ...defaultProperty(), price: 6000, downPayment: 500, loanYears: 35, rate: { kind: "fixed", pct: 1.5 }, danshin };
    p.housing = [p.housing[0], own];
    p.events = [{ id: "d", kind: "death", member: "self", label: "死亡", enabled: true, age: 55 }];
    return simulate(p);
  };
  const detailAt = (danshin: boolean) => {
    const row = build(danshin).rows.find(r => r.age === 55)!;
    expect(row.inheritance).toHaveLength(1);
    expect(Number.isFinite(row.inheritance[0].estate)).toBe(true);
    return row.inheritance[0];
  };

  it("団信ありなら、免除されたローンは債務控除にならず、保険金としても課税しない", () => {
    const on = detailAt(true);
    expect(on.danshinForgiven).toBeGreaterThan(0);
    expect(on.debtLoan).toBe(0);          // 消えた債務は引けない
    expect(on.deemedInsurance).toBe(0);   // 弁済額をみなし相続財産に足していない
  });

  it("団信なしなら残ローンが債務控除に入り、課税価格はその分小さい", () => {
    const on = detailAt(true), off = detailAt(false);
    expect(off.danshinForgiven).toBe(0);
    expect(off.debtLoan).toBeGreaterThan(1800 * 10_000);   // 残高 × 按分 1/2
    expect(off.debtLoan).toBeLessThan(2600 * 10_000);
    expect(on.estate).toBe(off.estate);                     // 住宅の評価そのものは同じ
    expect(on.total - off.total).toBeCloseTo(off.debtLoan, 0);
  });

});

describe("住宅の相続税評価額", () => {
  const ec = { landValuationPct: 80, buildingValuationPct: 60 };
  const market = man(6_000);

  it("土地は路線価水準・建物は固定資産税評価額水準に引き直す", () => {
    const v = homeInheritanceValue(market, { landRatioPct: 60, landAreaSqm: 100, smallLotRelief: false }, ec);
    expect(v.land).toBe(man(2_880));      // 6,000 × 60% × 80%
    expect(v.building).toBe(man(1_440));  // 6,000 × 40% × 60%
    expect(v.relief).toBe(0);
    expect(v.value).toBe(man(4_320));     // 時価の 72%
  });

  it("小規模宅地等の特例は土地だけを 80% 減額する", () => {
    const v = homeInheritanceValue(market, { landRatioPct: 60, landAreaSqm: 100, smallLotRelief: true }, ec);
    expect(v.relief).toBe(man(2_304));    // 2,880 × 80%
    expect(v.value).toBe(man(2_016));     // 時価の 33.6%
  });

  it("330㎡ を超える分は減額されない", () => {
    const v = homeInheritanceValue(market, { landRatioPct: 60, landAreaSqm: 660, smallLotRelief: true }, ec);
    expect(v.relief).toBe(man(1_152));    // 2,880 × (330/660) × 80%
    expect(v.value).toBe(man(3_168));
    const small = homeInheritanceValue(market, { landRatioPct: 60, landAreaSqm: 330, smallLotRelief: true }, ec);
    expect(small.relief).toBe(man(2_304)); // ちょうど 330㎡ なら全部が対象
  });

  it("土地の割合が 0 なら建物だけ、100 なら土地だけで評価する", () => {
    const allBuilding = homeInheritanceValue(market, { landRatioPct: 0, landAreaSqm: 100, smallLotRelief: true }, ec);
    expect(allBuilding.land).toBe(0);
    expect(allBuilding.relief).toBe(0);
    expect(allBuilding.value).toBe(man(3_600));
    const allLand = homeInheritanceValue(market, { landRatioPct: 100, landAreaSqm: 100, smallLotRelief: true }, ec);
    expect(allLand.building).toBe(0);
    expect(allLand.value).toBe(man(960));  // 4,800 − 3,840
  });
});
