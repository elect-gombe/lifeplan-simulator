/**
 * 税・社会保険の計算根拠（旧版「税詳細」の計算式ヒントを継承）。
 * 選択年のメンバーごとに、収入 → 所得 → 所得控除 → 課税所得 → 税額 → 税額控除 → 手取り の各行を、
 * その年の実際の数値を入れた計算式つきで表示する。累進税率の階段図で限界税率・実効税率も示す。
 */
import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import type { MemberYear } from "@/engine/simulate";
import { computePersonTax, type PersonTaxResult, type PersonTaxInput } from "@/engine/tax";
import { inheritanceBracket, type InheritanceDetail } from "@/engine/inheritance";
import * as C from "@/engine/constants";
import { Collapsible, Toggle, cx } from "@/ui/primitives";
import { fmtMan, fmtYen } from "@/lib/format";

const KEY = "lifeplan-tax-formula";
const yen = (v: number) => fmtYen(Math.round(v));
const pct = (r: number, d = 1) => `${(r * 100).toFixed(d)}%`;
const EMP_LABEL = { employee: "会社員・公務員", selfEmployed: "自営業", none: "働いていない" } as const;

export interface Row { label: string; values: (number | string | null)[]; formula?: string; strong?: boolean; sub?: boolean; sign?: "minus" | "plus" }
export interface Group { title: string; cols: string[]; rows: Row[]; note?: string }

/** 給与所得控除の速算式（2025 年度改正後） */
function empDedFormula(salary: number): string {
  if (salary <= 1_900_000) return "年収 190 万以下 → 最低額 65 万";
  if (salary <= 3_600_000) return `${yen(salary)} × 30% + 8 万`;
  if (salary <= 6_600_000) return `${yen(salary)} × 20% + 44 万`;
  if (salary <= 8_500_000) return `${yen(salary)} × 10% + 110 万`;
  return "年収 850 万超 → 上限 195 万";
}
function penDedFormula(pension: number, age: number): string {
  const lo = age >= 65 ? "110 万" : "60 万", loLim = age >= 65 ? 3_300_000 : 1_300_000;
  if (pension <= loLim) return `${age >= 65 ? "65 歳以上" : "65 歳未満"}・年金 ${yen(loLim)} 以下 → 最低額 ${lo}（年金額が上限）`;
  if (pension <= 4_100_000) return `${yen(pension)} × 25% + 27.5 万`;
  if (pension <= 7_700_000) return `${yen(pension)} × 15% + 68.5 万`;
  if (pension <= 10_000_000) return `${yen(pension)} × 5% + 145.5 万`;
  return "年金 1,000 万超 → 上限 195.5 万";
}
function lifeFormula(p: number): string {
  if (p <= 0) return "保険料なし";
  if (p <= 20_000) return `保険料 ${yen(p)} ≤ 2 万 → 全額`;
  if (p <= 40_000) return `${yen(p)} × 1/2 + 1 万`;
  if (p <= 80_000) return `${yen(p)} × 1/4 + 2 万`;
  return `保険料 ${yen(p)} > 8 万 → 上限 4 万（住民税 2.8 万）`;
}
function bracketOf(taxable: number) {
  const t = Math.floor(taxable / 1000) * 1000;
  return { t, b: C.INCOME_TAX_BRACKETS.find(b => t <= b.upTo) ?? C.INCOME_TAX_BRACKETS[C.INCOME_TAX_BRACKETS.length - 1] };
}

const man = (v: number) => `${Math.round(v / 10000).toLocaleString()}万`;

