import React from "react";
import { fmt } from "../lib/format";
import type { ScenarioResult, BaseResult, YearResult } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

// Props shared between modal and inline panel
interface TaxDetailProps {
  age: number | null;
  results: ScenarioResult[];
  base: BaseResult;
  sirPct: number;
}

export function TaxDetailModal({ isOpen, onClose, age, results, base, sirPct }: TaxDetailProps & {
  isOpen: boolean; onClose: () => void;
}) {
  if (!isOpen || age == null) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-black/40" onClick={onClose}>
      <div className="flex-1 min-h-0 w-[calc(100%-60px)] max-w-[1400px] my-1 sm:my-2 rounded-lg bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-3 py-1.5 shrink-0">
          <p className="text-sm font-bold">{age}歳時点の詳細</p>
          <button onClick={onClose} className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">閉じる</button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-1 sm:p-2">
          <TaxDetailContent age={age} results={results} base={base} sirPct={sirPct} />
        </div>
      </div>
    </div>
  );
}

/** Inline panel version (for side panel on wide screens) */
export function TaxDetailPanel({ age, results, base, sirPct }: TaxDetailProps) {
  if (age == null) return null;
  return (
    <div className="h-full overflow-auto p-1">
      <p className="text-xs font-bold text-gray-600 mb-1 sticky top-0 bg-white/90 backdrop-blur-sm py-1">{age}歳時点の詳細</p>
      <TaxDetailContent age={age} results={results} base={base} sirPct={sirPct} compact />
    </div>
  );
}

