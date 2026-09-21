/** 本人/配偶者の年齢を変えたとき、その人の年齢で指定されている項目を同じ年数だけずらす。 */
import type { Plan, Member, Schedule } from "./model";

const shiftSched = (s: Schedule, d: number): Schedule => s.map(p => ({ ...p, age: p.age + d }));

function shiftMemberOwn(m: Member, d: number) {
  m.age += d;
  m.income = shiftSched(m.income, d);
  m.dc.company = shiftSched(m.dc.company, d);
  m.dc.matching = shiftSched(m.dc.matching, d);
  m.dc.ideco = shiftSched(m.dc.ideco, d);
}

/** 本人年齢を newAge に。本人年齢基準のすべての項目をシフトする（配偶者の年齢は変えない）。 */
export function shiftSelfAge(d: Plan, newAge: number): void {
  const diff = newAge - d.self.age;
  if (!diff) return;
  shiftMemberOwn(d.self, diff);
  d.endAge += diff;
  d.living.monthly = shiftSched(d.living.monthly, diff);
  for (const h of d.housing) {
    h.startAge += diff;
    h.property.prepayments = h.property.prepayments.map(p => ({ ...p, age: p.age + diff }));
    if (h.property.refinance) h.property.refinance = { ...h.property.refinance, age: h.property.refinance.age + diff };
  }
  for (const c of d.children) c.birthAge += diff;
  for (const e of d.events) {
    if (e.kind === "death") e.age += diff;
    else { e.startAge += diff; if ("endAge" in e) e.endAge += diff; if ("payoutUntilAge" in e) e.payoutUntilAge += diff; }
  }
  d.economy.stressTest.age += diff;
}

export function shiftSpouseAge(d: Plan, newAge: number): void {
  if (!d.spouse) return;
  const diff = newAge - d.spouse.age;
  if (!diff) return;
  shiftMemberOwn(d.spouse, diff);
}
