import React from "react";
import type { Scenario, NISAConfig, BalancePolicy } from "../lib/types";
import { Section } from "./Section";
import { Inp, Btns, Lnk } from "./ui";

// ===== 残高ポリシーエディター（共通コンポーネント） =====

export function BalancePolicyEditor({ bp, onChange, currentAge, hasSpouse, readOnly, linked, onLinkToggle }: {
  bp: BalancePolicy;
  onChange: (patch: Partial<BalancePolicy>) => void;
  currentAge: number;
  hasSpouse?: boolean;
  readOnly?: boolean;
  linked?: boolean;
  onLinkToggle?: () => void;
}) {
  const disabled = !!readOnly;
  return (
    <div className={`space-y-1.5 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-semibold text-gray-600">残高ポリシー</span>
        {onLinkToggle && <Lnk linked={!!linked} onToggle={onLinkToggle} />}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-gray-500 text-[10px]">防衛資金<span className="ml-0.5 cursor-help text-gray-400" title="月間支出ベース。下限を下回ったら取り崩し、上限を超えたらNISA/特定へ投資。その間は何もしない(ヒステリシス)">ⓘ</span></span>
          <Inp label="下限" value={bp.cashReserveMonths} onChange={v => onChange({ cashReserveMonths: v })} w="w-10" step={1} min={0} />
          <Inp label="〜上限" value={bp.cashReserveMaxMonths ?? bp.cashReserveMonths} onChange={v => onChange({ cashReserveMaxMonths: v })} unit="ヶ月" w="w-10" step={1} min={bp.cashReserveMonths} />
        </div>
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <input type="checkbox" checked={bp.nisaPriority} onChange={e => onChange({ nisaPriority: e.target.checked })} className="accent-green-600" />
          <span className="text-gray-500">余剰→NISA/特定優先</span>
        </label>
      </div>
      {/* 目標貯金アンカー */}
      <div className="text-[10px]">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-gray-500 font-semibold">目標貯金<span className="ml-0.5 cursor-help text-gray-400" title="特定年齢までに現金をX万円確保。目標に向けて投資を抑制し現金を多めに持ちます">ⓘ</span></span>
          <button onClick={() => onChange({ cashAnchors: [...(bp.cashAnchors || []), { age: currentAge + 5, amountMan: 500 }] })}
            className="text-blue-500 hover:underline">+ 追加</button>
        </div>
        {(bp.cashAnchors || []).map((a, i) => (
          <div key={i} className="flex items-center gap-1 mb-0.5">
            <input type="number" value={a.age} min={currentAge + 1} step={1}
              onChange={e => { const anc = [...(bp.cashAnchors || [])]; anc[i] = { ...a, age: Number(e.target.value) }; onChange({ cashAnchors: anc }); }}
              className="w-12 rounded border px-1 py-0.5 text-xs" />
            <span className="text-gray-400">歳までに</span>
            <input type="number" value={a.amountMan} step={100} min={0}
              onChange={e => { const anc = [...(bp.cashAnchors || [])]; anc[i] = { ...a, amountMan: Number(e.target.value) }; onChange({ cashAnchors: anc }); }}
              className="w-16 rounded border px-1 py-0.5 text-xs" />
            <span className="text-gray-400">万円</span>
            <button onClick={() => { const anc = [...(bp.cashAnchors || [])]; anc.splice(i, 1); onChange({ cashAnchors: anc }); }}
              className="text-gray-300 hover:text-red-500">×</button>
          </div>
        ))}
      </div>
      {/* 引出順序 */}
      <details className="text-[10px]">
        <summary className="cursor-pointer text-gray-500">引出順序{bp.withdrawalOrder ? " (カスタム)" : " (デフォルト)"}</summary>
        <div className="mt-1 space-y-1 bg-gray-50 rounded p-1.5">
          <div className="text-gray-400">資産取り崩し順序（上から優先）</div>
          {(() => {
            const order = bp.withdrawalOrder || ["taxable", "spouseNisa", "selfNisa"];
            const labels: Record<string, string> = { taxable: "特定口座", spouseNisa: "配偶者NISA", selfNisa: "本人NISA" };
            const moveUp = (i: number) => { if (i <= 0) return; const o = [...order]; [o[i - 1], o[i]] = [o[i], o[i - 1]]; onChange({ withdrawalOrder: o as any }); };
            const moveDown = (i: number) => { if (i >= order.length - 1) return; const o = [...order]; [o[i], o[i + 1]] = [o[i + 1], o[i]]; onChange({ withdrawalOrder: o as any }); };
            return order
              .filter(src => src !== "spouseNisa" || hasSpouse)
              .map((src, i) => (
                <div key={src} className="flex items-center gap-1">
                  <span className="w-4 text-center text-gray-400">{i + 1}.</span>
                  <span className="flex-1">{labels[src]}</span>
                  <button onClick={() => moveUp(i)} className="text-gray-400 hover:text-blue-500" disabled={i === 0}>▲</button>
                  <button onClick={() => moveDown(i)} className="text-gray-400 hover:text-blue-500" disabled={i === order.length - 1}>▼</button>
                </div>
              ));
          })()}
          {bp.withdrawalOrder && <button onClick={() => onChange({ withdrawalOrder: undefined })} className="text-blue-500 hover:underline">デフォルトに戻す</button>}
        </div>
      </details>
    </div>
  );
}

// ===== NISA / Balance Policy Section =====

export function NISASection({ s, onChange, currentAge, isLinked, baseScenario, open, onToggle }: { s: Scenario; onChange: (s: Scenario) => void; currentAge: number; isLinked?: boolean; baseScenario?: Scenario | null; open: boolean; onToggle: () => void }) {
  const defaultNi: NISAConfig = { enabled: false, accounts: 2, annualLimitMan: 360, lifetimeLimitMan: 1800 };
  const ni = s.nisa || defaultNi;
  const baseS = isLinked && baseScenario ? baseScenario : null;
  const inheritedFromBase = !ni.enabled && baseS?.nisa?.enabled;
  const effNi = inheritedFromBase ? baseS!.nisa! : ni;
  const defaultBP: BalancePolicy = { cashReserveMonths: 6, cashReserveMaxMonths: 18, nisaPriority: true };
  const bpInherited = !s.balancePolicy && !!baseS?.balancePolicy;
  const bp = s.balancePolicy || baseS?.balancePolicy || defaultBP;
  const bpReadOnly = bpInherited;
  const setNISA = (patch: Partial<NISAConfig>) => onChange({ ...s, nisa: { ...ni, ...patch } });
  const setBP = (patch: Partial<BalancePolicy>) => onChange({ ...s, balancePolicy: { ...bp, ...patch } });

  return (
    <Section title="NISA / 投資" icon="📈" borderColor="#16a34a" bgOpen="bg-green-50/30" open={open} onToggle={onToggle}
      linked={!!inheritedFromBase}
      badge={effNi.enabled ? <span className="font-normal text-gray-400 text-[10px]">(有効)</span> : undefined}
      right={
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <input type="checkbox" checked={ni.enabled || !!inheritedFromBase} onChange={e => setNISA({ enabled: e.target.checked })} className="accent-green-600" />
          <span className="text-gray-500">有効</span>
        </label>
      }>
      {ni.enabled && (
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1">
              <span className="text-gray-500 text-[10px]">口座</span>
              <Btns options={[{value:1 as const,label:"本人"},{value:2 as const,label:"夫婦2"}]}
                value={ni.accounts} onChange={v => setNISA({ accounts: v })} color="green" />
            </div>
            <Inp label="年間枠" value={ni.annualLimitMan} onChange={v => setNISA({ annualLimitMan: v })} unit="万/人" step={10} />
            <Inp label="生涯枠" value={ni.lifetimeLimitMan} onChange={v => setNISA({ lifetimeLimitMan: v })} unit="万/人" step={100} />
          </div>
          <div className="text-[10px] text-gray-400">合計: 年{ni.annualLimitMan * (ni.accounts || 1)}万 / 生涯{ni.lifetimeLimitMan * (ni.accounts || 1)}万 ｜ NISA非課税、超過→特定口座(20.315%課税)</div>
          {/* Phase 3: 個別利回り */}
          <div className="border-t border-green-100 pt-1">
            <details className="text-[10px]">
              <summary className="cursor-pointer font-semibold text-gray-600">
                利回り設定
                <span className="font-normal text-gray-400 ml-1">
                  {(s.dcReturnRate != null || s.nisaReturnRate != null || s.taxableReturnRate != null || s.cashInterestRate != null)
                    ? `(個別: DC${s.dcReturnRate ?? "共通"}% NISA${s.nisaReturnRate ?? "共通"}% 特定${s.taxableReturnRate ?? "共通"}% 現金${s.cashInterestRate ?? 0}%)`
                    : "(共通利回りを使用)"}
                </span>
              </summary>
              <div className="mt-1 space-y-1 bg-green-50 rounded p-1.5">
                <div className="text-gray-500">未設定の場合、グローバル運用利回り(rr)が適用されます</div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">DC</span>
                    <input type="number" value={s.dcReturnRate ?? ""} step={0.5} placeholder="共通"
                      onChange={e => onChange({ ...s, dcReturnRate: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">NISA</span>
                    <input type="number" value={s.nisaReturnRate ?? ""} step={0.5} placeholder="共通"
                      onChange={e => onChange({ ...s, nisaReturnRate: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">特定口座</span>
                    <input type="number" value={s.taxableReturnRate ?? ""} step={0.5} placeholder="共通"
                      onChange={e => onChange({ ...s, taxableReturnRate: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">現金</span>
                    <input type="number" value={s.cashInterestRate ?? 0} step={0.1} min={0}
                      onChange={e => onChange({ ...s, cashInterestRate: Number(e.target.value) || undefined })}
                      className="w-14 rounded border px-1 py-0.5" />
                    <span className="text-gray-400">%</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
      {/* 残高ポリシー — NISA有効/無効に関係なく常に表示 */}
      <div className="border-t border-green-100 pt-1 mt-1">
        <BalancePolicyEditor
          bp={bp}
          onChange={setBP}
          currentAge={currentAge}
          hasSpouse={s.spouse?.enabled}
          readOnly={bpReadOnly}
          linked={bpReadOnly}
          onLinkToggle={baseS ? () => bpReadOnly ? setBP({}) : onChange({ ...s, balancePolicy: undefined }) : undefined}
        />
      </div>
    </Section>
  );
}