/** 相続税の計算根拠。所得税と同じ「行＋計算式」の形で返す。 */
export function buildInheritanceGroups(d: InheritanceDetail): Group[] {
  const heirText = `配偶者${d.hasSpouse ? "あり" : "なし"}・子 ${d.childCount} 人 → 法定相続人 ${d.heirs} 人`;
  const groups: Group[] = [];
  const h = d.home;
  if (h) {
    groups.push({
      title: "住宅の相続税評価額", cols: ["金額"],
      rows: [
        { label: "時価（この試算の資産価値）", values: [h.market], formula: d.hasSpouse ? "世帯の 1/2 を故人の持ち分とみなした額" : undefined },
        { label: `土地（時価の ${h.landRatioPct}%）`, values: [h.land], sub: true, formula: `路線価はおおむね時価の ${h.landValuationPct}%` },
        { label: `建物（時価の ${100 - h.landRatioPct}%）`, values: [h.building], sub: true, formula: `固定資産税評価額はおおむね時価の ${h.buildingValuationPct}%` },
        ...(h.reliefApplied
          ? [{ label: "小規模宅地等の特例", values: [-h.relief], sub: true, formula: `土地の評価額 × ${Math.round(h.coveredPct)}% × 80% 減額（330㎡ まで。土地 ${d.landAreaSqm}㎡${h.coveredPct < 100 ? ` のうち 330㎡ 分` : ""}）` }]
          : [{ label: "小規模宅地等の特例", values: ["適用なし" as string], sub: true, formula: "配偶者・同居親族が取得しない前提（住まいセクションで切り替え）" }]),
        { label: "相続税評価額", values: [h.value], strong: true },
      ],
      note: h.market > 0 ? `時価の ${Math.round(h.value / h.market * 100)}% として相続財産に計上します。` : undefined,
    });
  }
  groups.push({
    title: "課税価格の合計額", cols: ["金額"],
    rows: [
      { label: "現金・有価証券・NISA", values: [d.liquid],
        formula: d.hasSpouse ? "配偶者が存命のため、世帯の現金・特定口座の 1/2 を故人の遺産とみなす。NISA は全額（名義人の資産）" : "世帯の資産の全額" },
      ...(h ? [{ label: "住宅（相続税評価額）", values: [h.value],
        formula: d.danshinForgiven > 0 ? `団信で消えたローン ${man(d.danshinForgiven)} は債務として引けない（保険金も遺族が受け取らないため相続財産に含めない）` : undefined }] : []),
      ...(d.deemedInsurance > 0 ? [
        { label: "死亡保険金（みなし相続財産）", values: [d.deemedInsurance] },
        { label: "非課税枠", values: [-d.insuranceExempt], sub: true, formula: `500万 × 法定相続人 ${d.heirs} 人 = ${man(C.INHERITANCE_INSURANCE_EXEMPT_PER_HEIR * d.heirs)}（受取額が上限）` },
      ] : []),
      ...(d.deemedRetirement > 0 ? [
        { label: "死亡退職金・DC 死亡一時金（みなし相続財産）", values: [d.deemedRetirement] },
        { label: "非課税枠", values: [-d.retirementExempt], sub: true, formula: `500万 × 法定相続人 ${d.heirs} 人 = ${man(C.INHERITANCE_INSURANCE_EXEMPT_PER_HEIR * d.heirs)}（受取額が上限）` },
      ] : []),
      ...(d.debtFuneral > 0 ? [{ label: "債務控除（葬儀費用）", values: [-d.debtFuneral], sub: true, formula: "葬儀費用は遺産から差し引ける" }] : []),
      ...(d.debtLoan > 0 ? [{ label: "債務控除（住宅ローン残高）", values: [-d.debtLoan], sub: true, formula: "団信がないため債務として残る" }] : []),
      { label: "課税価格の合計額", values: [d.total], strong: true },
    ],
  });
  groups.push({
    title: "課税遺産総額", cols: ["金額"],
    rows: [
      { label: "課税価格の合計額", values: [d.total] },
      { label: "基礎控除", values: [-d.basicDeduction], sub: true, formula: `3,000万 + 600万 × ${d.heirs} 人（${heirText}）` },
      { label: "課税遺産総額", values: [d.taxableEstate], strong: true },
    ],
    note: d.taxableEstate <= 0 ? "課税価格が基礎控除以下のため、相続税はかかりません。" : undefined,
  });
  if (d.taxableEstate > 0) {
    const share = (r: number) => d.taxableEstate * r;
    const brk = (v: number) => { const b = inheritanceBracket(v); return `${yen(v)} × ${pct(b.rate, 0)} − ${man(b.deduction)}`; };
    groups.push({
      title: "相続税の総額（法定相続分で按分）", cols: ["按分額", "税額"],
      rows: [
        ...(d.hasSpouse ? [{ label: `配偶者（法定相続分 ${d.kids > 0 ? "1/2" : "全部"}）`, values: [share(d.spouseShare), d.spouseTax], formula: brk(share(d.spouseShare)) }] : []),
        ...(d.kids > 0 ? [{ label: `子 1 人あたり（法定相続分 ${d.hasSpouse ? "1/2" : "全部"} ÷ ${d.kids} 人）`, values: [share(d.childShare), d.childTax], formula: brk(share(d.childShare)) }] : []),
        ...(d.kids > 1 ? [{ label: `子 ${d.kids} 人分`, values: [null, d.childTax * d.kids], sub: true }] : []),
        { label: "相続税の総額", values: [null, d.totalTax], strong: true },
      ],
      note: "実際の分け方ではなく、いったん法定相続分どおりに分けたものとして総額を出す方式です。",
    });
    groups.push({
      title: "納付税額", cols: ["金額"],
      rows: [
        { label: "相続税の総額", values: [d.totalTax] },
        ...(d.spouseCredit > 0 ? [{ label: "配偶者の税額軽減", values: [-d.spouseCredit], sub: true, formula: `総額 × 配偶者の取得割合 ${pct(d.spouseShare, 0)}。法定相続分（または 1.6 億）までは配偶者に税がかからない` }] : []),
        { label: "納付税額", values: [d.tax], strong: true },
      ],
      note: d.hasSpouse ? "この試算は法定相続分どおりに分ける前提です。配偶者が多く取ると今回は軽くなりますが、その分が二次相続で課税されます。" : undefined,
    });
  }
  return groups;
}

