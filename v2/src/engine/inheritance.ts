/** 相続税の簡易計算（法定相続分課税方式・配偶者の税額軽減あり）。単位: 円。 */
import * as C from "./constants";

function taxOnShare(share: number): number {
  if (share <= 10_000_000) return share * 0.10;
  if (share <= 30_000_000) return share * 0.15 - 500_000;
  if (share <= 50_000_000) return share * 0.20 - 2_000_000;
  if (share <= 100_000_000) return share * 0.30 - 7_000_000;
  if (share <= 200_000_000) return share * 0.40 - 17_000_000;
  if (share <= 300_000_000) return share * 0.45 - 27_000_000;
  if (share <= 600_000_000) return share * 0.50 - 42_000_000;
  return share * 0.55 - 72_000_000;
}

export function inheritanceTax(estate: number, deemedInsurance: number, deemedRetirement: number, childCount: number, hasSpouse: boolean): { tax: number; taxableEstate: number } {
  const heirs = Math.max(childCount + (hasSpouse ? 1 : 0), 1);
  // みなし相続財産: 死亡保険金・死亡退職金（DC死亡一時金）はそれぞれ 500万×法定相続人 まで非課税
  const insuranceTaxable = Math.max(deemedInsurance - C.INHERITANCE_INSURANCE_EXEMPT_PER_HEIR * heirs, 0);
  const retirementTaxable = Math.max(deemedRetirement - C.INHERITANCE_INSURANCE_EXEMPT_PER_HEIR * heirs, 0);
  const total = Math.max(estate, 0) + insuranceTaxable + retirementTaxable;
  const taxable = Math.max(total - (C.INHERITANCE_BASIC + C.INHERITANCE_PER_HEIR * heirs), 0);
  if (taxable <= 0) return { tax: 0, taxableEstate: 0 };
  const kids = Math.max(childCount, hasSpouse ? 0 : 1);
  const spouseShare = hasSpouse ? (kids > 0 ? 0.5 : 1) : 0;
  const childShare = kids > 0 ? (1 - spouseShare) / kids : 0;
  let total_tax = 0;
  if (hasSpouse) total_tax += taxOnShare(taxable * spouseShare);
  if (kids > 0) total_tax += taxOnShare(taxable * childShare) * kids;
  // 配偶者の税額軽減: 法定相続分（または1.6億）まで非課税 → 配偶者按分分を控除
  if (hasSpouse) {
    const spouseActual = total * spouseShare;
    if (spouseActual <= Math.max(C.INHERITANCE_SPOUSE_EXEMPT, total * spouseShare)) total_tax -= total_tax * spouseShare;
  }
  return { tax: Math.max(Math.round(total_tax), 0), taxableEstate: taxable };
}
