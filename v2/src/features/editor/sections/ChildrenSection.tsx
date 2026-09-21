import { useMemo, useState } from "react";
import { Plus, Trash2, Baby, Pencil, Users } from "lucide-react";
import { defaultChild, defaultEducation, STAGE_ORDER, type Child, type StageKey, type Plan, type EducationStage } from "@/domain/model";
import { useActivePlan } from "@/state/store";
import { Card, NumField, Segmented, Row, Toggle, Pill, EmptyState, Modal, TextField, cx } from "@/ui/primitives";
import { MiniStackedBars } from "@/charts/Mini";
import { STAGE_TABLE, AWAY_COST, ADMISSION_EXTRA, totalEducationCost, stageAnnualCost, childCostAt } from "@/engine/education";
import { MAN } from "@/engine/constants";
import { fmtMan } from "@/lib/format";
import { SectionTitle, LinkedSection } from "../Editor";

const PRESETS: { key: "public" | "privateUniv" | "private"; label: string }[] = [
  { key: "public", label: "すべて公立" }, { key: "privateUniv", label: "大学だけ私立" }, { key: "private", label: "幼稚園から私立" },
];
/** 子どもの識別色。隣どうしが色覚異常でも見分けられる並びにしてある（青→橙→緑→紫→黄→桃）。
 *  上に載せる Baby アイコンは、どの色でも 3:1 を満たす濃色（--on-fill-soft）で統一。 */
const CHILD_COLORS = ["var(--s-cash)", "var(--s-taxable)", "var(--s-nisa)", "var(--s-home)", "var(--s-dc)", "var(--s-alt)"];

export function pathSummary(c: Child): string {
  return STAGE_ORDER.filter(k => c.education[k].enabled).map(k => `${STAGE_TABLE[k].label}${c.education[k].kind === "private" ? "(私)" : ""}`).join("→") || "進学なし";
}

