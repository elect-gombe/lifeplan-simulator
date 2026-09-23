import { describe, it, expect } from "vitest";
import { defaultPlan, defaultMember, defaultChild, defaultHousingPhase, type Plan } from "@/domain/model";
import { simulate } from "../simulate";

// 決定的な擬似乱数
let seed = 20260922;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

function randomPlan(): Plan {
  const p = defaultPlan();
  const age = int(22, 62);
  p.self = defaultMember({
    age, employment: pick(["employee", "selfEmployed", "none"] as const),
    income: [{ age, value: pick([0, 80, 100, 105, 106, 130, 300, 700, 1500]) }],
    retireAge: int(age + 1, 75), incomeGrowthPct: pick([0, 1, 2]),
    socialInsurance: pick(["auto", "join", "dependent"] as const),
    deathBenefit: pick([0, 500]),
  });
  if (rnd() < 0.7) {
    const sAge = int(22, 62);
    p.spouse = defaultMember({
      age: sAge, employment: pick(["employee", "selfEmployed", "none"] as const),
      income: [{ age: sAge, value: pick([0, 90, 100, 106, 129, 131, 400]) }],
      retireAge: int(sAge + 1, 70), incomeGrowthPct: pick([0, 1.5]),
      socialInsurance: pick(["auto", "join", "dependent"] as const),
    });
  }
  p.children = Array.from({ length: int(0, 3) }, () => defaultChild(0, int(age - 5, age + 12)));
  p.childrenCommon.independenceAge = int(18, 26);
  if (rnd() < 0.5) p.housing.push(defaultHousingPhase(int(age + 1, age + 20), "own"));
  p.endAge = int(Math.max(p.self.retireAge, age) + 5, 100);
  return p;
}

describe("ファズ: 加入判定の変更後も破綻しないか", () => {
  it("400 件のランダムプランで NaN・負の保険料・恒等式の破れがない", () => {
    for (let n = 0; n < 400; n++) {
      const p = randomPlan();
      let rows;
      try { rows = simulate(p).rows; } catch (e) { throw new Error(`#${n} simulate が例外: ${e}`); }
      for (const r of rows) {
        expect(Number.isFinite(r.balances.netWorth), `#${n} age${r.age} netWorth`).toBe(true);
        expect(Number.isFinite(r.totalIn) && Number.isFinite(r.totalOut), `#${n} age${r.age} 合計`).toBe(true);
        expect(r.totalIn).toBeCloseTo(r.inflows.reduce((a, f) => a + f.amount, 0), 0);
        expect(r.totalOut).toBeCloseTo(r.outflows.reduce((a, f) => a + f.amount, 0), 0);
        for (const m of [r.self, r.spouse]) {
          if (!m?.tax) continue;
          const si = m.tax.socialInsurance;
          expect(si.total >= 0 && Number.isFinite(si.total), `#${n} age${r.age} 社保 ${si.total}`).toBe(true);
          expect(si.pension >= 0, `#${n} age${r.age} 年金保険料`).toBe(true);
          expect(m.publicPension >= 0 && Number.isFinite(m.publicPension), `#${n} age${r.age} 公的年金`).toBe(true);
          expect(m.pensionEmployee >= 0, `#${n} age${r.age} 厚生年金`).toBe(true);
          expect(m.tax.takeHome).toBeLessThanOrEqual(m.tax.gross + 1);
        }
      }
    }
  });
});
