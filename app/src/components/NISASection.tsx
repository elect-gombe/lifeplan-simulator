import React from "react";
import type { Scenario, NISAConfig, BalancePolicy } from "../lib/types";
import { Section } from "./Section";
import { Inp, Btns, Lnk, Check, FieldRow, SubGroup, MiniBtn, NumField, Help } from "./ui";

// ===== 残高ポリシーエディター（共通コンポーネント） =====

const WITHDRAW_LABELS: Record<string, string> = { taxable: "特定口座", spouseNisa: "配偶者NISA", selfNisa: "本人NISA" };
const DEFAULT_ORDER: NonNullable<BalancePolicy["withdrawalOrder"]> = ["taxable", "spouseNisa", "selfNisa"];

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
  const order = bp.withdrawalOrder || DEFAULT_ORDER;
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= order.length) return;
    const o = [...order]; [o[i], o[j]] = [o[j], o[i]];
    onChange({ withdrawalOrder: o as BalancePolicy["withdrawalOrder"] });
  };
  const anchors = bp.cashAnchors || [];
  const setAnchor = (i: number, patch: Partial<{ age: number; amountMan: number }>) => {
    const a = [...anchors]; a[i] = { ...a[i], ...patch }; onChange({ cashAnchors: a });
  };
  const maxMonths = bp.cashReserveMaxMonths ?? bp.cashReserveMonths;

  return (
    <SubGroup title={<>生活防衛資金・取り崩し<Help text="現金が下限を下回ったら投資資産を取り崩し、上限を超えた分はNISA/特定口座へ投資。その間は何もしない（ヒステリシス）" /></>}
      right={onLinkToggle && <Lnk linked={!!linked} onToggle={onLinkToggle} />}
      className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <FieldRow>
        <Inp label="現金の下限" value={bp.cashReserveMonths} onChange={v => onChange({ cashReserveMonths: v })} unit="ヶ月分" w="w-10" step={1} min={0} max={60} help="月間支出の何ヶ月分を現金で確保するか" presets={[3, 6, 12, 24]} />
        <>
          <Inp label="上限" value={maxMonths} onChange={v => onChange({ cashReserveMaxMonths: v })} unit="ヶ月分" w="w-10" step={1} min={bp.cashReserveMonths} max={120} help="超えた分を投資へ" />
          <Check label="余剰は NISA/特定口座 へ投資" checked={bp.nisaPriority} onChange={v => onChange({ nisaPriority: v })} accent="accent-green-600" />
        </>
      </FieldRow>
      <>
        <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5 text-[10px]">
          {/* 目標貯金アンカー */}
          <div>
            <div className="mb-0.5 flex items-center gap-1">
              <span className="font-semibold text-gray-500">目標貯金<Help text="特定年齢までに現金をX万円確保。目標に向けて投資を抑制し現金を多めに持ちます" /></span>
              <MiniBtn onClick={() => onChange({ cashAnchors: [...anchors, { age: currentAge + 5, amountMan: 500 }] })}>＋ 追加</MiniBtn>
            </div>
            {anchors.map((a, i) => (
              <div key={i} className="mb-0.5 flex items-center gap-1">
                <NumField value={a.age} min={currentAge + 1} max={110} step={1} unit="歳までに" w="w-10" onChange={v => setAnchor(i, { age: v })} />
                <NumField value={a.amountMan} step={100} min={0} unit="万円" w="w-16" onChange={v => setAnchor(i, { amountMan: v })} />
                <button type="button" onClick={() => onChange({ cashAnchors: anchors.filter((_, j) => j !== i) })} className="text-gray-300 hover:text-red-500">×</button>
              </div>
            ))}
          </div>
          {/* 引出順序 */}
          <div>
            <div className="mb-0.5 flex items-center gap-1">
              <span className="font-semibold text-gray-500">取り崩し順序<Help text="上から優先して取り崩します" /></span>
              {bp.withdrawalOrder && <MiniBtn tone="gray" onClick={() => onChange({ withdrawalOrder: undefined })}>デフォルトに戻す</MiniBtn>}
            </div>
            {order.filter(src => src !== "spouseNisa" || hasSpouse).map((src, i) => (
              <div key={src} className="flex items-center gap-1">
                <span className="w-4 text-center text-gray-400">{i + 1}.</span>
                <span className="w-20">{WITHDRAW_LABELS[src]}</span>
                <button type="button" onClick={() => move(i, -1)} className="text-gray-400 hover:text-blue-500 disabled:opacity-30" disabled={i === 0}>▲</button>
                <button type="button" onClick={() => move(i, 1)} className="text-gray-400 hover:text-blue-500 disabled:opacity-30" disabled={i === order.length - 1}>▼</button>
              </div>
            ))}
          </div>
        </div>
      </>
    </SubGroup>
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
  const setNISA = (patch: Partial<NISAConfig>) => onChange({ ...s, nisa: { ...ni, ...patch } });
  const setBP = (patch: Partial<BalancePolicy>) => onChange({ ...s, balancePolicy: { ...bp, ...patch } });
  const hasIndividualRR = s.dcReturnRate != null || s.nisaReturnRate != null || s.taxableReturnRate != null || s.cashInterestRate != null;
  const rrField = (label: string, key: "dcReturnRate" | "nisaReturnRate" | "taxableReturnRate") => (
    <span className="inline-flex items-center gap-1">
      <span className="text-[10px] text-gray-500">{label}</span>
      <NumField value={s[key] ?? null} step={0.5} min={0} max={30} unit="%" w="w-12" placeholder="共通" title="空欄＝シナリオ設定の運用利回りを使用"
        onChange={v => onChange({ ...s, [key]: v })} onClear={() => onChange({ ...s, [key]: undefined })} />
    </span>
  );

  const summary = effNi.enabled ? `NISA ${effNi.accounts === 2 ? "夫婦2口座" : "本人1口座"} / 現金${bp.cashReserveMonths}ヶ月` : `NISAなし / 現金${bp.cashReserveMonths}ヶ月`;
  return (
    <Section title="NISA / 投資" icon="📈" borderColor="#16a34a" bgOpen="bg-green-50/30" open={open} onToggle={onToggle}
      linked={!!inheritedFromBase}
      badge={<span className="font-normal text-gray-400 text-[10px]">({summary})</span>}
      right={<Check label="NISAを使う" checked={ni.enabled || !!inheritedFromBase} onChange={v => setNISA({ enabled: v })} accent="accent-green-600" />}>
      <div className="space-y-1.5 text-xs">
        {ni.enabled && (
          <FieldRow>
            <Btns label="口座" options={[{ value: 1 as const, label: "本人のみ" }, { value: 2 as const, label: "夫婦2口座" }]}
              value={ni.accounts} onChange={v => setNISA({ accounts: v })} color="green" />
            <>
              <Inp label="年間枠" value={ni.annualLimitMan} onChange={v => setNISA({ annualLimitMan: v })} unit="万/人" w="w-12" step={10} min={0} />
              <Inp label="生涯枠" value={ni.lifetimeLimitMan} onChange={v => setNISA({ lifetimeLimitMan: v })} unit="万/人" w="w-14" step={100} min={0} />
            </>
            <span className="self-center text-[10px] text-gray-400">合計 年{ni.annualLimitMan * (ni.accounts || 1)}万 / 生涯{(ni.lifetimeLimitMan * (ni.accounts || 1)).toLocaleString()}万。超過分は特定口座（20.315%課税）</span>
          </FieldRow>
        )}

        
        <>
          <SubGroup title={<>口座別の利回り<Help text="未入力の口座は「シナリオ設定」の運用利回りを使用" /></>}>
            <FieldRow>
              {rrField("DC", "dcReturnRate")}
              {rrField("NISA", "nisaReturnRate")}
              {rrField("特定口座", "taxableReturnRate")}
              <Inp label="現金" value={s.cashInterestRate ?? 0} onChange={v => onChange({ ...s, cashInterestRate: v || undefined })} unit="%" w="w-12" step={0.1} min={0} max={10} />
            </FieldRow>
          </SubGroup>
        </>

        <BalancePolicyEditor
          bp={bp}
          onChange={setBP}
          currentAge={currentAge}
          hasSpouse={s.spouse?.enabled || !!baseS?.spouse?.enabled}
          readOnly={bpInherited}
          linked={bpInherited}
          onLinkToggle={baseS ? () => (bpInherited ? setBP({}) : onChange({ ...s, balancePolicy: undefined })) : undefined}
        />
      </div>
    </Section>
  );
}
