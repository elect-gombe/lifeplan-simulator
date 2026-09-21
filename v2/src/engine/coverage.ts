/**
 * 必要保障額の分析: 各年齢で世帯主（または配偶者）が死亡した場合に、
 * 遺族の流動資産が最も減る時点の不足額を「必要保障額」とする。
 * 既存の保険・遺族年金・団信は simulate() 内で反映されるため、この不足額は「追加で必要な保障」。
 */
import type { Plan } from "@/domain/model";
import { simulate } from "./simulate";

export interface CoveragePoint {
  deathAge: number;
  shortfall: number;       // 円。0 なら追加保障不要
  minLiquidAge: number;
  survivorYears: number;
}

export function coverageCurve(plan: Plan, who: "self" | "spouse", step = 1): CoveragePoint[] {
  const out: CoveragePoint[] = [];
  const target = who === "self" ? plan.self : plan.spouse;
  if (!target) return out;
  if (who === "self" && !plan.spouse) return out; // 遺族（配偶者）がいない
  const baseEvents = plan.events.filter(e => !(e.kind === "death" && e.member === who));
  const insured = plan.events.filter(e => e.kind === "insurance" && e.member === who);
  const lastAge = Math.min(plan.endAge - 1, who === "self" ? plan.self.retireAge + 5 : plan.self.age + (plan.spouse!.retireAge - plan.spouse!.age) + 5);
  for (let d = plan.self.age + 1; d <= lastAge; d += step) {
    const events = [...baseEvents, { id: "__death", kind: "death" as const, label: "", enabled: true, member: who, age: d }];
    const res = simulate(plan, { events });
    let minLiquid = Infinity, minAge = d;
    for (const r of res.rows) {
      if (r.age < d) continue;
      if (r.balances.liquid < minLiquid) { minLiquid = r.balances.liquid; minAge = r.age; }
    }
    out.push({ deathAge: d, shortfall: Math.max(0, -minLiquid), minLiquidAge: minAge, survivorYears: res.rows.length ? res.rows[res.rows.length - 1].age - d : 0 });
  }
  void insured;
  return out;
}
