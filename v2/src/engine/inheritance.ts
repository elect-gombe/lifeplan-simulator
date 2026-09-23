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

/** 税率表のどの段に載ったか（表示用）。 */
export function inheritanceBracket(share: number): { rate: number; deduction: number } {
  if (share <= 10_000_000) return { rate: 0.10, deduction: 0 };
  if (share <= 30_000_000) return { rate: 0.15, deduction: 500_000 };
  if (share <= 50_000_000) return { rate: 0.20, deduction: 2_000_000 };
  if (share <= 100_000_000) return { rate: 0.30, deduction: 7_000_000 };
  if (share <= 200_000_000) return { rate: 0.40, deduction: 17_000_000 };
  if (share <= 300_000_000) return { rate: 0.45, deduction: 27_000_000 };
  if (share <= 600_000_000) return { rate: 0.50, deduction: 42_000_000 };
  return { rate: 0.55, deduction: 72_000_000 };
}

export const SMALL_LOT_MAX_SQM = 330;
export const SMALL_LOT_RELIEF_PCT = 80;

export interface HomeTaxValue {
  market: number; land: number; building: number; relief: number; value: number;
  /** 表示用に、どの前提で引き直したかを持ち回る */
  landRatioPct: number; landValuationPct: number; buildingValuationPct: number;
  coveredPct: number;      // 小規模宅地の対象になった土地の割合（%）
  reliefApplied: boolean;
}

/**
 * 住宅の相続税評価額。時価ではなく、土地は路線価水準・建物は固定資産税評価額水準に引き直し、
 * 小規模宅地等の特例（330㎡ まで 80% 減額）をかける。面積が 330㎡ を超える分は減額されない。
 */
export function homeInheritanceValue(
  market: number,
  p: { landRatioPct: number; landAreaSqm: number; smallLotRelief: boolean },
  ec: { landValuationPct: number; buildingValuationPct: number },
): HomeTaxValue {
  const landMarket = market * Math.min(Math.max(p.landRatioPct, 0), 100) / 100;
  const land = landMarket * ec.landValuationPct / 100;
  const building = (market - landMarket) * ec.buildingValuationPct / 100;
  const covered = p.landAreaSqm > 0 ? Math.min(SMALL_LOT_MAX_SQM / p.landAreaSqm, 1) : 1;
  const relief = p.smallLotRelief ? land * covered * SMALL_LOT_RELIEF_PCT / 100 : 0;
  return {
    market, land, building, relief, value: land + building - relief,
    landRatioPct: Math.min(Math.max(p.landRatioPct, 0), 100), landValuationPct: ec.landValuationPct,
    buildingValuationPct: ec.buildingValuationPct, coveredPct: covered * 100, reliefApplied: p.smallLotRelief,
  };
}

/** 計算過程をそのまま画面・レポートに出すための内訳。金額はすべて円。 */
export interface InheritanceDetail {
  who: "self" | "spouse";
  name: string;
  age: number;                 // 亡くなった本人年齢
  heirs: number;               // 法定相続人の数
  hasSpouse: boolean;
  childCount: number;
  kids: number;                 // 法定相続分の計算に使う子の数（配偶者がいない場合は最低 1）
  estate: number;              // 本来の相続財産（世帯按分後）
  deemedInsurance: number;     // 死亡保険金
  insuranceExempt: number;     // その非課税枠
  deemedRetirement: number;    // 死亡退職金・DC死亡一時金
  retirementExempt: number;    // その非課税枠
  liquid: number;              // 現金・有価証券・NISA（按分後）
  home: HomeTaxValue | null;   // 住宅の相続税評価（按分後）。持ち家でなければ null
  landAreaSqm: number;         // 小規模宅地の上限判定に使った面積
  debts: number;               // 債務控除の合計
  debtFuneral: number;         // うち葬儀費用
  debtLoan: number;            // うち住宅ローン残高（団信で消えた分は含まない）
  danshinForgiven: number;     // 団信で消えたローン残高（債務控除できない・保険金にも含めない）
  total: number;               // 課税価格の合計額
  basicDeduction: number;      // 基礎控除
  taxableEstate: number;       // 課税遺産総額
  spouseShare: number;         // 配偶者の法定相続分（0〜1）
  childShare: number;          // 子 1 人あたりの法定相続分（0〜1）
  spouseTax: number;           // 配偶者の按分額にかかる税
  childTax: number;            // 子 1 人あたりの税
  totalTax: number;            // 相続税の総額
  spouseCredit: number;        // 配偶者の税額軽減
  tax: number;                 // 納付税額
}

export function inheritanceTax(
  estate: number, deemedInsurance: number, deemedRetirement: number,
  childCount: number, hasSpouse: boolean,
  debts = 0,
  meta: {
    who: "self" | "spouse"; name: string; age: number;
    danshinForgiven?: number; liquid?: number; home?: HomeTaxValue | null; landAreaSqm?: number;
    debtFuneral?: number; debtLoan?: number;
  } = { who: "self", name: "", age: 0 },
): InheritanceDetail {
  const heirs = Math.max(childCount + (hasSpouse ? 1 : 0), 1);
  // みなし相続財産: 死亡保険金・死亡退職金（DC死亡一時金）はそれぞれ 500万×法定相続人 まで非課税
  const insuranceExempt = Math.min(deemedInsurance, C.INHERITANCE_INSURANCE_EXEMPT_PER_HEIR * heirs);
  const retirementExempt = Math.min(deemedRetirement, C.INHERITANCE_INSURANCE_EXEMPT_PER_HEIR * heirs);
  const basicDeduction = C.INHERITANCE_BASIC + C.INHERITANCE_PER_HEIR * heirs;
  const total = Math.max(Math.max(estate, 0) + (deemedInsurance - insuranceExempt) + (deemedRetirement - retirementExempt) - debts, 0);
  const taxable = Math.max(total - basicDeduction, 0);
  const kids = Math.max(childCount, hasSpouse ? 0 : 1);
  const spouseShare = hasSpouse ? (kids > 0 ? 0.5 : 1) : 0;
  const childShare = kids > 0 ? (1 - spouseShare) / kids : 0;
  const base = {
    who: meta.who, name: meta.name, age: meta.age, heirs, hasSpouse, childCount, kids,
    danshinForgiven: meta.danshinForgiven ?? 0, liquid: meta.liquid ?? Math.max(estate, 0),
    home: meta.home ?? null, landAreaSqm: meta.landAreaSqm ?? 0,
    debtFuneral: meta.debtFuneral ?? debts, debtLoan: meta.debtLoan ?? 0,
    estate: Math.max(estate, 0), deemedInsurance, insuranceExempt, deemedRetirement, retirementExempt,
    debts, total, basicDeduction, taxableEstate: taxable, spouseShare, childShare,
  };
  if (taxable <= 0) return { ...base, spouseTax: 0, childTax: 0, totalTax: 0, spouseCredit: 0, tax: 0 };
  const spouseTax = hasSpouse ? taxOnShare(taxable * spouseShare) : 0;
  const childTax = kids > 0 ? taxOnShare(taxable * childShare) : 0;
  const totalTax = spouseTax + childTax * kids;
  // 配偶者の税額軽減: 相続税の総額のうち配偶者の取得割合分が控除される。この試算は
  // 法定相続分どおりに分けた前提なので、配偶者分は必ず 1.6 億／法定相続分の枠に収まり全額が消える。
  const spouseCredit = hasSpouse ? totalTax * spouseShare : 0;
  return { ...base, spouseTax, childTax, totalTax, spouseCredit, tax: Math.max(Math.round(totalTax - spouseCredit), 0) };
}
