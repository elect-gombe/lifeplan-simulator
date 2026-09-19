/** 相続税の簡易計算（法定相続分課税方式）。 */
// ===== 相続税の計算（法定相続分課税方式・簡易版） =====
// 参考: 国税庁 No.4155
// 基礎控除: 3,000万 + 600万 × 法定相続人数
// みなし相続財産の非課税: 死亡保険金・死亡退職金それぞれ 500万 × 法定相続人数
// 税率: 累進課税（法定相続分で按分→各人の税額を合計）
// 簡易化: 配偶者+子の標準家族構成を前提、配偶者の税額軽減（1.6億 or 法定相続分）は適用
export function calcInheritanceTax(
  estate: number,              // 正味の遺産額（円）
  deemedDC: number,            // みなし相続: DC死亡一時金（円）
  deemedInsurance: number,     // みなし相続: 死亡保険金（円）
  legalHeirs: number,          // 法定相続人数
  hasSpouseSurvivor: boolean,  // 配偶者が遺族にいるか
): { tax: number; taxableEstate: number; detail: string } {
  // みなし相続財産の非課税枠
  const dcExempt = Math.min(deemedDC, 5000000 * legalHeirs);
  const insExempt = Math.min(deemedInsurance, 5000000 * legalHeirs);
  // 課税価格
  const taxablePrice = estate + (deemedDC - dcExempt) + (deemedInsurance - insExempt);
  // 基礎控除
  const basicDeduction = 30000000 + 6000000 * legalHeirs;
  const taxableEstate = Math.max(taxablePrice - basicDeduction, 0);
  if (taxableEstate <= 0) {
    return { tax: 0, taxableEstate: 0, detail: `遺産${Math.round(taxablePrice / 10000)}万≦基礎控除${Math.round(basicDeduction / 10000)}万 → 非課税` };
  }
  // 法定相続分で按分して各人の税額を計算
  // 配偶者: 1/2、子: 残り1/2を均等分割
  const childCount = Math.max(legalHeirs - (hasSpouseSurvivor ? 1 : 0), 1);
  const spouseShare = hasSpouseSurvivor ? taxableEstate / 2 : 0;
  const childShare = hasSpouseSurvivor ? taxableEstate / 2 / childCount : taxableEstate / childCount;

  // 税率テーブル（法定相続分に応ずる取得金額）
  const calcTaxForShare = (share: number) => {
    if (share <= 10000000) return share * 0.10;
    if (share <= 30000000) return share * 0.15 - 500000;
    if (share <= 50000000) return share * 0.20 - 2000000;
    if (share <= 100000000) return share * 0.30 - 7000000;
    if (share <= 200000000) return share * 0.40 - 17000000;
    if (share <= 300000000) return share * 0.45 - 27000000;
    if (share <= 600000000) return share * 0.50 - 42000000;
    return share * 0.55 - 72000000;
  };

  let totalTax = 0;
  if (hasSpouseSurvivor) totalTax += calcTaxForShare(spouseShare);
  totalTax += calcTaxForShare(childShare) * childCount;
  totalTax = Math.round(totalTax);

  // 配偶者の税額軽減（法定相続分 or 1.6億円のいずれか大きい方まで非課税）
  if (hasSpouseSurvivor) {
    const spouseActualShare = taxablePrice / 2; // 法定相続分
    const spouseExemptLimit = Math.max(spouseActualShare, 160000000);
    if (spouseActualShare <= spouseExemptLimit) {
      // 配偶者分の税額を全額控除
      totalTax -= Math.round(calcTaxForShare(spouseShare));
      totalTax = Math.max(totalTax, 0);
    }
  }

  const parts: string[] = [];
  parts.push(`課税遺産${Math.round(taxableEstate / 10000)}万`);
  if (dcExempt > 0) parts.push(`DC非課税${Math.round(dcExempt / 10000)}万`);
  if (insExempt > 0) parts.push(`保険非課税${Math.round(insExempt / 10000)}万`);
  if (hasSpouseSurvivor) parts.push(`配偶者軽減あり`);

  return { tax: totalTax, taxableEstate, detail: parts.join(" ") };
}
