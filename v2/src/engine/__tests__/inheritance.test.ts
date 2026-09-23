import { describe, it, expect } from "vitest";
import { inheritanceTax } from "../inheritance";

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
