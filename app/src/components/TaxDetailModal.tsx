import React from "react";
import { fmt } from "../lib/format";
import type { ScenarioResult, BaseResult, YearResult } from "../lib/types";

const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#7c3aed"];

export function TaxDetailModal({ isOpen, onClose, age, results, base, sirPct }: {
  isOpen: boolean; onClose: () => void; age: number | null;
  results: ScenarioResult[]; base: BaseResult; sirPct: number;
}) {
  if (!isOpen || age == null) return null;

  const yrs = results.map(r => r.yearResults.find(yr => yr.age === age));
  const hasSpouse = results.some(r => r.scenario.spouse?.enabled) || yrs.some(yr => yr && yr.spousePensionIncome > 0);
  const hasNISA = yrs.some(yr => yr && (yr.nisaAsset > 0 || yr.taxableAsset > 0));
  const hasInsurance = yrs.some(yr => yr && (yr.insurancePremiumTotal > 0 || yr.insurancePayoutTotal > 0));

  const subCols = hasSpouse ? ["本人", "配偶者", "世帯"] as const : ["本人"] as const;
  const subCount = subCols.length;
  // +2: 項目列 + ヒント列
  const totalCols = 2 + results.length * subCount;

  type ValFn = (yr: YearResult, sub: "本人" | "配偶者" | "世帯") => any;

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
            className={`${borderL} ${borderR} border-y border-gray-200 px-1.5 py-0.5 text-right text-[11px] tabular-nums ${bgCol} ${neg && typeof v === "number" && v > 0 ? "text-red-600" : ""} ${bold ? "font-bold" : ""}`}>
            {typeof v === "string" ? v : `¥${fmt(v)}`}
          </td>
        );
      }
    }
    return out;
  };

  // R: 項目行。hint= ヒントテキスト（右列に表示、狭い画面では下に）
  const R = ({ l, fn, bold, bg, sub: isSub, neg, hint }: {
    l: string; fn: ValFn; bold?: boolean; bg?: string; sub?: boolean; neg?: boolean; hint?: string;
  }) => (
    <tr className={bg || ""}>
      <td className={`border-y border-gray-200 border-r border-r-gray-200 px-1.5 py-0.5 text-[11px] ${isSub ? "pl-3 text-gray-500" : ""} ${bold ? "font-bold" : ""}`}>
        <span>{l}</span>
        {/* 狭い画面用: 項目の下にヒント */}
        {hint && <span className="block xl:hidden text-[9px] font-normal text-gray-400 whitespace-normal leading-tight mt-0.5">{hint}</span>}
      </td>
      {/* 広い画面用: ヒント専用列 */}
      <td className="hidden xl:table-cell border-y border-gray-200 border-r-2 border-r-gray-500 px-1 py-0.5 text-[9px] text-gray-400 whitespace-normal max-w-[200px] leading-tight">
        {hint || ""}
      </td>
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-2 pt-4" onClick={onClose}>
      <div className="max-w-[98vw] rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-2">
          <p className="text-sm font-bold">{age}歳時点の詳細</p>
          <button onClick={onClose} className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100">閉じる</button>
        </div>
        <div className="max-h-[85vh] overflow-auto p-2">
          <table className="border-collapse text-[11px] leading-tight whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr>
                <th rowSpan={2} className="bg-gray-300 border-2 border-gray-500 px-2 py-1 text-left min-w-[100px]">項目</th>
                <th rowSpan={2} className="hidden xl:table-cell bg-gray-300 border-2 border-gray-500 px-1 py-1 text-left min-w-[140px] text-[10px] text-gray-600">計算式・根拠</th>
                {results.map((r, si) => (
                  <th key={si} colSpan={subCount}
                    className="border-2 border-gray-500 px-2 py-1 text-center text-xs"
                    style={{ backgroundColor: `${COLORS[si]}15`, color: COLORS[si] }}>
                    {r.scenario.name}
                  </th>
                ))}
              </tr>
              <tr>
                {results.map((_, si) =>
                  subCols.map((sub, ci) => (
                    <th key={`${si}-${ci}`}
                      className={`bg-gray-100 px-1.5 py-0.5 text-center min-w-[80px] text-[10px] border-y-2 border-gray-500 ${ci === 0 ? "border-l-2 border-l-gray-500" : "border-l border-l-gray-200"} ${ci === subCols.length - 1 ? "border-r-2 border-r-gray-500" : ""} ${sub === "世帯" ? "bg-amber-50" : ""}`}>
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
              {/* 就労所得 */}
              {yrs.some(yr => yr && (yr.gross > 0 || yr.spouseGross > 0)) && (<>
                <R l="給与収入" bold hint="キーフレーム×昇給率" fn={(yr, s) => s === "本人" ? `${Math.round(yr.grossMan)}万` : s === "配偶者" ? (yr.spouseGross > 0 ? `${Math.round(yr.spouseGross / 10000)}万` : "-") : `${Math.round(yr.grossMan + yr.spouseGross / 10000)}万`} />
                <R l="  所得税" sub hint="累進税率(5-45%)" fn={(yr, s) => s === "本人" ? yr.incomeTax : s === "配偶者" ? yr.spouseIncomeTax : yr.incomeTax + yr.spouseIncomeTax} />
                <R l="  住民税" sub hint="課税所得×10%" fn={(yr, s) => s === "本人" ? yr.residentTax : s === "配偶者" ? yr.spouseResidentTax : yr.residentTax + yr.spouseResidentTax} />
                <R l="  社会保険" sub hint={`年収×${sirPct}%`} fn={(yr, s) => s === "本人" ? yr.socialInsurance : s === "配偶者" ? yr.spouseSocialInsurance : yr.socialInsurance + yr.spouseSocialInsurance} />
              </>)}
              {/* 老齢年金 */}
              {yrs.some(yr => yr && (yr.selfPensionIncome > 0 || yr.spousePensionIncome > 0)) && (<>
                <R l="老齢年金" bold hint="基礎+厚生。平均年収×加入年数から自動計算" fn={(yr, s) => {
                  if (!hasSpouse) return (yr.selfPensionIncome + yr.spousePensionIncome) || "-";
                  if (s === "本人") return yr.selfPensionIncome || "-";
                  if (s === "配偶者") return yr.spousePensionIncome || "-";
                  return (yr.selfPensionIncome + yr.spousePensionIncome) || "-";
                }} />
                <R l="  年金課税" sub neg hint="公的年金等控除後の所得税+住民税" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.pensionTax > 0 ? yr.pensionTax : "-") : "-"} />
              </>)}
              {/* 遺族年金・保険金（死亡後） */}
              {yrs.some(yr => yr && yr.survivorIncome > 0) &&
                <R l="遺族年金・保険" bold hint="遺族基礎+厚生年金+収入保障保険" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.survivorIncome > 0 ? yr.survivorIncome : "-") : "-"} />}
              {yrs.some(yr => yr && yr.insurancePayoutTotal > 0) &&
                <R l="  保険金(イベント)" sub hint="保険イベントからの一時金or月額給付" fn={(yr, s) => (s === "世帯" || !hasSpouse) ? (yr.insurancePayoutTotal > 0 ? yr.insurancePayoutTotal : "-") : "-"} />}
              {/* 児童手当 */}
              {yrs.some(yr => yr && yr.childAllowance > 0) &&
                <R l="児童手当" hint="0-2歳:1.5万/月 3-18歳:1万/月 第3子以降:3万/月" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.childAllowance : "-"} />}
              {/* DC節税 */}
              {yrs.some(yr => yr && yr.annualBenefit > 0) &&
                <R l="DC節税メリット" hint="所得税+住民税+社保の節税合計" fn={(yr, s) => {
                  const sp = yr.spouseIncomeTaxSaving + yr.spouseResidentTaxSaving;
                  return s === "本人" ? yr.annualBenefit : s === "配偶者" ? sp : yr.annualBenefit + sp;
                }} />}
              {/* ふるさと納税 */}
              {results.some(r => r.hasFuru) && yrs.some(yr => yr && yr.furusatoDonation > 0) &&
                <R l="ふるさと納税" hint="住民税所得割×20%÷(90%-税率×1.021)+2000" fn={(yr, s) => s === "本人" ? yr.furusatoDonation : s === "配偶者" ? yr.spouseFurusatoDonation : yr.furusatoDonation + yr.spouseFurusatoDonation} />}
              {/* 手取り合計 */}
              <R l="手取り合計" bold bg="bg-emerald-100" hint="給与+年金−税・社保−DC+手当+保険" fn={(yr, s) => {
                return s === "本人" ? Math.round(yr.takeHomePay - yr.spouseTakeHome) : s === "配偶者" ? Math.round(yr.spouseTakeHome) : Math.round(yr.takeHomePay);
              }} />

              {/* ===== 支出 ===== */}
              <S>■ 支出</S>
              <R l="基本生活費" hint="月額KF×12×インフレ率^経過年" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.baseLivingExpense : "-"} />
              {/* 保険料 */}
              {hasInsurance && yrs.some(yr => yr && yr.insurancePremiumTotal > 0) &&
                <R l="保険料" neg hint="月額×12。被保険者生存中のみ" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.insurancePremiumTotal : "-"} />}
              {/* DC拠出 */}
              {yrs.some(yr => yr && (yr.annualContribution > 0 || yr.spouseDCContribution > 0)) &&
                <R l="DC/iDeCo拠出" hint="(DC+iDeCo)×12" fn={(yr, s) => s === "本人" ? yr.annualContribution : s === "配偶者" ? yr.spouseDCContribution : yr.annualContribution + yr.spouseDCContribution} />}

              <S>■ 支出</S>
              <R l="基本生活費" hint="月額KF×12×インフレ率^経過年" fn={(yr, s) => s === "世帯" || !hasSpouse ? yr.baseLivingExpense : "-"} />
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
                <R l="NISA(時価)" hint="非課税。生涯枠は簿価ベースで管理" fn={(yr, s) => {
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
                {yrs.some(yr => yr && yr.nisaContribution > 0) && <R l="  投入" sub hint="余剰→NISA枠に自動配分(簿価加算)" fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.nisaContribution > 0 ? Math.round(yr.nisaContribution) : "-"} />}
                {yrs.some(yr => yr && yr.nisaWithdrawal > 0) && <R l="  取崩" sub hint="売却: 非課税。簿価分の枠が翌年復活" fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.nisaWithdrawal > 0 ? `▲${Math.round(yr.nisaWithdrawal).toLocaleString()}` : "-"} />}
                <R l="特定口座" hint="NISA枠超過分。利益に20.315%課税" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableAsset) : "-"} />
                <R l="  含み益" sub hint="評価額−取得原価" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableGain) : "-"} />
                <R l="  課税額" sub neg hint="含み益×20.315%(所得税15.315%+住民税5%)" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.taxableGain * 0.20315) : "-"} />
                {yrs.some(yr => yr && yr.taxableWithdrawal > 0) && <R l="  取崩" sub hint="売却時に含み益比率で課税" fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.taxableWithdrawal > 0 ? `▲${Math.round(yr.taxableWithdrawal).toLocaleString()}` : "-"} />}
                <R l="現金" hint="生活防衛資金(月額×N月)を維持" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.cashSavings) : "-"} />
              </>) : (
                <R l="貯蓄" hint="前年残高×(1+利回り)+年間CF" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(Math.max(yr.cumulativeSavings, 0)) : "-"} />
              )}
              {yrs.some(yr => yr && yr.loanBalance > 0) && <R l="ローン残高" neg hint="元利/元金均等の残高計算" fn={(yr, s) => (s === "世帯" || !hasSpouse) && yr.loanBalance > 0 ? -yr.loanBalance : "-"} />}
              <R l="総資産" bold bg="bg-teal-50" hint="DC+再投資+NISA+特定(税引後)+現金" fn={(yr, s) => s === "世帯" || !hasSpouse ? Math.round(yr.totalWealth) : "-"} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