export function buildTaxGroups(m: MemberYear, t: PersonTaxResult): Group[] {
  const b = t.breakdown;
  const si = t.socialInsurance;
  const isEmp = b.employment === "employee" && b.salary > 0;
  const { t: taxableK, b: br } = bracketOf(t.taxableIt);
  const groups: Group[] = [];

  groups.push({
    title: "収入 → 所得", cols: ["金額"],
    rows: [
      ...(b.salary > 0 ? [
        { label: "額面給与", values: [b.salary], formula: m.matching > 0 ? `年収 ${yen(b.salary + m.matching)} − 選択制DC拠出 ${yen(m.matching)}（給与から拠出した分は課税対象外）` : `賞与込みの年収${m.leaveMonths > 0 ? `。育休 ${m.leaveMonths} ヶ月分は無給として減額` : ""}` },
        { label: "給与所得控除", values: [-t.employmentDeduction], formula: empDedFormula(b.salary), sub: true },
        { label: "給与所得", values: [b.salaryIncome], formula: `${yen(b.salary)} − ${yen(t.employmentDeduction)}`, strong: true },
      ] : []),
      ...(b.pension > 0 ? [
        { label: "公的年金等（老齢年金・DC年金）", values: [b.pension], formula: `老齢基礎 ${yen(m.pensionBasic)} + 老齢厚生 ${yen(m.pensionEmployee)}${m.pensionReduction > 0 ? ` − 在職老齢年金の支給停止 ${yen(m.pensionReduction)}` : ""}${m.dcAnnuity > 0 ? ` + DC 年金受取 ${yen(m.dcAnnuity)}` : ""}（マクロ経済スライド反映後の名目額）` },
        { label: "公的年金等控除", values: [-t.pensionDeduction], formula: penDedFormula(b.pension, b.age), sub: true },
        { label: "雑所得（年金）", values: [b.pensionIncome], formula: `${yen(b.pension)} − ${yen(t.pensionDeduction)}`, strong: true },
      ] : []),
      ...(b.other > 0 ? [{ label: "その他の雑所得", values: [b.other], formula: "課税対象の収入イベント（不動産・事業・私的年金など）" }] : []),
      { label: "合計所得金額", values: [t.totalIncome], formula: [b.salaryIncome > 0 && `給与所得 ${yen(b.salaryIncome)}`, b.pensionIncome > 0 && `年金の雑所得 ${yen(b.pensionIncome)}`, b.other > 0 && `その他 ${yen(b.other)}`].filter(Boolean).join(" + ") || "所得なし", strong: true },
    ],
  });

  const wall = (n: number) => `${Math.round(n / 10_000)}万円`;
  const siRows: Row[] = b.siStatus === "employee" ? [
    { label: "健康保険", values: [si.health], formula: `標準報酬（年収、上限 ${fmtMan(C.HEALTH_STANDARD_MONTHLY_CAP * 12 + 5_730_000)}）× ${pct(C.HEALTH_RATE_EMPLOYEE)}（協会けんぽ平均の本人負担）${b.age >= C.LATE_ELDERLY_AGE ? " → 75 歳以上は後期高齢者医療へ移行するため 0" : ""}` },
    { label: "介護保険", values: [si.nursing], formula: b.age >= 40 && b.age < 65 ? `標準報酬 × ${pct(C.NURSING_RATE_EMPLOYEE)}（40〜64 歳）` : b.age < 40 ? "40 歳未満は対象外" : "65 歳以上は第 1 号被保険者として別途徴収（会社員は本試算では未計上）" },
    { label: "厚生年金", values: [si.pension], formula: b.age < 70 ? `標準報酬（上限 月 ${fmtMan(C.PENSION_STANDARD_MONTHLY_CAP)}＋賞与 ${fmtMan(C.PENSION_BONUS_CAP_ANNUAL)}/年）× ${pct(C.PENSION_RATE_EMPLOYEE, 2)}（18.3% の半分）` : "70 歳以上は厚生年金の被保険者でない" },
    { label: "雇用保険", values: [si.employment], formula: `年収 ${yen(b.salary)} × ${pct(C.EMPLOYMENT_INSURANCE_RATE, 2)}` },
    { label: "子ども・子育て支援金", values: [si.childSupport], formula: `標準報酬 × ${pct(C.CHILD_SUPPORT_RATE, 2)}（2028 年度の恒久水準を初年度から適用）` },
  ] : b.siStatus !== "self" ? [
    { label: "社会保険料", values: [0], formula: b.siStatus === "exemptLeave" ? "年間まるごと育休 → 健康保険・厚生年金は免除（被保険者期間は継続）"
      : `配偶者の被扶養者（健康保険）・第 3 号被保険者（年金）のため負担なし。収入 ${yen(t.gross)} が ${wall(b.age >= 60 ? C.SI_DEPENDENT_LIMIT_SENIOR : C.SI_DEPENDENT_LIMIT)}（いわゆる「${wall(C.SI_DEPENDENT_LIMIT)}の壁」${b.age >= 60 ? "・60 歳以上" : ""}）未満で、給与も ${wall(C.SI_ENROLL_ANNUAL)}（加入要件）未満` },
  ] : [
    { label: b.age >= C.LATE_ELDERLY_AGE ? "後期高齢者医療保険" : "国民健康保険", values: [si.health], formula: b.age >= C.LATE_ELDERLY_AGE ? `（合計所得 − 基礎控除 43 万）× ${pct(C.LATE_ELDERLY_RATE)} + 均等割 ${yen(C.LATE_ELDERLY_PER_CAPITA)}（概算）` : `（合計所得 − 基礎控除 43 万）× ${pct(b.age >= 40 && b.age < 65 ? C.NHI_INCOME_RATE : C.NHI_INCOME_RATE - 0.02)} + 均等割 ${yen(C.NHI_PER_CAPITA)}、限度額 ${fmtMan(b.age >= 40 && b.age < 65 ? C.NHI_CAP : C.NHI_CAP_NO_NURSING)}（概算。前年所得ベースを当年で近似）` },
    { label: "介護保険（第 1 号）", values: [si.nursing], formula: b.age >= 65 ? `（合計所得 − 43 万）× ${pct(C.NURSING_65_PLUS_RATE)}、最低 ${yen(C.NURSING_65_PLUS_MIN)}（概算）` : b.age >= 40 ? "40〜64 歳は国保の介護分に含む" : "40 歳未満は対象外" },
    { label: "国民年金", values: [si.pension], formula: si.pension > 0 ? `${yen(C.NATIONAL_PENSION_MONTHLY)} × 12 ヶ月（20〜59 歳）` : b.age >= 60 ? "60 歳以上は納付終了" : "対象外" },
  ];
  const siNote = b.siStatus === "employee" ? `雇用形態: ${EMP_LABEL[b.employment]}。給与 ${wall(C.SI_ENROLL_ANNUAL)} 以上のため勤務先の社会保険に加入（料率は協会けんぽ平均）。`
    : b.siStatus === "dependent" ? `雇用形態: ${EMP_LABEL[b.employment]}。被扶養者のため保険料はかかりません。勤務先で加入する場合は収入セクションの「社会保険」を「必ず加入」に。`
    : b.siStatus === "self" ? `雇用形態: ${EMP_LABEL[b.employment]}。勤務先の社会保険の対象外・扶養にも入れないため、国民健康保険＋国民年金（概算・均等割の軽減あり）。`
    : `雇用形態: ${EMP_LABEL[b.employment]}。`;
  groups.push({ title: "社会保険料（本人負担）", cols: ["金額"], rows: [...siRows, { label: "社会保険料 合計", values: [si.total], strong: true, formula: `全額が所得控除（社会保険料控除）になる` }], note: siNote });

  groups.push({
    title: "所得控除", cols: ["所得税", "住民税"],
    rows: [
      { label: "社会保険料控除", values: [si.total, si.total], formula: "支払った社会保険料の全額" },
      ...(b.ideco > 0 ? [{ label: "小規模企業共済等掛金控除", values: [b.ideco, b.ideco], formula: `iDeCo・マッチング拠出 ${yen(b.ideco)} の全額` }] : []),
      { label: "基礎控除", values: [b.basicIt, b.basicRt], formula: `所得税: 合計所得 ${yen(t.totalIncome)} ${t.totalIncome <= C.BASIC_DEDUCTION_IT_LOW_LIMIT ? `≤ 132 万 → ${fmtMan(C.BASIC_DEDUCTION_IT_LOW)}` : `> 132 万 → ${fmtMan(C.BASIC_DEDUCTION_IT)}`}（2025 年度改正）／ 住民税は ${fmtMan(C.BASIC_DEDUCTION_RT)}` },
      ...(b.spouseIncome != null ? [{ label: b.spouseIncome <= 580_000 ? "配偶者控除" : "配偶者特別控除", values: [b.spouseIt, b.spouseRt], formula: b.spouseIt > 0 ? `配偶者の合計所得 ${yen(b.spouseIncome)}、本人の合計所得 ${yen(t.totalIncome)}${t.totalIncome > 9_000_000 ? "（900 万超で段階的に縮小）" : ""} → ${fmtMan(b.spouseIt)}` : t.totalIncome > 10_000_000 ? "本人の合計所得 1,000 万超 → 適用なし" : `配偶者の合計所得 ${yen(b.spouseIncome)} > 133 万 → 適用なし` }] : []),
      ...(b.lifePremium > 0 ? [
        { label: "生命保険料控除", values: [b.lifeIt, b.lifeRt], formula: `3 区分の合計（所得税 上限 12 万 / 住民税 上限 7 万）` },
        ...(["general", "medical", "pension"] as const).filter(k => b.lifePremiums[k] > 0).map(k => ({ label: { general: "一般生命保険料", medical: "介護医療保険料", pension: "個人年金保険料" }[k], values: [b.lifeParts[k].it, b.lifeParts[k].rt], formula: `${lifeFormula(b.lifePremiums[k])}（新制度）`, sub: true })),
      ] : []),
      ...(b.earthquakePremium > 0 ? [{ label: "地震保険料控除", values: [b.earthquakeIt, b.earthquakeRt], formula: `地震保険料 ${yen(b.earthquakePremium)} → 所得税は全額（上限 5 万）、住民税は 1/2（上限 2.5 万）` }] : []),
      ...(b.dependentIt > 0 ? [{ label: "扶養控除", values: [b.dependentIt, b.dependentRt], formula: `16〜18 歳 ${fmtMan(C.DEPENDENT_GENERAL)}（住民税 ${fmtMan(C.DEPENDENT_GENERAL_RT)}）、19〜22 歳 ${fmtMan(C.DEPENDENT_SPECIFIC)}（住民税 ${fmtMan(C.DEPENDENT_SPECIFIC_RT)}）の合計。世帯で所得が高い側に付ける` }] : []),
      ...(b.donationDed > 0 ? [{ label: "寄附金控除（ふるさと納税）", values: [b.donationDed, null], formula: `寄附額 ${yen(t.furusatoDonation)} − 2,000 円（所得税は所得控除、住民税は税額控除で処理）` }] : []),
      { label: "所得控除 合計", values: [t.deductionsIt + b.donationDed, b.dedRt], strong: true },
    ],
  });

  const itFormula = t.taxableIt <= 0 ? "課税所得 0 → 0" : `${yen(taxableK)}（千円未満切捨）× ${pct(br.rate, 0)} − ${yen(br.deduction)} = ${yen(taxableK * br.rate - br.deduction)} → × 1.021（復興特別所得税）→ 100 円未満切捨`;
  groups.push({
    title: "課税所得と税額", cols: ["所得税", "住民税"],
    rows: [
      { label: "課税所得", values: [t.taxableIt, t.taxableRt], formula: `合計所得 ${yen(t.totalIncome)} − 所得控除（所得税 ${yen(t.deductionsIt + b.donationDed)} / 住民税 ${yen(b.dedRt)}）` , strong: true },
      { label: "税率", values: [pct(br.rate, 0) + (t.taxableIt > 0 ? "（限界）" : ""), "10%（所得割）"], formula: `所得税は 7 段階の超過累進（5〜45%）。課税所得 ${yen(t.taxableIt)} は ${br.upTo === Infinity ? "4,000 万超" : `${yen(br.upTo)} 以下`} の区分` },
      { label: "税額（税額控除前）", values: [b.incomeTaxBeforeCredit, b.residentIncomeLevy], formula: `所得税: ${itFormula} ／ 住民税所得割: ${yen(Math.floor(t.taxableRt / 1000) * 1000)} × 10%` },
      ...(b.residentPerCapita > 0 ? [{ label: "住民税 均等割", values: [null, b.residentPerCapita], formula: "5,000 円（市町村 3,000＋都道府県 1,000＋森林環境税 1,000）" }] : []),
      ...(b.rtExempt ? [{ label: "住民税 非課税", values: [null, 0], formula: `合計所得 ${yen(t.totalIncome)} が非課税限度額 ${yen(b.rtLimit)}${b.dependentsForRt > 0 ? `（扶養親族等 ${b.dependentsForRt} 人: 35万×${b.dependentsForRt + 1}＋加算）` : "（扶養なし）"} 以下のため、所得割・均等割とも課されません` }] : []),
      ...(t.furusatoDonation > 0 ? [
        { label: "ふるさと納税による軽減", values: [-b.furusatoItRelief, -b.furusatoRtCredit], formula: `所得税: 寄附金控除 ${yen(b.donationDed)} × 限界税率 ${pct(t.marginalRate, 0)} × 1.021（上の課税所得に織り込み済み）／ 住民税: 基本分 ${yen(Math.round(b.donationDed * 0.1))}＋特例分（残り）＝ ${yen(b.furusatoRtCredit)}。実質負担 2,000 円`, sign: "minus" as const },
      ] : []),
      ...(b.housingLoanAvailable > 0 ? [
        { label: "住宅ローン控除", values: [-b.hlFromIt, -b.hlFromRt], formula: `控除可能額 ${yen(b.housingLoanAvailable)}（年末残高 × ${pct(C.HOUSING_LOAN_DEDUCTION_RATE)}、認定種別ごとの借入上限あり）。まず所得税から ${yen(b.hlFromIt)}、引き切れない分を住民税から ${yen(b.hlFromRt)}（上限 ${yen(C.HOUSING_LOAN_RT_CAP)}）${b.housingLoanAvailable - t.housingLoanCreditUsed > 0 ? `。${yen(b.housingLoanAvailable - t.housingLoanCreditUsed)} は使い切れず` : ""}`, sign: "minus" as const },
      ] : []),
      { label: "納める税額", values: [t.incomeTax, t.residentTax], strong: true, formula: `所得税 ${yen(t.incomeTax)} + 住民税 ${yen(t.residentTax)} = ${yen(t.incomeTax + t.residentTax)}。額面に対して ${pct((t.incomeTax + t.residentTax) / Math.max(t.gross, 1))}` },
    ],
    note: t.furusatoDonation > 0 ? `ふるさと納税の上限額 = 住民税所得割 × 20% ÷ (90% − 限界税率 × 1.021) + 2,000 円 → 今年は ${yen(t.furusatoDonation)}（千円単位）。` : undefined,
  });

  // ── 節税効果: 同じ年の条件で「その控除がなかったら」を再計算して差額を出す ──
  const inp: PersonTaxInput = { age: b.age, employment: b.employment, salary: b.salary, pension: b.pension, otherTaxableIncome: b.other, idecoAnnual: b.ideco, lifeInsurancePremium: b.lifePremium, dependentIt: b.dependentIt, dependentRt: b.dependentRt, spouseIncomeForDeduction: b.spouseIncome, housingLoanCredit: b.housingLoanAvailable, furusato: t.furusatoDonation > 0, onLeave: b.onLeave };
  const taxOf = (r: PersonTaxResult) => r.incomeTax + r.residentTax;
  const effectRows: Row[] = [];
  if (b.ideco > 0) {
    const without = computePersonTax({ ...inp, idecoAnnual: 0 });
    effectRows.push({ label: "iDeCo・マッチング拠出の節税", values: [taxOf(without) - taxOf(t)], formula: `拠出なしの税額 ${yen(taxOf(without))} − 拠出ありの税額 ${yen(taxOf(t))}。目安は拠出額 ${yen(b.ideco)} ×（限界税率 ${pct(t.marginalRate, 0)} + 住民税 10%）= ${yen(b.ideco * (t.marginalRate + 0.1))}` });
  }
  if (m.matching > 0 && isEmp) {
    const without = computePersonTax({ ...inp, salary: b.salary + m.matching });
    effectRows.push({ label: "選択制DC（給与からの拠出）の効果", values: [taxOf(without) - taxOf(t) + (without.socialInsurance.total - si.total)], formula: `給与を ${yen(m.matching)} 減らして拠出 → 税 ${yen(taxOf(without) - taxOf(t))} + 社会保険料 ${yen(without.socialInsurance.total - si.total)} の負担減。反面、標準報酬が下がるため将来の厚生年金が年 約 ${yen(m.matching * C.EMPLOYEE_PENSION_MULTIPLIER)} 減る` });
  }
  if (b.dependentIt > 0) {
    const without = computePersonTax({ ...inp, dependentIt: 0, dependentRt: 0 });
    effectRows.push({ label: "扶養控除の節税", values: [taxOf(without) - taxOf(t)], formula: `控除なしとの差。目安は 所得税 ${yen(b.dependentIt)} × ${pct(t.marginalRate, 0)} + 住民税 ${yen(b.dependentRt)} × 10%` });
  }
  if (b.spouseIt > 0) {
    const without = computePersonTax({ ...inp, spouseIncomeForDeduction: null });
    effectRows.push({ label: "配偶者（特別）控除の節税", values: [taxOf(without) - taxOf(t)], formula: `控除なしとの差` });
  }
  if (t.furusatoDonation > 0) {
    effectRows.push({ label: "ふるさと納税の実質負担", values: [t.furusatoDonation - b.furusatoItRelief - b.furusatoRtCredit], formula: `寄附 ${yen(t.furusatoDonation)} − 所得税軽減 ${yen(b.furusatoItRelief)} − 住民税控除 ${yen(b.furusatoRtCredit)}。上限いっぱいなら 2,000 円（端数処理で数百円ずれることがある）` });
  }
  if (t.housingLoanCreditUsed > 0) effectRows.push({ label: "住宅ローン控除の効果", values: [t.housingLoanCreditUsed], formula: `所得税 ${yen(b.hlFromIt)} + 住民税 ${yen(b.hlFromRt)}` });
  if (effectRows.length) groups.push({ title: "節税効果（この年・税額ベース）", cols: ["軽減額"], rows: effectRows, note: "「その控除がなかった場合」を同じ年の条件で計算し直した差額。控除どうしは相互に影響するので、単純合計は全体の軽減額と一致しないことがあります。" });

  // ── 退職金・DC 一時金（分離課税） ──
  if (m.dcLump > 0 || m.severance > 0) {
    groups.push({
      title: "退職所得（分離課税・この年の一時金）", cols: ["金額"],
      rows: [
        ...(m.severance > 0 ? [{ label: "退職一時金", values: [m.severance] }, { label: "退職所得の税", values: [-m.severanceTax], formula: "（一時金 − 退職所得控除）× 1/2 に累進課税＋住民税 10%。退職所得控除 = 勤続 20 年以下: 40 万×年数（最低 80 万）、20 年超: 800 万 + 70 万×(年数−20)", sub: true }] : []),
        ...(m.dcLump > 0 ? [{ label: "DC・iDeCo 一時金", values: [m.dcLump] }, { label: "DC 一時金の税", values: [-m.dcLumpTax], formula: "退職所得として計算。同じ年に退職金があれば合算して差額課税（控除の重複なし）", sub: true }] : []),
      ],
    });
  }

  groups.push({
    title: "手取り", cols: ["金額"],
    rows: [
      { label: "額面（給与＋年金等）", values: [t.gross] },
      { label: "所得税・住民税", values: [-(t.incomeTax + t.residentTax)] },
      { label: "社会保険料", values: [-si.total] },
      ...(t.furusatoDonation > 0 ? [{ label: "ふるさと納税 寄附額", values: [-t.furusatoDonation], formula: "寄附した年に現金が出るため手取りから引く（翌年の税で 2,000 円を除き戻る分は上の税額に反映済み）" }] : []),
      { label: "手取り", values: [t.takeHome], strong: true, formula: `${yen(t.gross)} − ${yen(t.incomeTax + t.residentTax)} − ${yen(si.total)}${t.furusatoDonation > 0 ? ` − ${yen(t.furusatoDonation)}` : ""}。額面の ${pct(t.takeHome / Math.max(t.gross, 1))}` },
      ...(m.ideco + m.matching > 0 ? [{ label: "家計に入る現金", values: [t.takeHome - m.ideco - m.matching + m.leaveBenefit + m.survivorPension], formula: `手取り − iDeCo ${yen(m.ideco)} − 選択制DC ${yen(m.matching)}${m.leaveBenefit > 0 ? ` + 育休給付 ${yen(m.leaveBenefit)}（非課税）` : ""}${m.survivorPension > 0 ? ` + 遺族年金 ${yen(m.survivorPension)}（非課税）` : ""}` }] : []),
    ],
  });
  return groups;
}

