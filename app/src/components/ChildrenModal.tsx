import React, { useEffect, useMemo, useState } from "react";
import type { LifeEvent } from "../lib/types";
import { BarChart, ModalShell, ModalHeader, NumField, Check, SubGroup, Btns, Help, MiniBtn } from "./ui";
import {
  type ChildPlan, type ChildCommon, type Stage, type LivingType,
  TEMPLATES, STAGE_DEFAULTS, LIVING_COSTS, DEFAULT_COMMON,
  buildStages, calcStageAnnual, matchTemplate, newChildPlan, childCostTotals, householdChildCostByAge,
  eventsToChildPlans, replaceChildEvents,
} from "../lib/childPlan";

const STAGE_COLORS: Record<string, string> = {
  nursery: "#fbbf24", kinder: "#f59e0b", elementary: "#3b82f6", middle: "#8b5cf6", high: "#ec4899", university: "#ef4444", grad: "#dc2626",
};

/**
 * 子供の一括編集モーダル。
 * 子供を配列として一覧表示し、名前・誕生年齢・教育プラン・育休月数を行ごとに、
 * 出産費用・養育費・支援金・育休条件を全員共通として編集する。
 * 保存時に従来の LifeEvent（親 child + 教育/支援金サブイベント）へ展開する。
 */
