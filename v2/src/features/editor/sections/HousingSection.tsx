import { useMemo, useState } from "react";
import { Plus, Trash2, Home, Building2, Pencil } from "lucide-react";
import { defaultHousingPhase, type HousingPhase, type Plan } from "@/domain/model";
import { useActivePlan } from "@/state/store";
import { Card, NumField, Segmented, Row, Toggle, Collapsible, Pill, Modal, cx } from "@/ui/primitives";
import { MiniStackedBars, MiniLine } from "@/charts/Mini";
import { buildLoanSchedule } from "@/engine/mortgage";
import { HOUSING_LOAN_DEDUCTION, HOUSING_LOAN_DEDUCTION_RATE, MAN } from "@/engine/constants";
import { fmtMan, fmtYen } from "@/lib/format";
import { SectionTitle, LinkedSection } from "../Editor";

export function HousingSection() {
  const { plan, update } = useActivePlan();
  const [editing, setEditing] = useState<string | null>(null);
  const phases = [...plan.housing].sort((a, b) => a.startAge - b.startAge);
  const addPhase = (kind: "rent" | "own") => {
    const last = phases[phases.length - 1];
    const start = Math.min((last?.startAge ?? plan.self.age) + 5, plan.endAge - 1);
    const ph = defaultHousingPhase(start, kind);
    update(d => { d.housing.push(ph); });
    setEditing(ph.id);
  };
  const target = editing ? phases.find(h => h.id === editing) ?? null : null;
  return (
    <>
      <SectionTitle title="住まい" desc="賃貸・購入のフェーズを時系列で並べます。次のフェーズが始まる年に持ち家は売却されます。" />
      <LinkedSection group="housing">
        <Timeline phases={phases} plan={plan} onSelect={setEditing} />
        {phases.map((h, i) => (
          <PhaseSummary key={h.id} h={h} index={i} end={phases[i + 1]?.startAge ?? plan.endAge}
            onEdit={() => setEditing(h.id)}
            onRemove={phases.length > 1 ? () => update(d => { d.housing = d.housing.filter(x => x.id !== h.id); }) : undefined} />
        ))}
        <div className="flex gap-2">
          <button className="btn btn-outline flex-1" onClick={() => addPhase("rent")}><Building2 size={15} />賃貸を追加</button>
          <button className="btn btn-outline flex-1" onClick={() => addPhase("own")}><Home size={15} />購入を追加</button>
        </div>
      </LinkedSection>
      <Modal open={!!target} onClose={() => setEditing(null)} width="max-w-5xl"
        title={target ? <span className="inline-flex items-center gap-2">{target.kind === "own" ? <Home size={16} /> : <Building2 size={16} />}住まいを編集：{phases.indexOf(target) === 0 ? "現在" : `${target.startAge}歳から`}</span> : ""}
        footer={<button className="btn btn-primary" onClick={() => setEditing(null)}>完了</button>}>
        {target && <PhaseEditor h={target} index={phases.indexOf(target)} end={phases[phases.indexOf(target) + 1]?.startAge ?? plan.endAge} plan={plan}
          onChange={fn => update(d => { const t = d.housing.find(x => x.id === target.id); if (t) fn(t); })} />}
      </Modal>
    </>
  );
}