/** 累進税率の階段図。課税所得の位置と限界税率・実効税率を示す。 */
export function TaxBracketChart({ taxable, incomeTax, totalIncome }: { taxable: number; incomeTax: number; totalIncome: number }) {
  const W = 520, H = 120, m = { l: 36, r: 10, t: 10, b: 22 };
  const maxX = Math.max(20_000_000, taxable * 1.15);
  const x = (v: number) => m.l + Math.min(v, maxX) / maxX * (W - m.l - m.r);
  const y = (r: number) => m.t + (1 - r / 0.5) * (H - m.t - m.b);
  const { b: br } = bracketOf(taxable);
  const steps = C.INCOME_TAX_BRACKETS.map((b, i) => ({ from: i === 0 ? 0 : C.INCOME_TAX_BRACKETS[i - 1].upTo, to: Math.min(b.upTo, maxX), rate: b.rate })).filter(s => s.from < maxX);
  const effective = totalIncome > 0 ? incomeTax / totalIncome : 0;
  return (
    <div className="mt-3">
      <div className="label mb-1">所得税の累進税率と課税所得の位置</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[560px] block" role="img" aria-label="累進税率の階段図">
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map(r => <g key={r}><line x1={m.l} x2={W - m.r} y1={y(r)} y2={y(r)} stroke="var(--line)" /><text x={m.l - 4} y={y(r)} fontSize={9} textAnchor="end" dominantBaseline="middle" fill="var(--ink-3)">{Math.round(r * 100)}%</text></g>)}
        {steps.map(s => <rect key={s.from} x={x(s.from)} y={y(s.rate)} width={Math.max(x(s.to) - x(s.from), 0)} height={y(0) - y(s.rate)} fill={s.rate === br.rate && taxable > 0 ? "var(--accent)" : "var(--surface-3)"} opacity={s.rate === br.rate && taxable > 0 ? 0.35 : 1} stroke="var(--line-strong)" strokeWidth={0.5} />)}
        {taxable > 0 && <>
          <rect x={m.l} y={m.t} width={x(taxable) - m.l} height={H - m.t - m.b} fill="var(--accent)" opacity={0.08} />
          <line x1={x(taxable)} x2={x(taxable)} y1={m.t} y2={H - m.b} stroke="var(--accent)" strokeWidth={1.5} />
          <text x={Math.min(x(taxable) + 4, W - 150)} y={m.t + 10} fontSize={10} fill="var(--ink)">課税所得 {fmtMan(taxable)}・限界 {Math.round(br.rate * 100)}%</text>
        </>}
        {[0, 5_000_000, 10_000_000, 15_000_000, 20_000_000].filter(v => v <= maxX).map(v => <text key={v} x={x(v)} y={H - 8} fontSize={9} textAnchor="middle" fill="var(--ink-3)">{v === 0 ? "0" : fmtMan(v)}</text>)}
      </svg>
      <p className="hint mt-1">限界税率は「あと 1 万円稼いだら何%取られるか」。所得全体に対する実効税率（所得税のみ）は {pct(effective)}。iDeCo・ふるさと納税など所得控除の節税効果は限界税率で決まります。</p>
    </div>
  );
}