function TaxDetailContent({ age, results, base, sirPct, compact }: TaxDetailProps & { compact?: boolean }) {
  if (age == null) return null;

  const yrs = results.map(r => r.yearResults.find(yr => yr.age === age));
  const hasSpouse = results.some(r => r.scenario.spouse?.enabled) || yrs.some(yr => yr && yr.spousePensionIncome > 0);
  const hasNISA = yrs.some(yr => yr && (yr.nisaAsset > 0 || yr.taxableAsset > 0));
  const hasInsurance = yrs.some(yr => yr && (yr.insurancePremiumTotal > 0 || yr.insurancePayoutTotal > 0));

  // 万円表記ヘルパー
  const m = (v: number) => `${Math.round(v / 10000)}万`;
  // シナリオAの本人データで計算式を生成
  const y0 = yrs[0];

  const subCols = hasSpouse ? ["本人", "配偶者", "世帯"] as const : ["本人"] as const;
  const subCount = subCols.length;
  const totalCols = (compact ? 1 : 2) + results.length * subCount;

  type Sub = "本人" | "配偶者" | "世帯";
  type ValFn = (yr: YearResult, sub: Sub) => any;

  // ヘルパー: 本人/配偶者/世帯で値を分配する ValFn を生成
  // per(selfFn, spouseFn) → 本人=selfFn, 配偶者=spouseFn, 世帯=self+spouse (0は"-")
  const per = (selfFn: (yr: YearResult) => number, spouseFn: (yr: YearResult) => number): ValFn =>
    (yr, s) => {
      if (s === "本人") { const v = selfFn(yr); return v ? v : "-"; }
      if (s === "配偶者") { const v = spouseFn(yr); return v ? v : "-"; }
      const v = selfFn(yr) + spouseFn(yr); return v ? v : "-";
    };
  // household(fn) → 世帯 or 配偶者なし時のみ表示
  const household = (fn: (yr: YearResult) => number): ValFn =>
    (yr, s) => (s === "世帯" || !hasSpouse) ? (fn(yr) || "-") : "-";

  const makeCells = (fn: ValFn, bold?: boolean, neg?: boolean) => {
    const out: React.ReactNode[] = [];
    for (let si = 0; si < results.length; si++) {
      const yr = yrs[si];
      for (let ci = 0; ci < subCols.length; ci++) {
        const sub = subCols[ci];
        const v = yr ? fn(yr, sub) : "-";
        const isFirst = ci === 0, isLast = ci === subCols.length - 1;
        const borderL = isFirst ? "border-l-2 border-l-gray-500" : "border-l border-l-gray-200";
        const borderR = isLast ? "border-r-2 border-r-gray-500" : "";
        const bgCol = sub === "世帯" ? "bg-amber-50/40" : "";
        out.push(
          <td key={`${si}-${ci}`}
            className={`${borderL} ${borderR} border-y border-gray-200 px-1 py-0.5 text-right text-[11px] tabular-nums ${bgCol} ${neg && typeof v === "number" && v > 0 ? "text-red-600" : ""} ${bold ? "font-bold" : ""}`}>
            {typeof v === "string" ? v : `¥${fmt(v)}`}
          </td>
        );
      }
    }
    return out;
  };

  // R: 項目行。hint= 計算式（狭い画面/compact: ラベル下に表示、広い画面: 右の別列に表示）
  const R = ({ l, fn, bold, bg, sub: isSub, neg, hint }: {
    l: string; fn: ValFn; bold?: boolean; bg?: string; sub?: boolean; neg?: boolean; hint?: string;
  }) => (
    <tr className={bg || ""}>
      <td className={`border-y border-gray-200 border-r border-r-gray-200 px-1 py-0.5 text-[11px] whitespace-normal ${isSub ? "pl-2 text-gray-500" : ""} ${bold ? "font-bold" : ""}`}>
        <span className="whitespace-nowrap">{l}</span>
        {hint && <span className={`block ${hideHintCol ? "" : "xl:hidden"} text-[10px] font-normal text-blue-500/70 leading-tight`}>{hint}</span>}
      </td>
      {!hideHintCol && <td className="hidden xl:table-cell border-y border-gray-200 border-r-2 border-r-gray-300 px-1.5 py-0.5 text-[10px] text-blue-500/70 whitespace-normal max-w-[280px] leading-tight">
        {hint || ""}
      </td>}
      {makeCells(fn, bold, neg)}
    </tr>
  );

  const S = ({ children, bg }: { children: string; bg?: string }) => (
    <tr className={bg || "bg-gray-100"}>
      <td colSpan={totalCols} className="border-y-2 border-gray-400 px-2 py-1 text-[11px] font-bold tracking-wide">{children}</td>
    </tr>
  );

  // Cost labels
  const costLabels: string[] = [];
  const housingLabels: string[] = [];
  for (const yr of yrs) {
    if (!yr) continue;
    for (const c of yr.eventCostBreakdown) {
      if (!costLabels.includes(c.label)) costLabels.push(c.label);
      if (!housingLabels.includes(c.label) && (c.label.includes("ローン") || c.label.includes("住宅") || c.label.includes("管理費") || c.label.includes("固定資産税") || c.label.includes("頭金")))
        housingLabels.push(c.label);
    }
  }

  // In compact mode (side panel), hide the hint column always
  const hideHintCol = compact;

  return (
          <table className={`border-collapse text-[11px] leading-tight whitespace-nowrap ${compact ? "" : "w-full"}`}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th rowSpan={2} className="bg-gray-300 border-2 border-gray-500 px-1 py-1 text-left">項目</th>
                {!hideHintCol && <th rowSpan={2} className="hidden xl:table-cell bg-gray-300 border-2 border-gray-500 px-1 py-1 text-left text-[10px] text-blue-600/60">計算式</th>}
                {results.map((r, si) => (
                  <th key={si} colSpan={subCount}
                    className="border-2 border-gray-500 px-1 py-1 text-center text-xs"
                    style={{ backgroundColor: `${COLORS[si]}15`, color: COLORS[si] }}>
                    {r.scenario.name}
                  </th>
                ))}
              </tr>
              <tr>
                {results.map((_, si) =>
                  subCols.map((sub, ci) => (
                    <th key={`${si}-${ci}`}
                      className={`bg-gray-100 px-1 py-0.5 text-center text-[10px] border-y-2 border-gray-500 ${ci === 0 ? "border-l-2 border-l-gray-500" : "border-l border-l-gray-200"} ${ci === subCols.length - 1 ? "border-r-2 border-r-gray-500" : ""} ${sub === "世帯" ? "bg-amber-50" : ""}`}>
                      {sub === "本人" ? <span className="text-gray-700">本人</span>
                       : sub === "配偶者" ? <span className="text-pink-600">配偶者</span>
                       : <span className="text-amber-700">世帯</span>}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {/* ===== 収入 ===== */}
              <S bg="bg-emerald-50">■ 収入</S>
              {yrs.some(yr => yr && (yr.gross > 0 || yr.spouseGross > 0)) && (<>
                <R l="給与収入" bold hint="キーフレーム×昇給率" fn={(yr, s) => s === "本人" ? `${Math.round(yr.grossMan)}万` : s === "配偶者" ? (yr.spouseGross > 0 ? `${Math.round(yr.spouseGross / 10000)}万` : "-") : `${Math.round(yr.grossMan + yr.spouseGross / 10000)}万`} />
                <R l="  給与所得控除" sub
                  hint={y0 ? `${m(y0.gross)}−DC${m(y0.dcIdecoDeduction)}=${m(y0.gross - y0.dcIdecoDeduction)} → 控除${m(y0.employeeDeduction)}` : "DC控除後の年収に応じた控除(55万〜195万)"}
                  fn={per(yr => yr.employeeDeduction, yr => yr.spouseEmployeeDeduction)} />
                <R l="  社会保険料控除" sub
                  hint={y0 ? `(${m(y0.gross)}−DC${m(y0.selfDCContribution)})×${sirPct}%=${m(y0.socialInsuranceDeduction)}` : `(年収−DC自己負担)×${sirPct}%`}
                  fn={per(yr => yr.socialInsuranceDeduction, yr => yr.spouseSocialInsuranceDeduction)} />
                <R l="  基礎控除" sub hint="一律48万円" fn={(yr, s) => s === "配偶者" ? yr.basicDeduction : s === "本人" ? yr.basicDeduction : yr.basicDeduction * 2} />
                {yrs.some(yr => yr && yr.selfDependentDeduction > 0) &&
                  <R l="  扶養控除" sub hint="16-18歳:38万 19-22歳:63万(特定) ※世帯主集約" fn={(yr, s) => {
                    if (!hasSpouse) return yr.selfDependentDeduction || "-";
                    if (s === "本人") return yr.selfDependentDeduction || "-";
                    if (s === "配偶者") return "-";
                    return yr.selfDependentDeduction || "-";
                  }} />}
                {yrs.some(yr => yr && yr.spouseDeductionAmount > 0) &&
                  <R l="  配偶者控除" sub hint={y0 && y0.spouseDeductionAmount > 0 ? `本人所得${m(y0.gross - y0.employeeDeduction)} 配偶者所得${m(y0.spouseGross - y0.spouseEmployeeDeduction)} → ${m(y0.spouseDeductionAmount)}` : "配偶者の所得に応じた控除(最大38万)"} fn={(yr, s) => {
                    if (s === "配偶者") return "-";
                    return yr.spouseDeductionAmount > 0 ? yr.spouseDeductionAmount : "-";
                  }} />}
                {yrs.some(yr => yr && yr.dcIdecoDeduction > 0) &&
                  <R l="  DC/iDeCo控除" sub hint="小規模企業共済等掛金控除(全額所得控除)" fn={per(yr => yr.dcIdecoDeduction, yr => yr.spouseDCIdecoDeduction)} />}
                {yrs.some(yr => yr && yr.lifeInsuranceDeductionAmount > 0) &&
                  <R l="  生命保険料控除" sub hint={y0 && y0.lifeInsuranceDeductionAmount > 0 ? `保険料${m(y0.insurancePremiumTotal)}→控除${m(y0.lifeInsuranceDeductionAmount)}(上限4万)` : "年間保険料に応じた控除(新制度・上限4万円)"}
                  fn={per(yr => yr.lifeInsuranceDeductionAmount, yr => yr.spouseLifeInsuranceDeductionAmount)} />}
                {yrs.some(yr => yr && yr.furusatoDeduction > 0) &&
                  <R l="  ふるさと納税控除" sub hint={y0 && y0.furusatoDeduction > 0 ? `寄付${m(y0.furusatoDeduction + 2000)}−自己負担2000=${m(y0.furusatoDeduction)}` : "寄付額−2000円"}
                  fn={per(yr => yr.furusatoDeduction, yr => yr.spouseFurusatoDeduction)} />}
                <R l="  課税所得" sub bold
                  hint={y0 ? `${m(y0.gross)}−${m(y0.employeeDeduction)}(給与)−${m(y0.socialInsuranceDeduction)}(社保)−48万(基礎)${y0.selfDependentDeduction > 0 ? `−${m(y0.selfDependentDeduction)}(扶養)` : ""}${y0.spouseDeductionAmount > 0 ? `−${m(y0.spouseDeductionAmount)}(配偶者)` : ""}−${m(y0.dcIdecoDeduction)}(DC)${y0.lifeInsuranceDeductionAmount > 0 ? `−${m(y0.lifeInsuranceDeductionAmount)}(生保)` : ""}${y0.furusatoDeduction > 0 ? `−${m(y0.furusatoDeduction)}(ふるさと)` : ""}=${m(y0.taxableIncome)}` : "収入−全所得控除"}
                  fn={per(yr => yr.taxableIncome, yr => yr.spouseTaxableIncome)} />
                <R l="  最高税率" sub hint="累進税率5-45%+住民税10%" fn={(yr, s) => {
                  const r = s === "配偶者" ? yr.spouseMarginalRate : yr.marginalRate;
                  return r > 0 ? `${r}%+住10%` : "-";
                }} />
                <R l="  所得税" sub neg
                  hint={y0 ? `iTx(${m(y0.taxableIncome)})${y0.housingLoanDeductionIT > 0 ? `−HL控除${m(y0.housingLoanDeductionIT)}` : ""}=${m(y0.incomeTax)}` : "iTx(課税所得)"}
                  fn={per(yr => yr.incomeTax, yr => yr.spouseIncomeTax)} />
                <R l="  住民税" sub neg
                  hint={y0 ? `${m(y0.taxableIncome)}×10%${y0.housingLoanDeductionRT > 0 ? `−HL控除${m(y0.housingLoanDeductionRT)}` : ""}=${m(y0.residentTax)}` : "課税所得×10%"}
                  fn={per(yr => yr.residentTax, yr => yr.spouseResidentTax)} />
                {yrs.some(yr => yr && (yr.housingLoanDeductionAvail > 0 || yr.spouseHousingLoanDeductionAvail > 0)) && (<>
                  <R l="    住宅ローン控除額" sub
                    hint={y0 ? `残高×0.7% 上限35万/年(13年間)` : "残高×0.7% 上限35万"}
                    fn={(yr, s) => {
                      if (s === "本人") return yr.housingLoanDeductionAvail > 0 ? yr.housingLoanDeductionAvail : "-";
                      if (s === "配偶者") return yr.spouseHousingLoanDeductionAvail > 0 ? yr.spouseHousingLoanDeductionAvail : "-";
                      const total = yr.housingLoanDeductionAvail + yr.spouseHousingLoanDeductionAvail;
                      return total > 0 ? total : "-";
                    }} />
                  <R l="    うち所得税から" sub hint="所得税額を上限に控除"
                    fn={per(yr => yr.housingLoanDeductionIT, yr => yr.spouseHousingLoanDeductionIT)} />
                  <R l="    うち住民税から" sub hint="残額を住民税から(上限: 課税所得×5% 最大97,500円)"
                    fn={per(yr => yr.housingLoanDeductionRT, yr => yr.spouseHousingLoanDeductionRT)} />
                </>)}
                <R l="  社会保険料" sub neg
                  hint={y0 ? `${m(y0.gross)}×${sirPct}%=${m(y0.socialInsurance)}(実際の天引額)` : `年収×${sirPct}%`}
                  fn={per(yr => yr.socialInsurance, yr => yr.spouseSocialInsurance)} />
              </>)}
              {yrs.some(yr => yr && (yr.selfPensionIncome > 0 || yr.spousePensionIncome > 0)) && (<>
                <R l="老齢年金" bold hint="基礎+厚生。平均年収×加入年数から自動計算"
                  fn={per(yr => yr.selfPensionIncome, yr => yr.spousePensionIncome)} />
                {yrs.some(yr => yr && yr.pensionReduction > 0) &&
                  <R l="  在職老齢年金減額" sub neg hint="基本月額+総報酬月額>50万/月→超過額の1/2を厚生年金から支給停止" fn={household(yr => yr.pensionReduction)} />}
                <R l="  年金課税" sub neg hint="公的年金等控除後の所得税+住民税" fn={household(yr => yr.pensionTax)} />
              </>)}
              {/* 遺族年金・保険金（死亡後） */}
              {yrs.some(yr => yr && yr.survivorIncome > 0) && <>
                <R l="遺族年金・保険" bold hint="遺族基礎+厚生年金+寡婦加算+収入保障保険" fn={household(yr => yr.survivorIncome)} />
                {yrs.some(yr => yr && yr.survivorBasicPension > 0) &&
                  <R l="  遺族基礎年金" sub hint="子のある配偶者に支給（81.6万+子の加算）" fn={household(yr => yr.survivorBasicPension)} />}
                {yrs.some(yr => yr && yr.survivorEmployeePension > 0) &&
                  <R l="  遺族厚生年金" sub hint="報酬比例×3/4（65歳以降は老齢厚生年金との差額支給）" fn={household(yr => yr.survivorEmployeePension)} />}
                {yrs.some(yr => yr && yr.survivorWidowSupplement > 0) &&
                  <R l="  中高齢寡婦加算" sub hint="40-65歳の妻（子なし）に62.4万/年 ※2028年〜段階的廃止" fn={household(yr => yr.survivorWidowSupplement)} />}
                {yrs.some(yr => yr && yr.survivorIncomeProtection > 0) &&
                  <R l="  収入保障保険" sub hint="死亡イベントの収入保障（月額×12）" fn={household(yr => yr.survivorIncomeProtection)} />}
              </>}
              {yrs.some(yr => yr && yr.insurancePayoutTotal > 0) &&
                <R l="  保険金(イベント)" sub hint="保険イベントからの一時金or月額給付" fn={household(yr => yr.insurancePayoutTotal)} />}
              {yrs.some(yr => yr && yr.childAllowance > 0) &&
                <R l="児童手当" hint="0-2歳:1.5万/月 3-18歳:1万/月 第3子以降:3万/月" fn={household(yr => yr.childAllowance)} />}
              {/* 手取り合計 */}
              <R l="手取り合計" bold bg="bg-emerald-100" hint="給与+年金−税・社保−DC+手当+保険" fn={(yr, s) => {
                return s === "本人" ? Math.round(yr.takeHomePay - yr.spouseTakeHome) : s === "配偶者" ? Math.round(yr.spouseTakeHome) : Math.round(yr.takeHomePay);
              }} />

              {/* ===== 税優遇 ===== */}
              {(yrs.some(yr => yr && yr.annualBenefit > 0) || (results.some(r => r.hasFuru) && yrs.some(yr => yr && yr.furusatoDonation > 0))) && (<>
                <S bg="bg-green-50">■ 税優遇</S>
                {yrs.some(yr => yr && yr.annualBenefit > 0) && (<>
                  <R l="DC節税(所得税)" sub
                    hint={y0 ? `DC無しiTx(${m(y0.taxableIncome + y0.dcIdecoDeduction)})−有りiTx(${m(y0.taxableIncome)})=${m(y0.incomeTaxSaving)}` : "DC/iDeCo控除前後の所得税差額"}
                    fn={per(yr => yr.incomeTaxSaving, yr => yr.spouseIncomeTaxSaving)} />
                  <R l="DC節税(住民税)" sub
                    hint={y0 ? `${m(y0.dcIdecoDeduction)}×10%=${m(y0.residentTaxSaving)}` : "DC控除額×住民税率10%"}
                    fn={per(yr => yr.residentTaxSaving, yr => yr.spouseResidentTaxSaving)} />
                  <R l="DC節税(社保)" sub
                    hint={y0 ? `DC自己負担${m(y0.selfDCContribution)}×${sirPct}%=${m(y0.socialInsuranceSaving)}` : "自己負担DC×社保率"}
                    fn={(yr, s) => s === "本人" ? yr.socialInsuranceSaving : "-"} />
                  <R l="DC節税計" bold
                    hint={y0 ? `${m(y0.incomeTaxSaving)}(IT)+${m(y0.residentTaxSaving)}(RT)+${m(y0.socialInsuranceSaving)}(社保)=${m(y0.annualBenefit)}` : "IT+RT+社保の節税合計"}
                    fn={(yr, s) => {
                    const sp = yr.spouseIncomeTaxSaving + yr.spouseResidentTaxSaving;
                    return s === "本人" ? yr.annualBenefit : s === "配偶者" ? sp : yr.annualBenefit + sp;
                  }} />
                </>)}
                {results.some(r => r.hasFuru) && yrs.some(yr => yr && yr.furusatoDonation > 0) && (<>
                  <R l="ふるさと納税" bold hint="寄付額(自己負担2000円)" fn={per(yr => yr.furusatoDonation, yr => yr.spouseFurusatoDonation)} />
                  <R l="  控除上限額" sub
                    hint={y0 ? `(${m(y0.taxableIncome)}×10%${y0.housingLoanDeductionRT > 0 ? `−HL${m(y0.housingLoanDeductionRT)}` : ""})×20%÷(90%−${y0.marginalRate}%×1.021)+2000=${m(y0.furusatoLimit)}` : "住民税所得割×20%÷(90%−税率×1.021)+2000"}
                    fn={per(yr => yr.furusatoLimit, yr => yr.spouseFurusatoLimit)} />
                  <R l="  実質控除額" sub
                    hint={y0 && y0.furusatoDeduction > 0 ? `¥${fmt(y0.furusatoDonation)}−2,000=¥${fmt(y0.furusatoDeduction)}` : "寄付額−自己負担2000円"}
                    fn={per(yr => yr.furusatoDeduction, yr => yr.spouseFurusatoDeduction)} />
                </>)}
                {yrs.some(yr => yr && (yr.housingLoanDeduction > 0 || yr.spouseHousingLoanDeduction > 0)) &&
                  <R l="住宅ローン控除効果" hint="所得税+住民税からの税額控除合計"
                    fn={per(yr => yr.housingLoanDeduction, yr => yr.spouseHousingLoanDeduction)} />}
                {yrs.some(yr => yr && yr.dependentDeduction > 0) &&
                  <R l="扶養控除効果" hint="控除額×(所得税率+住民税10%) ※世帯主に集約" fn={(yr, s) => {
                    if (s === "配偶者") return "-";
                    const rate = (yr.marginalRate + 10) / 100;
                    const effect = Math.round(yr.dependentDeduction * rate);
                    return effect > 0 ? effect : "-";
                  }} />}
                {yrs.some(yr => yr && yr.pensionLossAnnual > 0) &&
                  <R l="厚生年金減少" neg hint="DC自己負担月額×5.481/1000×12" fn={(yr, s) => s === "本人" ? yr.pensionLossAnnual : "-"} />}
              </>)}

              {/* ===== 退職金・相続 ===== */}
              {yrs.some(yr => yr && (yr.dcReceiveTax > 0 || yr.inheritanceTax > 0 || yr.inheritanceEstate > 0)) && <>
                <S bg="bg-orange-50">■ 退職金・相続</S>
                {yrs.some(yr => yr && yr.dcReceiveTax > 0) &&
                  <R l="DC受取時税金" neg bold hint="退職所得税: (DC−退職所得控除)×1/2に課税" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.dcReceiveTax > 0 ? yr.dcReceiveTax : "-") : "-"} />}
                {yrs.some(yr => yr && yr.inheritanceEstate > 0) &&
                  <R l="  課税遺産総額" sub hint="遺産−基礎控除(3000万+600万×法定相続人)" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.inheritanceEstate > 0 ? yr.inheritanceEstate : "-") : "-"} />}
                {yrs.some(yr => yr && yr.inheritanceTax > 0) &&
                  <R l="相続税" neg bold hint="法定相続分課税方式（配偶者軽減適用）" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.inheritanceTax > 0 ? yr.inheritanceTax : "-") : "-"} />}
              </>}

              {/* ===== 支出 ===== */}
              <S>■ 支出</S>
              <R l="基本生活費" hint="月額KF×12×インフレ率^経過年" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.baseLivingExpense : "-"} />
              {/* 保険料 */}
              {hasInsurance && yrs.some(yr => yr && yr.insurancePremiumTotal > 0) &&
                <R l="保険料" neg hint="月額×12。被保険者生存中のみ" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.insurancePremiumTotal : "-"} />}
              {/* DC拠出 */}
              {yrs.some(yr => yr && (yr.annualContribution > 0 || yr.spouseDCContribution > 0)) &&
                <R l="DC/iDeCo拠出" hint="(DC+iDeCo)×12" fn={(yr, s) => s === "本人" ? yr.annualContribution : s === "配偶者" ? yr.spouseDCContribution : yr.annualContribution + yr.spouseDCContribution} />}
              {costLabels.map(label => {
                const detail = (() => { for (const yr of yrs) { if (!yr) continue; const it = yr.eventCostBreakdown.find(c => c.label === label); if (it?.detail) return it.detail; } return undefined; })();
                return <R key={label} l={`  ${label}`} sub hint={detail} fn={(yr, s) => {
                  if (s === "配偶者") return "-";
                  const item = yr.eventCostBreakdown.find(c => c.label === label);
                  return item ? item.amount : 0;
                }} />;
              })}
              <R l="支出合計" bold hint="基本生活費+イベント(継続+一時)" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.totalExpense : "-"} />
              <R l="年間CF" bold bg="bg-blue-50" hint="手取り−支出合計" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.annualNetCashFlow : "-"} />

              {housingLabels.length > 0 && (<>
                <S bg="bg-blue-50">■ 住宅ローン</S>
                {housingLabels.map(label => {
                  const detail = (() => { for (const yr of yrs) { if (!yr) continue; const it = yr.eventCostBreakdown.find(c => c.label === label); if (it?.detail) return it.detail; if (it?.phaseLabel) return it.phaseLabel; } return undefined; })();
                  return <R key={`h_${label}`} l={label} sub hint={detail} fn={(yr, s) => {
                    if (s === "配偶者") return "-";
                    const item = yr.eventCostBreakdown.find(c => c.label === label);
                    return item ? item.amount : 0;
                  }} />;
                })}
              </>)}

              <S bg="bg-teal-100">■ 累積資産</S>
              <R l="DC資産" hint="毎年: 前年残高×(1+利回り)+年間拠出" fn={(yr, s) => {
                if (!hasSpouse) return Math.round(yr.cumulativeDCAsset);
                if (s === "本人") return Math.round(yr.selfDCAsset);
                if (s === "配偶者") return Math.round(yr.spouseDCAsset);
                return Math.round(yr.cumulativeDCAsset);
              }} />
              <R l="再投資" hint="節税メリット分を運用利回りで複利運用" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.cumulativeReinvest) : "-"} />
              {hasNISA ? (<>
                <R l="NISA(時価)" bold hint="非課税。生涯枠は簿価ベースで管理" fn={(yr, s) => {
                  if (!hasSpouse) return Math.round(yr.nisaAsset);
                  if (s === "本人") return Math.round(yr.selfNISAAsset);
                  if (s === "配偶者") return Math.round(yr.spouseNISAAsset);
                  return Math.round(yr.nisaAsset);
                }} />
                <R l="  元本(簿価)" sub hint="生涯枠判定に使用。売却で枠復活" fn={(yr, s) => {
                  if (!hasSpouse) return Math.round(yr.selfNISACostBasis + yr.spouseNISACostBasis);
                  if (s === "本人") return Math.round(yr.selfNISACostBasis);
                  if (s === "配偶者") return Math.round(yr.spouseNISACostBasis);
                  return Math.round(yr.selfNISACostBasis + yr.spouseNISACostBasis);
                }} />
                <R l="  含み益" sub hint="時価−簿価（非課税）" fn={(yr, s) => {
                  if (!hasSpouse) return Math.round(yr.nisaGain);
                  if (s === "本人") return Math.round(yr.selfNISAAsset - yr.selfNISACostBasis);
                  if (s === "配偶者") return Math.round(yr.spouseNISAAsset - yr.spouseNISACostBasis);
                  return Math.round(yr.nisaGain);
                }} />
                <R l="  積立(年間)" sub hint="余剰→NISA枠に自動配分" fn={(yr, s) => {
                  if (!hasSpouse) return yr.nisaContribution > 0 ? Math.round(yr.nisaContribution) : "-";
                  if (s === "本人") return yr.selfNISAContribution > 0 ? Math.round(yr.selfNISAContribution) : "-";
                  if (s === "配偶者") return yr.spouseNISAContribution > 0 ? Math.round(yr.spouseNISAContribution) : "-";
                  return yr.nisaContribution > 0 ? Math.round(yr.nisaContribution) : "-";
                }} />
                {yrs.some(yr => yr && yr.nisaWithdrawal > 0) &&
                  <R l="  取崩" sub hint="売却: 非課税。簿価分の枠が翌年復活" fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.nisaWithdrawal > 0 ? Math.round(-yr.nisaWithdrawal) : "-"} />}
                <R l="特定口座" bold hint="NISA枠超過分。利益に20.315%課税" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableAsset) : "-"} />
                <R l="  含み益" sub hint="評価額−取得原価" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableGain) : "-"} />
                <R l="  課税額" sub neg hint="含み益×20.315%(所得税15.315%+住民税5%)" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableGain * 0.20315) : "-"} />
                <R l="  積立(年間)" sub hint="NISA枠超過分を特定口座に自動配分" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.taxableContribution > 0 ? Math.round(yr.taxableContribution) : "-") : "-"} />
                {yrs.some(yr => yr && yr.taxableWithdrawal > 0) &&
                  <R l="  取崩" sub neg hint="売却時に含み益比率で課税" fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.taxableWithdrawal > 0 ? Math.round(-yr.taxableWithdrawal) : "-"} />}
                <R l="現金" hint="生活防衛資金(月額×N月)を維持" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.cashSavings) : "-"} />
              </>) : (
                <R l="貯蓄" hint="前年残高×(1+利回り)+年間CF" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(Math.max(yr.cumulativeSavings, 0)) : "-"} />
              )}
              {yrs.some(yr => yr && yr.loanBalance > 0) && <R l="ローン残高" neg hint="元利/元金均等の残高計算" fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.loanBalance > 0 ? -yr.loanBalance : "-"} />}
              <R l="総資産" bold bg="bg-teal-50" hint="DC+再投資+NISA+特定(税引後)+現金" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.totalWealth) : "-"} />
            </tbody>
          </table>
  );
}