function Timeline({ phases, plan, onSelect }: { phases: HousingPhase[]; plan: Plan; onSelect: (id: string) => void }) {
  return (
    <div className="card p-3">
      <div className="flex h-9 rounded-lg overflow-hidden gap-px">
        {phases.map((h, i) => {
          const end = phases[i + 1]?.startAge ?? plan.endAge;
          return (
            <button key={h.id} onClick={() => onSelect(h.id)} className="flex items-center justify-center gap-1 text-[11px] font-medium px-1 truncate hover:brightness-110 focus-ring" title={`${h.startAge}〜${end}歳（クリックで編集）`}
              style={{ flex: Math.max(end - h.startAge, 1), background: h.kind === "own" ? "var(--s-home-chip)" : "var(--s-cash-chip)", color: "#fff" }}>
              {h.kind === "own" ? <Home size={12} /> : <Building2 size={12} />}
              {end - h.startAge >= 8 && <span>{h.kind === "own" ? "持ち家" : "賃貸"} {h.startAge}〜{end}歳</span>}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between hint mt-1"><span>{Math.min(plan.self.age, phases[0]?.startAge ?? plan.self.age)}歳</span><span>クリックで編集</span><span>{plan.endAge}歳</span></div>
    </div>
  );
}

function PhaseSummary({ h, index, end, onEdit, onRemove }: { h: HousingPhase; index: number; end: number; onEdit: () => void; onRemove?: () => void }) {
  const p = h.property;
  const monthly = h.kind === "own" ? buildLoanSchedule(p, h.startAge, h.startAge + p.loanYears + 1).firstYearMonthly : h.rentMonthly * MAN;
  return (
    <div className="card p-3 flex items-start gap-3">
      <div className="grid place-items-center h-9 w-9 rounded-lg shrink-0" style={{ background: h.kind === "own" ? "var(--s-home-chip)" : "var(--s-cash-chip)", color: "#fff" }}>{h.kind === "own" ? <Home size={16} /> : <Building2 size={16} />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2"><span className="text-sm font-semibold ink">{h.kind === "own" ? "持ち家" : "賃貸"}</span><span className="hint">{index === 0 ? "現在" : `${h.startAge}歳`}〜{end}歳（{end - h.startAge}年）</span></div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {h.kind === "own" ? (<>
            <Pill>{p.price.toLocaleString()}万・頭金 {p.downPayment.toLocaleString()}万</Pill>
            <Pill>{p.rate.kind === "fixed" ? `固定 ${p.rate.pct}%` : `変動 ${p.rate.initialPct}→${p.rate.laterPct}%`}・{p.loanYears}年</Pill>
            <Pill>返済 月 {fmtYen(monthly)}</Pill>
            {p.loanShareSelfPct < 100 && <Pill>ペア {p.loanShareSelfPct}:{100 - p.loanShareSelfPct}</Pill>}
          </>) : (<>
            <Pill>家賃 {h.rentMonthly}万/月</Pill>
            {h.movingCost > 0 && <Pill>初期費用 {h.movingCost}万</Pill>}
          </>)}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} aria-label={`${h.kind === "own" ? "持ち家" : "賃貸"}（${index === 0 ? "現在" : `${h.startAge}歳`}〜）の詳細を編集`} title="金額・ローン・維持費・売却などをまとめて編集" className="btn btn-outline text-xs px-2 py-1"><Pencil size={13} />編集</button>
        {onRemove && <button onClick={onRemove} className="btn btn-ghost px-1.5 hover:text-[var(--critical)]" aria-label={`${h.kind === "own" ? "持ち家" : "賃貸"}（${h.startAge}歳〜）を削除`}><Trash2 size={14} /></button>}
      </div>
    </div>
  );
}

/** モーダル本体: 左にフォーム、右にプレビュー */
function PhaseEditor({ h, index, end, plan, onChange }: { h: HousingPhase; index: number; end: number; plan: Plan; onChange: (fn: (h: HousingPhase) => void) => void }) {
  const p = h.property;
  const loan = p.price - p.downPayment;
  const infl = plan.economy.inflationPct / 100;
  const preview = useMemo(() => {
    const ages: number[] = []; for (let a = h.startAge; a < end; a++) ages.push(a);
    const inflAt = (a: number) => Math.pow(1 + infl, a - plan.self.age);
    if (h.kind === "rent") {
      const rent = ages.map(a => h.rentMonthly * 12 * MAN * inflAt(a));
      const initial = ages.map(a => (a === h.startAge ? h.movingCost * MAN * inflAt(a) : 0));
      return { ages, series: [{ label: "家賃", color: "var(--s-cash)", values: rent }, { label: "初期費用", color: "var(--ink-3)", values: initial }], balance: null as number[] | null, total: rent.reduce((x, y) => x + y, 0) + initial.reduce((x, y) => x + y, 0), sched: null };
    }
    const sched = buildLoanSchedule(p, h.startAge, plan.endAge);
    const yearAt = (a: number) => sched.years.find(y => y.age === a);
    const principal = ages.map(a => yearAt(a)?.principal ?? 0);
    const interest = ages.map(a => yearAt(a)?.interest ?? 0);
    const pre = ages.map(a => yearAt(a)?.prepayment ?? 0);
    const maint = ages.map(a => (p.maintenanceMonthly * 12 + p.propertyTaxAnnual) * MAN * inflAt(a));
    const down = ages.map(a => (a === h.startAge ? (p.downPayment + p.price * p.closingCostPct / 100 + h.movingCost) * MAN : 0));
    const ded = HOUSING_LOAN_DEDUCTION[p.deduction];
    const deduction = ages.map(a => { const y = yearAt(a); const yi = a - h.startAge; return ded && y && yi < ded.years ? -Math.min(y.closingBalance, ded.cap) * HOUSING_LOAN_DEDUCTION_RATE : 0; });
    const balance = ages.map(a => yearAt(a)?.closingBalance ?? 0);
    const series = [
      { label: "頭金・諸費用", color: "var(--ink-3)", values: down },
      { label: "返済（元本）", color: "var(--s-home)", values: principal },
      { label: "返済（利息）", color: "var(--s-loan)", values: interest },
      { label: "繰上返済", color: "#9085e9", values: pre },
      { label: "管理費・税", color: "var(--s-dc)", values: maint },
      { label: "ローン控除", color: "var(--s-nisa)", values: deduction },
    ];
    const total = series.reduce((x, s) => x + s.values.reduce((a, b) => a + b, 0), 0);
    return { ages, series, balance, total, sched };
  }, [h, p, end, infl, plan.self.age, plan.endAge]);

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* ── フォーム ── */}
      <div className="space-y-4">
        <div>
          <span className="label block mb-1">種類</span>
          <Segmented value={h.kind} onChange={v => onChange(x => { x.kind = v; if (v === "own" && x.movingCost === 50) x.movingCost = 0; })} options={[{ value: "rent", label: "賃貸" }, { value: "own", label: "購入（持ち家）" }]} />
        </div>
        <Row>
          {index > 0 && <NumField label="開始年齢" value={h.startAge} unit="歳" min={plan.self.age + 1} max={plan.endAge} onChange={v => onChange(x => { x.startAge = v; })} help="このフェーズに切り替わる本人の年齢。前のフェーズが持ち家なら、この年に自動で売却します。" />}
          {h.kind === "rent" && <NumField label="家賃（管理費込み）" value={h.rentMonthly} unit="万円/月" step={0.5} min={0} onChange={v => onChange(x => { x.rentMonthly = v; })} help="共益費・駐車場込みの月額。更新料は「イベント」で数年ごとの支出として追加できます。" />}
          <NumField label={h.kind === "rent" ? "引越し・敷金礼金" : "引越し費用"} value={h.movingCost} unit="万円" step={10} min={0} onChange={v => onChange(x => { x.movingCost = v; })} help="このフェーズが始まる年に一度だけかかる費用。最初のフェーズ（現在の住まい）では計上しません。" />
        </Row>
        {h.kind === "own" && (
          <>
            <Row>
              <NumField label="物件価格" value={p.price} unit="万円" step={100} min={0} onChange={v => onChange(x => { x.property.price = v; })} help="土地・建物の税込価格。諸費用は下の欄で別に指定します。" />
              <NumField label="頭金" value={p.downPayment} unit="万円" step={50} min={0} max={p.price} onChange={v => onChange(x => { x.property.downPayment = v; })} help="購入年に現金から支払う額。借入額 = 物件価格 − 頭金。" />
              <NumField label="諸費用" value={p.closingCostPct} unit="%" step={0.5} min={0} max={15} onChange={v => onChange(x => { x.property.closingCostPct = v; })} help="仲介手数料・登記・ローン手数料・火災保険など。新築 3〜5%、中古 6〜9% が目安。" />
              <NumField label="返済期間" value={p.loanYears} unit="年" min={1} max={50} onChange={v => onChange(x => { x.property.loanYears = v; })} help="借入から完済までの年数。購入年齢 + この年数 が完済予定年齢です。" />
            </Row>
            <Row>
              <div><span className="label block mb-1">返済方式</span><Segmented size="sm" value={p.repayment} onChange={v => onChange(x => { x.property.repayment = v; })} options={[{ value: "annuity", label: "元利均等" }, { value: "principal", label: "元金均等" }]} /></div>
              <div><span className="label block mb-1">金利タイプ</span><Segmented size="sm" value={p.rate.kind} onChange={v => onChange(x => { x.property.rate = v === "fixed" ? { kind: "fixed", pct: 1.8 } : { kind: "variable", initialPct: 0.6, laterPct: 1.6, changeAfterYears: 10 }; })} options={[{ value: "variable", label: "変動" }, { value: "fixed", label: "固定" }]} /></div>
            </Row>
            {p.rate.kind === "fixed" ? (
              <Row><NumField label="金利" value={p.rate.pct} unit="%" step={0.1} min={0} max={10} onChange={v => onChange(x => { if (x.property.rate.kind === "fixed") x.property.rate.pct = v; })} help="全期間固定の年利。" /></Row>
            ) : (
              <Row className="grid-cols-3">
                <NumField label="当初金利" value={p.rate.initialPct} unit="%" step={0.1} min={0} max={10} onChange={v => onChange(x => { if (x.property.rate.kind === "variable") x.property.rate.initialPct = v; })} help="変動金利の当初適用金利。下の年数が過ぎると「上昇後」に切り替わります。" />
                <NumField label="上昇後" value={p.rate.laterPct} unit="%" step={0.1} min={0} max={10} onChange={v => onChange(x => { if (x.property.rate.kind === "variable") x.property.rate.laterPct = v; })} help="将来の金利上昇を保守的に見込むためのストレス値。" />
                <NumField label="上昇まで" value={p.rate.changeAfterYears} unit="年" min={0} max={40} onChange={v => onChange(x => { if (x.property.rate.kind === "variable") x.property.rate.changeAfterYears = v; })} help="当初金利が続く年数。借入から数えます。" />
              </Row>
            )}
            <Row className="grid-cols-3">
              <NumField label="管理費・修繕" value={p.maintenanceMonthly} unit="万円/月" step={0.5} min={0} onChange={v => onChange(x => { x.property.maintenanceMonthly = v; })} help="マンションは管理費＋修繕積立金。戸建ては修繕費の積立目安（1〜1.5万/月）。" />
              <NumField label="固定資産税" value={p.propertyTaxAnnual} unit="万円/年" step={1} min={0} onChange={v => onChange(x => { x.property.propertyTaxAnnual = v; })} help="固定資産税・都市計画税の年額。新築の軽減が切れたあとの平均的な額を入れてください。" />
              <NumField label="地震保険料" value={p.earthquakePremiumAnnual} unit="万円/年" step={0.5} min={0} onChange={v => onChange(x => { x.property.earthquakePremiumAnnual = v; })} help="火災保険とセットの地震保険。支出に計上し、地震保険料控除（所得税 上限 5 万・住民税 上限 2.5 万）を本人に適用します。" />
              <NumField label="資産価値の変動" value={p.appreciationPct} unit="%/年" step={0.5} min={-10} max={10} onChange={v => onChange(x => { x.property.appreciationPct = v; })} help="純資産に計上する時価と売却価格の計算に使います。" />
            </Row>
            <div>
              <span className="label block mb-1">住宅ローン控除</span>
              <Segmented size="sm" wrap value={p.deduction} onChange={v => onChange(x => { x.property.deduction = v; })} options={[
                { value: "certified", label: "認定住宅", title: "長期優良・低炭素: 13年・借入上限4,500万" }, { value: "zeh", label: "ZEH", title: "13年・3,500万" }, { value: "energy", label: "省エネ基準", title: "13年・3,000万" },
                { value: "existing", label: "中古", title: "10年・2,000万" }, { value: "none", label: "なし" }]} />
              <p className="hint mt-1">年末残高の 0.7% を所得税（＋住民税 最大 9.75 万）から控除。子育て・若者夫婦世帯の上乗せは含みません。</p>
            </div>
            <Collapsible title="ペアローン・団信・売却・繰上返済・借換" summary={[p.loanShareSelfPct < 100 && `ペア ${p.loanShareSelfPct}:${100 - p.loanShareSelfPct}`, p.danshin && "団信あり", p.prepayments.length > 0 && `繰上 ${p.prepayments.length}件`, p.refinance && "借換"].filter(Boolean).join("・") || "詳細設定"}>
              <div className="space-y-3">
                <Row>
                  <NumField label="本人の借入割合" value={p.loanShareSelfPct} unit="%" step={10} min={0} max={100} onChange={v => onChange(x => { x.property.loanShareSelfPct = v; })} help="100% で単独ローン。ペアローン・連帯債務なら分担割合。住宅ローン控除・団信も割合で配分。" />
                  <div className="flex items-end pb-1"><Toggle checked={p.danshin} onChange={v => onChange(x => { x.property.danshin = v; })} label="団体信用生命保険" help="加入者が亡くなると、その人の借入分が免除されます。" /></div>
                </Row>
                <div className="flex items-center gap-3">
                  <Toggle checked={p.salePrice != null} onChange={v => onChange(x => { x.property.salePrice = v ? x.property.price : null; })} label="売却価格を指定" help="未指定なら価格×資産価値の変動率で自動計算。次のフェーズが始まる年に売却します。" />
                  {p.salePrice != null && <NumField value={p.salePrice} unit="万円" step={100} min={0} onChange={v => onChange(x => { x.property.salePrice = v; })} size="sm" className="w-40" />}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1"><span className="label">繰上返済</span><button className="btn btn-ghost text-xs px-2 py-0.5" onClick={() => onChange(x => { x.property.prepayments.push({ age: h.startAge + 10, amount: 300, mode: "shorten" }); })}><Plus size={13} />追加</button></div>
                  {p.prepayments.length === 0 && <p className="hint">なし</p>}
                  <div className="space-y-1.5">
                    {p.prepayments.map((pp, i) => (
                      <div key={i} className="flex items-center gap-1.5 flex-wrap">
                        <NumField value={pp.age} unit="歳" min={h.startAge} max={h.startAge + p.loanYears} size="sm" className="w-24" onChange={v => onChange(x => { x.property.prepayments[i].age = v; })} />
                        <NumField value={pp.amount} unit="万円" step={50} min={0} size="sm" className="w-32" onChange={v => onChange(x => { x.property.prepayments[i].amount = v; })} />
                        <Segmented size="sm" value={pp.mode} onChange={v => onChange(x => { x.property.prepayments[i].mode = v; })} options={[{ value: "shorten", label: "期間短縮" }, { value: "reduce", label: "返済額軽減" }]} />
                        <button className="btn btn-ghost px-1.5 py-1" onClick={() => onChange(x => { x.property.prepayments.splice(i, 1); })} aria-label="削除"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Toggle checked={!!p.refinance} onChange={v => onChange(x => { x.property.refinance = v ? { age: h.startAge + 10, pct: 1.0, years: Math.max(p.loanYears - 10, 10), cost: 60 } : null; })} label="借り換え" help="途中でより低い金利に組み直します。実行年に残債を新しい金利・期間で計算し直します。" />
                  {p.refinance && (
                    <Row className="mt-2 grid-cols-4">
                      <NumField label="時期" value={p.refinance.age} unit="歳" min={h.startAge + 1} onChange={v => onChange(x => { x.property.refinance!.age = v; })} help="借り換えを実行する本人の年齢。この年に残債を新しい金利・期間で組み直します。" />
                      <NumField label="新金利" value={p.refinance.pct} unit="%" step={0.1} min={0} onChange={v => onChange(x => { x.property.refinance!.pct = v; })} help="借り換え後の年利（全期間固定として計算）。" />
                      <NumField label="新期間" value={p.refinance.years} unit="年" min={1} max={40} onChange={v => onChange(x => { x.property.refinance!.years = v; })} help="借り換え後の残りの返済年数。" />
                      <NumField label="諸費用" value={p.refinance.cost} unit="万円" step={10} min={0} onChange={v => onChange(x => { x.property.refinance!.cost = v; })} help="借り換えの事務手数料・登記費用など。実行年に一時支出として計上します。" />
                    </Row>
                  )}
                </div>
              </div>
            </Collapsible>
          </>
        )}
      </div>

      {/* ── プレビュー ── */}
      <div className="space-y-3 lg:sticky lg:top-0 self-start">
        <div className="text-xs font-semibold ink-2 uppercase tracking-wider">プレビュー（{h.startAge}〜{end}歳）</div>
        {h.kind === "own" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <Kpi label="借入額" value={`${loan.toLocaleString()}万`} />
            <Kpi label={`月々の返済${p.rate.kind === "variable" ? "（当初）" : ""}`} value={fmtYen(preview.sched?.firstYearMonthly ?? 0)} />
            <Kpi label="総利息" value={fmtMan(preview.sched?.totalInterest ?? 0)} />
            <Kpi label="完済" value={preview.sched?.payoffAge != null ? `${preview.sched.payoffAge}歳` : "期間内に完済せず"} tone={preview.sched?.payoffAge != null && preview.sched.payoffAge > plan.self.retireAge ? "warning" : undefined} />
            <Kpi label="初期費用（頭金＋諸費用）" value={`${(p.downPayment + p.price * p.closingCostPct / 100).toLocaleString()}万`} />
            <Kpi label="控除の総額" value={fmtMan(-preview.series.find(s => s.label === "ローン控除")!.values.reduce((a, b) => a + b, 0))} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Kpi label="月額（現在の物価）" value={`${h.rentMonthly}万`} />
            <Kpi label={`この期間の家賃合計（${end - h.startAge}年）`} value={fmtMan(preview.total)} />
          </div>
        )}
        <Card title="年間の住居費" subtitle={h.kind === "own" ? "返済・維持費・控除（インフレ込み、名目）" : "家賃（インフレ込み、名目）"}>
          <div><MiniStackedBars ages={preview.ages} series={preview.series} height={190} /></div>
        </Card>
        {preview.balance && (
          <Card title="ローン残高" subtitle={`この期間の住居費合計 ${fmtMan(preview.total)}（控除差引後）`}>
            <MiniLine ages={preview.ages} values={preview.balance} color="var(--s-loan)" height={110} label="残高" />
          </Card>
        )}
        {h.kind === "own" && preview.sched?.years.some(y => y.events.length) && (
          <ul className="hint space-y-0.5">{preview.sched.years.filter(y => y.events.length).slice(0, 6).map(y => <li key={y.age}>{y.age}歳: {y.events.join("・")}</li>)}</ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return <div className="rounded-lg surface-2 px-2.5 py-2"><div className="ink-3">{label}</div><div className={cx("font-semibold tabular mt-0.5 text-sm", tone === "warning" ? "text-[var(--warning)]" : "ink")}>{value}</div></div>;
}