/** 計算根拠のテーブル（所得税・相続税で共用）。 */
export function GroupTables({ groups, formula }: { groups: Group[]; formula: boolean }) {
  return (
    <>
        {groups.map(g => (
        <div key={g.title}>
          <table className="w-full text-xs tabular">
            <thead>
              <tr className="border-b line">
                <th className="text-left py-1 font-semibold ink">{g.title}</th>
                {g.cols.map(c => <th key={c} className="text-right py-1 font-medium ink-3 w-28 whitespace-nowrap">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={`${r.label}${i}`} className={cx("border-b line last:border-0 align-top", r.strong && "surface-2")}>
                  <td className={cx("py-1 pr-2", r.sub && "pl-3", r.strong ? "font-semibold ink" : "ink-2")}>
                    {r.label}
                    {formula && r.formula && <div className="ink-3 font-normal text-[11px] leading-snug mt-0.5 whitespace-pre-wrap">{r.formula}</div>}
                  </td>
                  {r.values.map((v, j) => (
                    <td key={j} className={cx("py-1 text-right whitespace-nowrap", r.strong ? "font-semibold ink" : typeof v === "number" && v < 0 ? "text-[var(--good)]" : "ink")}>
                      {v == null ? <span className="ink-3">—</span> : typeof v === "string" ? v : `${v < 0 ? "−" : ""}${yen(Math.abs(v))}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {formula && g.note && <p className="hint mt-1">{g.note}</p>}
        </div>
      ))}
    </>
  );
}

export function TaxDetail({ m, name }: { m: MemberYear; name: string }) {
  const [formula, setFormula] = useState<boolean>(() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(KEY, formula ? "1" : "0"); } catch { /* ignore */ } }, [formula]);
  if (!m.alive) return <div className="rounded-xl border line p-3 text-sm ink-3">{name}: —</div>;
  const t = m.tax;
  if (!t || t.gross <= 0) return <div className="rounded-xl border line p-3 text-sm ink-3">{name}（{m.age}歳）: 課税所得なし{m.survivorPension > 0 && `・遺族年金 ${fmtMan(m.survivorPension)}（非課税）`}{m.leaveBenefit > 0 && `・育休給付 ${fmtMan(m.leaveBenefit)}（非課税）`}</div>;
  const groups = buildTaxGroups(m, t);
  return (
    <Collapsible title={<span className="inline-flex items-center gap-2"><Calculator size={14} />{name}（{m.age}歳）の税・社会保険の計算根拠</span>} summary={`手取り ${fmtMan(t.takeHome)} / 額面 ${fmtMan(t.gross)}・限界税率 ${Math.round(t.marginalRate * 100)}%`}
      right={<Toggle checked={formula} onChange={setFormula} label={<span className="text-xs">計算式を表示</span>} />}>
      <div className="space-y-4">
        <GroupTables groups={groups} formula={formula} />
        <TaxBracketChart taxable={t.taxableIt} incomeTax={t.incomeTax} totalIncome={t.totalIncome} />
        {m.companyDc > 0 && <p className="hint">企業型DC の事業主掛金 {fmtMan(m.companyDc)}/年 は給与ではないため、上の額面・社会保険料・税のいずれにも含まれません（DC 残高に直接積み立て）。</p>}
      </div>
    </Collapsible>
  );
}