export function ChildrenModal({ isOpen, onClose, events, onSave, currentAge, retirementAge, focusChildId }: {
  isOpen: boolean; onClose: () => void;
  /** シナリオの全イベント。子供関連は読み込み・置換、それ以外はそのまま返す */
  events: LifeEvent[];
  onSave: (nextEvents: LifeEvent[]) => void;
  currentAge: number; retirementAge: number;
  /** 開いたときにステージ編集対象にする子の id */
  focusChildId?: number;
}) {
  const [plans, setPlans] = useState<ChildPlan[]>([]);
  const [common, setCommon] = useState<ChildCommon>(DEFAULT_COMMON);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bulkLeave, setBulkLeave] = useState({ self: 12, spouse: 12 });

  // 開くたびに現在のイベントから復元。子がいなければ1人目を用意
  useEffect(() => {
    if (!isOpen) return;
    const { plans: p, common: c } = eventsToChildPlans(events);
    const initial = p.length > 0 ? p : [newChildPlan(0, Math.min(currentAge + 3, retirementAge - 1))];
    setPlans(initial);
    setCommon(c);
    setSelectedId(focusChildId ?? initial[0]?.id ?? null);
  }, [isOpen]);

  const selected = plans.find(p => p.id === selectedId) ?? plans[0];
  const updatePlan = (id: number, patch: Partial<ChildPlan>) => setPlans(ps => ps.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const removePlan = (id: number) => setPlans(ps => ps.filter(p => p.id !== id));
  const addPlan = () => setPlans(ps => {
    const last = ps[ps.length - 1];
    const birthAge = Math.min(last ? last.birthAge + 2 : currentAge + 3, retirementAge - 1);
    const np = newChildPlan(ps.length, birthAge);
    if (last) { np.stages = last.stages.map(s => ({ ...s })); np.leaveSelfMonths = last.leaveSelfMonths; np.leaveSpouseMonths = last.leaveSpouseMonths; }
    setSelectedId(np.id);
    return [...ps, np];
  });
  const applyTemplateTo = (id: number | "all", key: string) => {
    const tpl = TEMPLATES.find(t => t.key === key); if (!tpl) return;
    setPlans(ps => ps.map(p => (id === "all" || p.id === id ? { ...p, stages: buildStages(tpl) } : p)));
  };
  const copyStagesToAll = () => { if (selected) setPlans(ps => ps.map(p => ({ ...p, stages: selected.stages.map(s => ({ ...s })) }))); };
  const applyLeaveToAll = () => setPlans(ps => ps.map(p => ({ ...p, leaveSelfMonths: bulkLeave.self, leaveSpouseMonths: bulkLeave.spouse })));
  const updateStage = (idx: number, patch: Partial<Stage>) => {
    if (!selected) return;
    updatePlan(selected.id, {
      stages: selected.stages.map((s, i) => {
        if (i !== idx) return s;
        const next = { ...s, ...patch };
        if (patch.variant !== undefined || patch.livingType !== undefined) next.annualMan = calcStageAnnual(STAGE_DEFAULTS[s.key], next.variant, next.livingType);
        return next;
      }),
    });
  };
  const setLeave = (patch: Partial<ChildCommon["leave"]>) => setCommon(c => ({ ...c, leave: { ...c.leave, ...patch } }));

  const totals = useMemo(() => plans.map(p => ({ id: p.id, ...childCostTotals(p, common) })), [plans, common]);
  const grand = totals.reduce((s, t) => s + t.total, 0);
  const byAge = useMemo(() => householdChildCostByAge(plans, common), [plans, common]);
  const maxYear = Math.max(1, ...byAge.map(r => r.care + r.edu + r.oneTime));
  const anyLeave = plans.some(p => p.leaveSelfMonths > 0 || p.leaveSpouseMonths > 0);

  if (!isOpen) return null;
  const handleSave = () => { onSave(replaceChildEvents(events, plans, common)); onClose(); };

  return (
    <ModalShell onClose={onClose} maxWidthClass="max-w-6xl">
      <ModalHeader title={`👶 子供の設定（${plans.length}人）`} />
      <div className="max-h-[82vh] overflow-y-auto p-4 text-xs">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
          {/* ───── 左: 一覧 + 共通設定 + ステージ ───── */}
          <div className="space-y-3">
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 text-[10px] text-gray-500">
                  <tr>
                    <th className="px-2 py-1 text-left">名前</th>
                    <th className="px-2 py-1 text-left">誕生時の年齢</th>
                    <th className="px-2 py-1 text-left">教育プラン</th>
                    <th className="px-2 py-1 text-left" colSpan={2}>育休（本人 / 配偶者）</th>
                    <th className="px-2 py-1 text-right">費用合計</th>
                    <th className="px-1 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p, i) => {
                    const t = totals.find(x => x.id === p.id)!;
                    const tplKey = matchTemplate(p.stages);
                    const isSel = selected?.id === p.id;
                    return (
                      <tr key={p.id} onClick={() => setSelectedId(p.id)}
                        className={`cursor-pointer border-t ${isSel ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                        <td className="px-2 py-1">
                          <input value={p.name} onChange={e => updatePlan(p.id, { name: e.target.value })} onClick={e => e.stopPropagation()}
                            className="w-20 rounded border px-1.5 py-0.5 text-[11px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-2 py-1" onClick={e => e.stopPropagation()}>
                          <NumField value={p.birthAge} onChange={v => updatePlan(p.id, { birthAge: v })} min={Math.max(18, currentAge - 30)} max={retirementAge - 1} step={1} unit="歳" w="w-12" />
                          <div className="text-[9px] text-gray-400">{p.birthAge < currentAge ? `現在${currentAge - p.birthAge}歳` : p.birthAge === currentAge ? "今年" : `${p.birthAge - currentAge}年後`}</div>
                        </td>
                        <td className="px-2 py-1" onClick={e => e.stopPropagation()}>
                          <select value={tplKey} onChange={e => e.target.value !== "custom" && applyTemplateTo(p.id, e.target.value)}
                            className="max-w-[9.5rem] rounded border px-1 py-0.5 text-[10px]">
                            {TEMPLATES.map(tp => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
                            <option value="custom">カスタム</option>
                          </select>
                        </td>
                        <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
                          <NumField value={p.leaveSelfMonths} onChange={v => updatePlan(p.id, { leaveSelfMonths: v })} min={0} max={36} step={1} unit="ヶ月" w="w-9" title="本人の休業月数（0＝なし）" />
                        </td>
                        <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
                          <NumField value={p.leaveSpouseMonths} onChange={v => updatePlan(p.id, { leaveSpouseMonths: v })} min={0} max={36} step={1} unit="ヶ月" w="w-9" title="配偶者の休業月数（0＝なし）" />
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          <div className="font-semibold">{t.total.toLocaleString()}万</div>
                          <div className="text-[9px] text-gray-400">教育{t.edu}・養育{t.care}</div>
                        </td>
                        <td className="px-1 py-1 text-right">
                          <button type="button" onClick={e => { e.stopPropagation(); removePlan(p.id); }} className="text-gray-300 hover:text-red-500" title={`${p.name}を削除`}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                  {plans.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-center text-gray-400">子供なし。「＋ 子を追加」で追加してください</td></tr>}
                </tbody>
              </table>
            </div>

            {/* ツールバー: 追加 / 全員への一括適用（1行に収まる幅で設計） */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-50 px-2 py-1.5">
              <MiniBtn onClick={addPlan} disabled={plans.length >= 6}>＋ 子を追加</MiniBtn>
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-500">
                <span className="font-semibold">全員に適用 →</span>
                <span className="inline-flex items-center gap-1">プラン
                  <select defaultValue="" onChange={e => { if (e.target.value) applyTemplateTo("all", e.target.value); e.target.value = ""; }} className="rounded border px-1 py-0.5 text-[10px]">
                    <option value="">選択…</option>
                    {TEMPLATES.map(tp => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
                  </select>
                </span>
                <span className="inline-flex items-center gap-1">育休
                  <NumField value={bulkLeave.self} onChange={v => setBulkLeave(b => ({ ...b, self: v }))} min={0} max={36} unit="本人" w="w-8" title="本人の休業月数" />
                  <NumField value={bulkLeave.spouse} onChange={v => setBulkLeave(b => ({ ...b, spouse: v }))} min={0} max={36} unit="配偶者" w="w-8" title="配偶者の休業月数" />
                  <span>ヶ月</span>
                  <MiniBtn onClick={applyLeaveToAll} tone="gray">適用</MiniBtn>
                </span>
              </span>
            </div>

            {/* 共通設定: ラベル上・4列固定グリッドで折り返しを防ぐ */}
            <SubGroup title="全員共通の設定">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                <Cell label="出産費用"><NumField value={common.birthCostMan} onChange={v => setCommon(c => ({ ...c, birthCostMan: v }))} step={10} min={0} unit="万円" w="w-12" /></Cell>
                <Cell label={<>養育費<Help text="教育費以外の年間養育費（食費・衣服・習い事等）。目安 20〜50万/年。最終ステージ終了まで" /></>}>
                  <NumField value={common.baseCareMan} onChange={v => setCommon(c => ({ ...c, baseCareMan: v }))} step={5} min={0} unit="万円/年" w="w-12" />
                </Cell>
                <Cell label={<Check label="結婚支援金" checked={!!common.weddingSupport} onChange={on => setCommon(c => ({ ...c, weddingSupport: on ? { amountMan: 100, childAge: 30 } : undefined }))} accent="accent-pink-500" />}>
                  {common.weddingSupport ? (
                    <span className="inline-flex items-center gap-1">
                      <NumField value={common.weddingSupport.amountMan} onChange={v => setCommon(c => ({ ...c, weddingSupport: { ...c.weddingSupport!, amountMan: v } }))} step={10} min={0} unit="万" w="w-12" />
                      <NumField value={common.weddingSupport.childAge} onChange={v => setCommon(c => ({ ...c, weddingSupport: { ...c.weddingSupport!, childAge: v } }))} step={1} min={18} max={45} unit="歳時" w="w-9" />
                    </span>
                  ) : <span className="text-[10px] text-gray-300">なし</span>}
                </Cell>
                <Cell label={<Check label="住宅取得援助" checked={!!common.housingAid} onChange={on => setCommon(c => ({ ...c, housingAid: on ? { amountMan: 300, childAge: 32 } : undefined }))} />}>
                  {common.housingAid ? (
                    <span className="inline-flex items-center gap-1">
                      <NumField value={common.housingAid.amountMan} onChange={v => setCommon(c => ({ ...c, housingAid: { ...c.housingAid!, amountMan: v } }))} step={50} min={0} unit="万" w="w-12" />
                      <NumField value={common.housingAid.childAge} onChange={v => setCommon(c => ({ ...c, housingAid: { ...c.housingAid!, childAge: v } }))} step={1} min={18} max={50} unit="歳時" w="w-9" />
                    </span>
                  ) : <span className="text-[10px] text-gray-300">なし</span>}
                </Cell>
              </div>
            </SubGroup>

            {/* 育休の共通条件 */}
            <SubGroup title={<>育休の条件（全員共通）<Help text="休業月数は上の表で子ごとに設定。休業中は給与・社保ゼロ、育児休業給付金（180日まで67%・以降50%、月額上限あり、非課税）。子が3歳未満の間の年金記録は休業前給与で計算" /></>}>
              <div className={`grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 ${anyLeave ? "" : "opacity-50"}`}>
                <Cell label="給付金"><Check label="受給する" checked={common.leave.benefit} onChange={v => setLeave({ benefit: v })} help="雇用保険の被保険者が対象。自営業・専業の場合はOFF" /></Cell>
                <Cell label="本人 復職後" className="sm:col-span-1">
                  <ReturnEditor ratio={common.leave.selfReturnRatio} years={common.leave.selfReturnYears} onChange={(ratio, years) => setLeave({ selfReturnRatio: ratio, selfReturnYears: years })} />
                </Cell>
                <Cell label="配偶者 復職後" className="sm:col-span-2">
                  <ReturnEditor ratio={common.leave.spouseReturnRatio} years={common.leave.spouseReturnYears} onChange={(ratio, years) => setLeave({ spouseReturnRatio: ratio, spouseReturnYears: years })} />
                </Cell>
              </div>
              {!anyLeave && <div className="mt-1 text-[10px] text-gray-400">表の「育休」列に月数を入れると有効になります</div>}
            </SubGroup>
          </div>

          {/* ───── 右: 世帯プレビュー ───── */}
          <div className="space-y-2 rounded border border-amber-200 bg-amber-50/50 p-3">
            <div className="text-sm font-bold text-amber-800">子供関連費用（世帯）</div>
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <div className="rounded bg-red-100 p-1.5"><div className="text-[9px] text-red-600">合計（{plans.length}人）</div><div className="text-sm font-bold text-red-800">{grand.toLocaleString()}万</div></div>
              <div className="rounded bg-blue-100 p-1.5"><div className="text-[9px] text-blue-600">教育費</div><div className="text-sm font-bold text-blue-800">{totals.reduce((s, t) => s + t.edu, 0).toLocaleString()}万</div></div>
            </div>
            {byAge.length > 0 && (
              <>
                <div className="text-[10px] font-semibold text-gray-500">本人の年齢別 年間費用</div>
                <BarChart height={72} maxValue={maxYear}>
                  {byAge.map(r => {
                    const total = r.care + r.edu + r.oneTime;
                    const h = Math.max(Math.round(total / maxYear * 72), total > 0 ? 1 : 0);
                    return (
                      <div key={r.age} className="group relative flex flex-1 flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: h, alignSelf: "flex-end" }}>
                        {r.oneTime > 0 && <div className="w-full bg-pink-400" style={{ height: `${r.oneTime / total * 100}%` }} />}
                        {r.edu > 0 && <div className="w-full bg-blue-400" style={{ height: `${r.edu / total * 100}%` }} />}
                        {r.care > 0 && <div className="w-full bg-amber-300" style={{ height: `${r.care / total * 100}%` }} />}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-1.5 py-0.5 text-[9px] text-white group-hover:block">
                          {r.age}歳: {total}万/年（教育{r.edu} 養育{r.care}{r.oneTime ? ` 一時${r.oneTime}` : ""}）
                        </div>
                      </div>
                    );
                  })}
                </BarChart>
                <div className="ml-8 flex justify-between text-[9px] text-gray-400"><span>{byAge[0].age}歳</span><span>{byAge[byAge.length - 1].age}歳</span></div>
                <div className="flex flex-wrap gap-1.5 text-[9px]">
                  <span className="flex items-center gap-0.5"><span className="inline-block h-2 w-2 rounded-sm bg-amber-300" />養育費</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block h-2 w-2 rounded-sm bg-blue-400" />教育費</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block h-2 w-2 rounded-sm bg-pink-400" />出産・支援金</span>
                </div>
              </>
            )}
            <table className="w-full text-[10px]">
              <thead><tr className="border-b text-gray-500"><th className="px-1 py-0.5 text-left">子</th><th className="px-1 py-0.5 text-right">誕生</th><th className="px-1 py-0.5 text-right">教育</th><th className="px-1 py-0.5 text-right">養育</th><th className="px-1 py-0.5 text-right">一時</th><th className="px-1 py-0.5 text-right font-bold">合計</th></tr></thead>
              <tbody>
                {plans.map(p => { const t = totals.find(x => x.id === p.id)!; return (
                  <tr key={p.id} className={`border-b border-gray-100 ${selected?.id === p.id ? "bg-amber-100/60" : ""}`}>
                    <td className="px-1 py-0.5">{p.name}{(p.leaveSelfMonths > 0 || p.leaveSpouseMonths > 0) && <span className="ml-1 text-pink-600" title="育休あり">🍼</span>}</td>
                    <td className="px-1 py-0.5 text-right text-gray-400">{p.birthAge}歳</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{t.edu}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{t.care}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{t.oneTime}</td>
                    <td className="px-1 py-0.5 text-right font-bold tabular-nums">{t.total.toLocaleString()}万</td>
                  </tr>); })}
              </tbody>
            </table>
            {/* 選択中の子の教育ステージ（プレビューの下・右列） */}
            {selected && (
              <div className="border-t border-amber-200 pt-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-600">教育ステージ: <span className="text-amber-700">{selected.name}</span><span className="ml-1 font-normal text-gray-400">（表の行をクリックで切替）</span></span>
                  {plans.length > 1 && <MiniBtn onClick={copyStagesToAll} tone="gray" title="この子のステージ設定を全員にコピー">全員にコピー</MiniBtn>}
                </div>
                <div className="divide-y rounded border bg-white">
                  {selected.stages.map((s, i) => (
                    <div key={s.key} className={`flex items-center gap-1.5 px-2 py-1 ${!s.enabled ? "bg-gray-50 opacity-50" : ""}`}>
                      <input type="checkbox" checked={s.enabled} onChange={e => updateStage(i, { enabled: e.target.checked })} className="accent-blue-600" />
                      <span className="w-10 text-[10px] font-semibold">{s.label}</span>
                      <span className="w-11 text-[9px] text-gray-400">{s.fromChildAge}〜{s.toChildAge}歳</span>
                      <Btns options={[{ value: "public" as const, label: "公立" }, { value: "private" as const, label: "私立" }]} value={s.variant} onChange={v => updateStage(i, { variant: v })} disabled={!s.enabled} />
                      {s.livingType !== undefined && (
                        <select value={s.livingType} onChange={e => updateStage(i, { livingType: e.target.value as LivingType })} disabled={!s.enabled} className="rounded border px-1 py-0.5 text-[10px]">
                          {(Object.keys(LIVING_COSTS) as LivingType[]).map(k => <option key={k} value={k}>{LIVING_COSTS[k].label}{LIVING_COSTS[k].annualMan ? `+${LIVING_COSTS[k].annualMan}` : ""}</option>)}
                        </select>
                      )}
                      <NumField value={s.annualMan} onChange={v => updateStage(i, { annualMan: v })} step={5} min={0} disabled={!s.enabled} unit="万/年" w="w-12" />
                      {s.enabled && <span className="ml-auto whitespace-nowrap text-[9px] text-gray-400">計{s.annualMan * (s.toChildAge - s.fromChildAge)}万</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <span className="text-[10px] text-gray-400">保存すると子供に関するイベント（教育費・支援金を含む）をこの内容で作り直します</span>
        <span className="flex gap-2">
          <button onClick={onClose} className="rounded px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100">キャンセル</button>
          <button onClick={handleSave} className="rounded bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600">保存</button>
        </span>
      </div>
    </ModalShell>
  );
}

/** ラベル上・中身下の小セル */
function Cell({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className || ""}`}>
      <div className="mb-0.5 text-[10px] text-gray-500">{label}</div>
      <div className="flex min-h-[24px] items-center">{children}</div>
    </div>
  );
}

/** 復職後の年収比率 × 年数 */
function ReturnEditor({ ratio, years, onChange }: { ratio: number; years: number; onChange: (ratio: number, years: number) => void }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Btns options={[{ value: 100, label: "フル" }, { value: 80, label: "80%" }, { value: 60, label: "60%" }]}
        value={[100, 80, 60].includes(ratio) ? ratio : 60} onChange={v => onChange(v, v === 100 ? 0 : (years || 3))} />
      {ratio < 100 && <>
        <NumField value={ratio} onChange={v => onChange(v, years)} step={5} min={10} max={100} unit="%" w="w-10" />
        <span className="text-[10px] text-gray-500">を</span>
        <NumField value={years} onChange={v => onChange(ratio, v)} step={1} min={0} max={20} unit="年" w="w-9" />
      </>}
    </span>
  );
}