export function ChildrenSection() {
  const { plan, update } = useActivePlan();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<string | "all">("all");
  const cc = plan.childrenCommon;
  const add = () => update(d => {
    const last = d.children[d.children.length - 1];
    d.children.push(defaultChild(d.children.length, last ? last.birthAge + 3 : d.self.age + 1));
  });
  const openFor = (id: string | "all") => { setFocus(id); setOpen(true); };
  return (
    <>
      <SectionTitle title="子ども" desc="出生時の本人年齢と進路を設定。教育費・養育費・児童手当・高校就学支援金・多子世帯の大学無償化・扶養控除・育休を自動反映します。" />
      <LinkedSection group="children">
        {plan.children.length === 0 ? (
          <EmptyState icon={<Baby size={28} />} title="子どもは未設定" body="すでにいる子は出生時の年齢を過去に、予定なら未来に設定します。" action={<button className="btn btn-primary" onClick={() => { add(); setFocus("all"); setOpen(true); }}><Plus size={15} />子どもを追加</button>} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button className="btn btn-primary flex-1" onClick={() => openFor("all")}><Users size={15} />まとめて編集（{plan.children.length}人）</button>
              <button className="btn btn-outline" onClick={add}><Plus size={15} />追加</button>
            </div>
            {plan.children.map((c, i) => {
              const now = plan.self.age - c.birthAge;
              return (
                <div key={c.id} className="card p-3 flex items-start gap-3">
                  <div className="grid place-items-center h-9 w-9 rounded-lg shrink-0" style={{ background: CHILD_COLORS[i % CHILD_COLORS.length], color: "var(--on-fill-soft)" }}><Baby size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2"><span className="text-sm font-semibold ink">{c.name}</span><span className="hint">{now >= 0 ? `現在 ${now}歳` : `${-now}年後に誕生`}（本人 {c.birthAge}歳）</span></div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Pill>{pathSummary(c)}</Pill>
                      <Pill>教育費 {totalEducationCost(c).toLocaleString()}万</Pill>
                      {(c.leaveMonthsSelf || c.leaveMonthsSpouse) ? <Pill>育休 {[c.leaveMonthsSelf && `本人${c.leaveMonthsSelf}ヶ月`, c.leaveMonthsSpouse && `配偶者${c.leaveMonthsSpouse}ヶ月`].filter(Boolean).join("・")}</Pill> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openFor(c.id)} aria-label={`${c.name} の進路・学費・育休を編集`} title={`${c.name} の進路・学費・育休を編集`} className="btn btn-outline text-xs px-2 py-1"><Pencil size={13} />編集</button>
                    <button onClick={() => update(d => { d.children = d.children.filter(x => x.id !== c.id); })} className="btn btn-ghost px-1.5 hover:text-[var(--critical)]" aria-label={`${c.name} を削除`} title={`${c.name} を削除`}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <Card title="共通の設定">
          <Row>
            <NumField label="出産費用（自己負担）" value={cc.birthCost} unit="万円" step={10} min={0} onChange={v => update(d => { d.childrenCommon.birthCost = v; })} help="出産育児一時金（50万円）を差し引いた自己負担の目安。誕生の年に一時支出として計上します。" />
            <NumField label="養育費（教育費以外・1人あたり）" value={cc.careMonthly} unit="万円/月" step={0.5} min={0} onChange={v => update(d => { d.childrenCommon.careMonthly = v; })} help="食費・衣服・医療・おこづかい・習い事以外の雑費など。" />
            <NumField label="独立する年齢" value={cc.independenceAge} unit="歳" min={18} max={30} onChange={v => update(d => { d.childrenCommon.independenceAge = v; })} help="養育費が終わり、基本生活費も減らす年齢。" />
          </Row>
          <p className="hint mt-2">
            養育費は 1人あたり年 {Math.round(cc.careMonthly * 12)}万円{plan.children.length > 1 && `、${plan.children.length}人そろう期間は年 ${Math.round(cc.careMonthly * 12 * plan.children.length)}万円`}（教育費とは別、インフレ率で毎年増加）。
            基本生活費に子どもの食費・衣類などをすでに含めている場合は小さめ（0〜1.5万円/月）に。
          </p>
          <div className="mt-3 space-y-2">
            <div className="label">育休・復帰後の働き方</div>
            <Toggle checked={cc.leaveBenefit} onChange={v => update(d => { d.childrenCommon.leaveBenefit = v; })} label="育児休業給付金を受給" help="休業前賃金の 67%（180日まで）／50%（以降）、非課税。会社員のみ。" />
            {([["self", plan.self.name], ...(plan.spouse ? [["spouse", plan.spouse.name] as const] : [])] as const).map(([who, name]) => {
              const r = who === "self" ? cc.returnSelf : cc.returnSpouse;
              const set = (fn: (x: { ratioPct: number; years: number }) => void) => update(d => { fn(who === "self" ? d.childrenCommon.returnSelf : d.childrenCommon.returnSpouse); });
              const on = r.years > 0 && r.ratioPct < 100;
              const leaveMonths = plan.children.reduce((a, c) => a + (who === "self" ? c.leaveMonthsSelf : c.leaveMonthsSpouse), 0);
              return (
                <div key={who} className="rounded-xl border line p-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium ink w-24 shrink-0">{name}</span>
                    <Toggle checked={on} onChange={v => set(x => { if (v) { x.ratioPct = 70; x.years = 3; } else { x.ratioPct = 100; x.years = 0; } })} label="復帰後に時短勤務する" help="育休が終わった年から、年収を下げて働く想定。" />
                  </div>
                  {on && (
                    <Row className="mt-2">
                      <NumField label="復帰後の年収比率" value={r.ratioPct} unit="%" step={5} min={10} max={99} onChange={v => set(x => { x.ratioPct = v; })} help="育休前の年収に対する割合。フルタイム復帰なら 100%。" />
                      <NumField label="その期間" value={r.years} unit="年" min={1} max={20} onChange={v => set(x => { x.years = v; })} help="育休が終わった年から数えます。子が複数いる場合は期間の重なりを考慮して最も低い比率を適用。" />
                    </Row>
                  )}
                  {on && (leaveMonths > 0
                    ? <p className="hint mt-1.5">育休を設定した子ごとに、復帰の年から {r.years} 年間、年収が {r.ratioPct}% になります。</p>
                    : <p className="text-[11px] mt-1.5 text-[var(--warning)]">{name} に育休の設定がないため、この時短は計算に反映されません。<button className="underline ml-1" onClick={() => { setFocus("all"); setOpen(true); }}>子どもごとに育休の月数を入れる →</button></p>)}
                </div>
              );
            })}
          </div>
        </Card>
      </LinkedSection>
      <ChildrenEditorModal open={open} onClose={() => setOpen(false)} plan={plan} focus={focus} setFocus={setFocus} update={update} />
    </>
  );
}

/** 「子どもをまとめて編集」モーダル。入力パネルとウィザードの両方から使う。 */
export function ChildrenEditorModal({ open, onClose, plan, focus, setFocus, update }: { open: boolean; onClose: () => void; plan: Plan; focus: string | "all"; setFocus: (f: string | "all") => void; update: (fn: (d: Plan) => void) => void }) {
  return (
    <Modal open={open} onClose={onClose} width="max-w-6xl" title={<span className="inline-flex items-center gap-2"><Users size={16} />子どもをまとめて編集</span>}
      footer={<button className="btn btn-primary" onClick={onClose}>完了</button>}>
      <ChildrenEditor plan={plan} focus={focus} setFocus={setFocus} update={update} />
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────

function ChildrenEditor({ plan, focus: focusProp, setFocus, update }: { plan: Plan; focus: string | "all"; setFocus: (f: string | "all") => void; update: (fn: (d: Plan) => void) => void }) {
  const kids = plan.children;
  const focus: string | "all" = focusProp === "all" || kids.some(c => c.id === focusProp) ? focusProp : "all";
  const targetIds = focus === "all" ? kids.map(c => c.id) : [focus];
  const ref = kids.find(c => c.id === (focus === "all" ? kids[0]?.id : focus));
  const editEdu = (fn: (e: Record<StageKey, EducationStage>) => void) => update(d => { for (const c of d.children) if (targetIds.includes(c.id)) fn(c.education); });
  const allSame = kids.length > 1 && kids.every(c => JSON.stringify(c.education) === JSON.stringify(kids[0].education));

  const preview = useMemo(() => {
    const endA = Math.min(plan.endAge, Math.max(...kids.map(c => c.birthAge + 26), plan.self.age + 1));
    const ages: number[] = []; for (let a = plan.self.age; a <= endA; a++) ages.push(a);
    const series = kids.map((c, i) => ({ label: c.name, color: CHILD_COLORS[i % CHILD_COLORS.length], values: ages.map(a => { const ca = a - c.birthAge; if (ca < 0) return 0; const cost = childCostAt(c, ca, plan.childrenCommon.careMonthly, plan.childrenCommon.independenceAge); return (cost.education + cost.care + (ca === 0 ? plan.childrenCommon.birthCost : 0)) * MAN; }) }));
    const totals = kids.map(c => ({ edu: totalEducationCost(c), care: plan.childrenCommon.careMonthly * 12 * plan.childrenCommon.independenceAge + plan.childrenCommon.birthCost }));
    const peak = ages.reduce((m, _, i) => Math.max(m, series.reduce((s, q) => s + q.values[i], 0)), 0);
    return { ages, series, totals, peak };
  }, [kids, plan]);

  if (!kids.length) return <EmptyState title="子どもがいません" action={<button className="btn btn-primary" onClick={() => update(d => { d.children.push(defaultChild(0, d.self.age + 1)); })}><Plus size={15} />追加</button>} />;

  return (
    <div className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-5">
      <div className="space-y-4">
        {/* 一覧テーブル */}
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="surface-2"><tr className="ink-2"><th className="text-left px-3 py-2 font-medium">名前</th><th className="text-left px-2 py-2 font-medium">誕生（本人年齢）</th><th className="text-left px-2 py-2 font-medium">育休 本人</th>{plan.spouse && <th className="text-left px-2 py-2 font-medium">育休 配偶者</th>}<th className="text-left px-2 py-2 font-medium">教育費</th><th /></tr></thead>
            <tbody>
              {kids.map((c, i) => (
                <tr key={c.id} className={cx("border-t line", focus === c.id && "bg-[var(--accent-soft)]")}>
                  <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: CHILD_COLORS[i % CHILD_COLORS.length] }} /><TextField className="underline-field bg-transparent border-b line outline-none w-16 text-sm" value={c.name} onChange={v => update(d => { const t = d.children.find(x => x.id === c.id); if (t) t.name = v; })} ariaLabel="名前" /></span></td>
                  <td className="px-2 py-1.5"><NumField value={c.birthAge} unit="歳" min={15} max={60} size="sm" className="w-28" onChange={v => update(d => { const t = d.children.find(x => x.id === c.id); if (t) t.birthAge = v; })} /></td>
                  <td className="px-2 py-1.5"><NumField value={c.leaveMonthsSelf} unit="ヶ月" min={0} max={36} size="sm" className="w-28" onChange={v => update(d => { const t = d.children.find(x => x.id === c.id); if (t) t.leaveMonthsSelf = v; })} /></td>
                  {plan.spouse && <td className="px-2 py-1.5"><NumField value={c.leaveMonthsSpouse} unit="ヶ月" min={0} max={36} size="sm" className="w-28" onChange={v => update(d => { const t = d.children.find(x => x.id === c.id); if (t) t.leaveMonthsSpouse = v; })} /></td>}
                  <td className="px-2 py-1.5 tabular ink">{totalEducationCost(c).toLocaleString()}万</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button onClick={() => setFocus(c.id)} aria-pressed={focus === c.id} aria-label={`${c.name} の進路を編集`} className={cx("tap btn text-[11px] px-2 py-0.5", focus === c.id ? "btn-primary" : "btn-ghost")}>進路</button>
                    <button onClick={() => update(d => { d.children = d.children.filter(x => x.id !== c.id); })} className="tap btn btn-ghost px-1.5 py-0.5 hover:text-[var(--critical)]" aria-label={`${c.name} を削除`}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t line flex items-center justify-between">
            <button className="btn btn-ghost text-xs" onClick={() => update(d => { const last = d.children[d.children.length - 1]; d.children.push(defaultChild(d.children.length, last ? last.birthAge + 3 : d.self.age + 1)); })}><Plus size={14} />子どもを追加</button>
            <span className="hint">育休は出生から連続した月数。給付金と復帰後の時短は「共通の設定」で本人・配偶者ごとに設定します。</span>
          </div>
        </div>

        {/* 進路エディタ */}
        <div className="card p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold ink">進路</span>
            <Segmented size="sm" value={focus} onChange={setFocus} options={[{ value: "all", label: `全員に適用${allSame ? "" : "（現在は個別）"}` }, ...kids.map(c => ({ value: c.id, label: c.name }))]} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">プリセット</span>
            {PRESETS.map(p => <button key={p.key} className="btn btn-outline text-xs px-2 py-1" onClick={() => editEdu(e => Object.assign(e, defaultEducation(p.key)))}>{p.label}</button>)}
            {focus !== "all" && kids.length > 1 && <button className="btn btn-ghost text-xs px-2 py-1 ml-auto" onClick={() => update(d => { const src = d.children.find(x => x.id === focus); if (src) for (const c of d.children) c.education = structuredClone(src.education); })}>この進路を全員にコピー</button>}
          </div>
          {ref && (
            <div className="space-y-1.5">
              {STAGE_ORDER.map(k => <StageRow key={k} k={k} st={ref.education[k]} mixed={focus === "all" && !allSame && kids.some(c => JSON.stringify(c.education[k]) !== JSON.stringify(ref.education[k]))} onChange={fn => editEdu(e => fn(e[k]))} />)}
              <p className="hint">標準値は文部科学省「子供の学習費調査」等をもとにした年額（学校教育費＋学校外活動費、入学金は初年度に加算）。金額を直接変えることもできます。{focus === "all" && "「全員に適用」では変更した項目だけが全員に反映されます。"}</p>
            </div>
          )}
        </div>
      </div>

      {/* プレビュー */}
      <div className="space-y-3 lg:sticky lg:top-0 self-start">
        <div className="text-xs font-semibold ink-2 uppercase tracking-wider">プレビュー</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg surface-2 px-2.5 py-2"><div className="ink-3">教育費の合計（{kids.length}人）</div><div className="font-semibold tabular text-sm ink">{preview.totals.reduce((a, t) => a + t.edu, 0).toLocaleString()}万</div></div>
          <div className="rounded-lg surface-2 px-2.5 py-2"><div className="ink-3">養育費＋出産の合計</div><div className="font-semibold tabular text-sm ink">{preview.totals.reduce((a, t) => a + t.care, 0).toLocaleString()}万</div></div>
          <div className="rounded-lg surface-2 px-2.5 py-2 col-span-2"><div className="ink-3">年間の子ども関連費用のピーク</div><div className="font-semibold tabular text-sm ink">{fmtMan(preview.peak)}/年</div></div>
        </div>
        <Card title="年ごとの子ども関連費用" subtitle="教育費＋養育費＋出産費用（現在の物価、児童手当・支援金は差引前）">
          <div><MiniStackedBars ages={preview.ages} series={preview.series} height={200} /></div>
        </Card>
        <div className="card p-3 text-xs space-y-1.5">
          {kids.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: CHILD_COLORS[i % CHILD_COLORS.length] }} /><span className="ink font-medium w-12">{c.name}</span><span className="ink-2 truncate">{pathSummary(c)}</span><span className="ml-auto tabular ink shrink-0">{totalEducationCost(c).toLocaleString()}万</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StageRow({ k, st, mixed, onChange }: { k: StageKey; st: EducationStage; mixed: boolean; onChange: (fn: (s: EducationStage) => void) => void }) {
  const t = STAGE_TABLE[k];
  const annual = st.annualOverride ?? stageAnnualCost(k, st, false);
  return (
    <div className={cx("flex flex-wrap items-center gap-2 rounded-lg border line px-2.5 py-1.5", mixed && "border-dashed")}>
      <Toggle checked={st.enabled} onChange={v => onChange(s => { s.enabled = v; })} label={<span className="inline-block min-w-12">{t.label}</span>} help="オフにすると、この段階には進学しないものとして教育費を計算しません。" />
      <span className="hint w-16">{t.from}〜{t.to}歳</span>
      {mixed && <Pill tone="warning">子ごとに異なる</Pill>}
      {st.enabled && st.annualOverride != null && <button className="text-[10px] underline ink-3" onClick={() => onChange(s => { s.annualOverride = undefined; })} title="標準値に戻す">上書き中・標準に戻す</button>}
      {st.enabled && (
        <>
          <Segmented size="sm" value={st.kind} onChange={v => onChange(s => { s.kind = v; s.annualOverride = undefined; })} options={[{ value: "public", label: k === "university" || k === "grad" ? "国公立" : "公立" }, { value: "private", label: "私立" }]} />
          {t.hasAway && <Segmented size="sm" value={st.away ?? "home"} onChange={v => onChange(s => { s.away = v; s.annualOverride = undefined; })} options={(Object.keys(AWAY_COST) as (keyof typeof AWAY_COST)[]).map(a => ({ value: a, label: AWAY_COST[a].label.replace("で一人暮らし", "") }))} />}
          <NumField value={annual} unit="万/年" step={5} min={0} size="sm" className="w-32 ml-auto" help={`年額（${t.hasAway ? "下宿費込み、" : ""}入学金等 ${ADMISSION_EXTRA[k][st.kind]}万は初年度に別途加算）。標準値から変えると上書きになります。`} onChange={v => onChange(s => { s.annualOverride = v; })} />
        </>
      )}
    </div>
  );
}
