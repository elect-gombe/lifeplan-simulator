/**
 * 入力ウィザード: 4 ステップ（あなた → 家族 → 収入と暮らし → 住まい）。
 * 初回はオンボーディングとして自動表示。以降はヘッダーの「ウィザードで入力」からいつでも開け、
 * 現在のプランの値を初期値にして、主要な項目をまとめて作り直せる（適用は ⌘Z で戻せる）。
 * 最小限の入力でまず結果を出し、詳細は編集パネルで。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowLeft, Sparkles } from "lucide-react";
import { defaultChild, defaultHousingPhase, defaultMember, defaultProperty, type Plan, type Child } from "@/domain/model";
import { ChildrenEditorModal, pathSummary } from "@/features/editor/sections/ChildrenSection";
import { Pencil } from "lucide-react";
import { useStore, useActivePlan } from "@/state/store";
import { NumField, Segmented, Toggle, cx, hasTransientOverlay, isTopmostDialog } from "@/ui/primitives";
import { runSim } from "@/state/useSim";
import { fmtMan } from "@/lib/format";

interface Draft {
  age: number; sex: "male" | "female"; employment: "employee" | "selfEmployed" | "none"; income: number; retireAge: number;
  hasSpouse: boolean; spouseAge: number; spouseIncome: number; spouseEmployment: "employee" | "selfEmployed" | "none";
  children: Child[]; // 出生年齢・進路・育休を含む完全な子どもデータ（まとめて編集モーダルで詳細を編集）
  living: number; cash: number; dcMonthly: number;
  housing: "rent" | "own" | "planToBuy"; rent: number; price: number; downPayment: number; buyAge: number;
}

const STEPS = ["あなた", "家族", "収入と暮らし", "住まい"];

const DEFAULT_DRAFT: Draft = {
  age: 35, sex: "male", employment: "employee", income: 600, retireAge: 65,
  hasSpouse: true, spouseAge: 33, spouseIncome: 400, spouseEmployment: "employee",
  children: [], living: 20, cash: 300, dcMonthly: 0,
  housing: "rent", rent: 12, price: 5000, downPayment: 500, buyAge: 38,
};

/** 現在のプランから主要項目を拾ってウィザードの初期値にする（再編集用） */
export function draftFromPlan(p: Plan): Draft {
  const first = (s: { age: number; value: number }[], fallback: number) => (s.length ? s[0].value : fallback);
  const own = p.housing.find(h => h.kind === "own");
  const rentPhase = p.housing.find(h => h.kind === "rent");
  const housing: Draft["housing"] = !own ? "rent" : own.startAge <= p.self.age ? "own" : "planToBuy";
  const liquid = p.assets.cash + p.assets.taxable + p.assets.nisaSelf + (p.assets.nisaSpouse ?? 0);
  return {
    age: p.self.age, sex: p.self.sex, employment: p.self.employment, income: first(p.self.income, 0), retireAge: p.self.retireAge,
    hasSpouse: !!p.spouse, spouseAge: p.spouse?.age ?? p.self.age - 2, spouseIncome: p.spouse ? first(p.spouse.income, 0) : DEFAULT_DRAFT.spouseIncome, spouseEmployment: p.spouse?.employment ?? "employee",
    children: structuredClone(p.children),
    living: first(p.living.monthly, DEFAULT_DRAFT.living), cash: Math.round(liquid), dcMonthly: first(p.self.dc.company, 0),
    housing, rent: rentPhase?.rentMonthly ?? DEFAULT_DRAFT.rent,
    price: own?.property.price ?? DEFAULT_DRAFT.price, downPayment: own?.property.downPayment ?? DEFAULT_DRAFT.downPayment,
    buyAge: own?.startAge ?? Math.max(p.self.age + 1, DEFAULT_DRAFT.buyAge),
  };
}

/** 初回オンボーディング（かんたん 4 ステップ）。詳しく入力したい場合は完了後に詳細ウィザード（PlanWizard）へ。 */
export function Onboarding({ onDetailed }: { onDetailed?: () => void } = {}) {
  const { dispatch } = useStore();
  const { plan, replace } = useActivePlan();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(DEFAULT_DRAFT);
  const u = (p: Partial<Draft>) => setD(x => ({ ...x, ...p }));
  const [kidsOpen, setKidsOpen] = useState(false);
  const [kidsFocus, setKidsFocus] = useState<string | "all">("all");
  const built = useMemo(() => buildPlan(plan, d), [plan, d]);
  /** まとめて編集モーダルは Plan を編集する形なので、組み立て中のプランを渡し、子ども部分だけドラフトに書き戻す */
  const updateKids = (fn: (p: Plan) => void) => { const next = structuredClone(built); fn(next); u({ children: next.children }); };
  const preview = step === STEPS.length - 1 ? runSim(built) : null;

  const finish = (detailed = false) => {
    replace(built);
    dispatch({ type: "onboarded" });
    if (detailed) onDetailed?.();
  };
  const skip = () => dispatch({ type: "onboarded" });

  // Modal / ウィザードと同じキーボード挙動。Escape は「スキップ」に対応させる。
  const boxRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef(skip);
  skipRef.current = skip;
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(boxRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(el => !el.hasAttribute("disabled"));
    requestAnimationFrame(() => { const f = focusables(); (f.find(el => el.tagName === "INPUT") ?? f[0])?.focus(); });
    const onKey = (e: KeyboardEvent) => {
      if (!isTopmostDialog(boxRef.current)) return;  // 子どもモーダルを開いている間はそちらに任せる
      if (e.key === "Escape") { if (hasTransientOverlay()) return; e.preventDefault(); skipRef.current(); return; }
      if (e.key !== "Tab") return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement;
      if (!boxRef.current?.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; previouslyFocused?.focus?.(); };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="3分でライフプランを作る" style={{ background: "color-mix(in oklab, var(--surface-0) 85%, transparent)", backdropFilter: "blur(6px)" }}>
      <div ref={boxRef} className="card w-full max-w-xl shadow-2xl overflow-y-auto max-h-[94vh] fade-in">
        <div className="px-6 pt-5 pb-3 border-b line">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold ink flex items-center gap-2"><Sparkles size={16} className="text-[var(--accent)]" />3分でライフプランを作る</h1>
            <button onClick={skip} className="tap text-xs ink-3 hover:ink">スキップ</button>
          </div>
          <ol className="flex gap-1 mt-3">
            {STEPS.map((s, i) => <li key={s} className={cx("flex-1 h-1.5 rounded-full transition-colors", i <= step ? "bg-[var(--accent)]" : "surface-3")} aria-label={s} />)}
          </ol>
          <p className="hint mt-1.5">{step + 1} / {STEPS.length}　{STEPS[step]}</p>
        </div>
        <div className="px-6 py-5 min-h-[300px]">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm ink">まずはあなたのことを教えてください。あとから細かく変更できます。</p>
              <div className="grid grid-cols-2 gap-3">
                <NumField label="年齢" value={d.age} unit="歳" min={18} max={80} onChange={v => u({ age: v, buyAge: Math.max(d.buyAge, v + 1), retireAge: Math.max(d.retireAge, v + 1) })} />
                <div><span className="label block mb-1">性別</span><Segmented value={d.sex} onChange={v => u({ sex: v })} options={[{ value: "male", label: "男性" }, { value: "female", label: "女性" }]} /></div>
              </div>
              <div><span className="label block mb-1">働き方</span><Segmented value={d.employment} onChange={v => u({ employment: v })} size="sm" options={[{ value: "employee", label: "会社員・公務員" }, { value: "selfEmployed", label: "自営業" }, { value: "none", label: "働いていない" }]} /></div>
              <div className="grid grid-cols-2 gap-3">
                {d.employment !== "none" && <NumField label="額面の年収（賞与込み）" value={d.income} unit="万円" step={10} min={0} onChange={v => u({ income: v })} />}
                {d.employment !== "none" && <NumField label="退職予定" value={d.retireAge} unit="歳" min={d.age + 1} max={80} onChange={v => u({ retireAge: v })} />}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <Toggle checked={d.hasSpouse} onChange={v => u({ hasSpouse: v })} label="配偶者・パートナーがいる" />
              {d.hasSpouse && (
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="配偶者の年齢" value={d.spouseAge} unit="歳" min={18} max={80} onChange={v => u({ spouseAge: v })} />
                  <div><span className="label block mb-1">働き方</span><Segmented size="sm" value={d.spouseEmployment} onChange={v => u({ spouseEmployment: v })} options={[{ value: "employee", label: "会社員" }, { value: "selfEmployed", label: "自営業" }, { value: "none", label: "なし" }]} /></div>
                  {d.spouseEmployment !== "none" && <NumField label="配偶者の年収（額面）" value={d.spouseIncome} unit="万円" step={10} min={0} onChange={v => u({ spouseIncome: v })} />}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="label">子ども（いる・予定を含む）</span>
                  <div className="flex items-center gap-1">
                    {d.children.length > 0 && <button className="btn btn-outline text-xs" onClick={() => setKidsOpen(true)}><Pencil size={13} />進路・育休をまとめて編集</button>}
                    <button className="btn btn-ghost text-xs" onClick={() => u({ children: [...d.children, defaultChild(d.children.length, (d.children[d.children.length - 1]?.birthAge ?? d.age - 2) + 3)] })}>＋ 追加</button>
                  </div>
                </div>
                {d.children.length === 0 && <p className="hint mt-1">いなければそのまま次へ。追加すると、進路（学年ごとの公立/私立・下宿・大学院）や育休を「まとめて編集」で決められます。</p>}
                <div className="space-y-2 mt-2">
                  {d.children.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm ink w-12">{c.name}</span>
                      <NumField value={c.birthAge} unit="歳のとき誕生" min={15} max={60} size="sm" className="flex-1 min-w-[180px]" onChange={v => u({ children: d.children.map((x, j) => (j === i ? { ...x, birthAge: v } : x)) })} />
                      <span className="hint w-20">{c.birthAge <= d.age ? `現在 ${d.age - c.birthAge}歳` : `${c.birthAge - d.age}年後`}</span>
                      <button className="btn btn-ghost text-xs px-2" onClick={() => u({ children: d.children.filter((_, j) => j !== i) })}>削除</button>
                      <button className="hint w-full text-left pl-14 hover:underline" onClick={() => { setKidsFocus(c.id); setKidsOpen(true); }}>{pathSummary(c)}{c.leaveMonthsSelf + c.leaveMonthsSpouse > 0 && `・育休 本人${c.leaveMonthsSelf}ヶ月/配偶者${c.leaveMonthsSpouse}ヶ月`}</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <NumField label="基本生活費（世帯・月額）" value={d.living} unit="万円/月" step={1} min={0} onChange={v => u({ living: v })} help="食費・光熱費・通信・日用品・交際費など。家賃・ローン・教育費・保険は除く。" />
              <NumField label="いまの貯蓄・投資の合計" value={d.cash} unit="万円" step={50} min={0} onChange={v => u({ cash: v })} help="ざっくりで OK。あとで現金・NISA・DC に分けられます。" />
              {d.employment === "employee" && <NumField label="企業型DC・iDeCo の掛金" value={d.dcMonthly} unit="円/月" step={1000} min={0} max={75000} onChange={v => u({ dcMonthly: v })} help="なければ 0。" />}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <div><span className="label block mb-1">住まい</span><Segmented value={d.housing} onChange={v => u({ housing: v })} size="sm" options={[{ value: "rent", label: "賃貸のまま" }, { value: "planToBuy", label: "いずれ購入" }, { value: "own", label: "持ち家（ローン中含む）" }]} /></div>
              {d.housing === "rent" && <NumField label="家賃" value={d.rent} unit="万円/月" step={0.5} min={0} onChange={v => u({ rent: v })} />}
              {d.housing === "planToBuy" && (
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="いまの家賃" value={d.rent} unit="万円/月" step={0.5} min={0} onChange={v => u({ rent: v })} />
                  <NumField label="購入する年齢" value={d.buyAge} unit="歳" min={d.age + 1} max={70} onChange={v => u({ buyAge: v })} />
                  <NumField label="物件価格" value={d.price} unit="万円" step={100} min={0} onChange={v => u({ price: v })} />
                  <NumField label="頭金" value={d.downPayment} unit="万円" step={50} min={0} onChange={v => u({ downPayment: v })} />
                </div>
              )}
              {d.housing === "own" && (
                <div className="grid grid-cols-2 gap-3">
                  <NumField label="物件価格（購入時）" value={d.price} unit="万円" step={100} min={0} onChange={v => u({ price: v })} />
                  <NumField label="頭金" value={d.downPayment} unit="万円" step={50} min={0} onChange={v => u({ downPayment: v })} />
                  <NumField label="購入した年齢" value={d.buyAge} unit="歳" min={18} max={d.age} onChange={v => u({ buyAge: v })} />
                  <p className="hint col-span-2">35年・変動 0.6%（10年後 1.6%）で仮定。金利・期間はあとで調整できます。</p>
                </div>
              )}
              {preview && (
                <div className="rounded-xl p-3 text-sm" style={{ background: "var(--accent-soft)" }}>
                  <div className="font-medium ink">プレビュー</div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <div><div className="ink-3">{d.retireAge}歳の純資産</div><div className="font-semibold tabular">{preview.summary.retirementNetWorth != null ? fmtMan(preview.summary.retirementNetWorth) : "–"}</div></div>
                    <div><div className="ink-3">資産が底をつく年齢</div><div className={cx("font-semibold", preview.summary.depletionAge != null && "text-[var(--critical)]")}>{preview.summary.depletionAge != null ? `${preview.summary.depletionAge}歳` : "なし"}</div></div>
                    <div><div className="ink-3">スコア</div><div className="font-semibold">{preview.summary.healthScore}</div></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t line flex items-center justify-between">
          <button onClick={() => setStep(s => s - 1)} disabled={step === 0} className="btn btn-ghost"><ArrowLeft size={15} />戻る</button>
          {step < STEPS.length - 1
            ? <button onClick={() => setStep(s => s + 1)} className="btn btn-primary">次へ<ArrowRight size={15} /></button>
            : <div className="flex items-center gap-2">
                <button onClick={() => finish(true)} className="btn btn-outline" title="住まいの詳細・運用・イベント・万一の備えなど、すべての項目を順番に入力">続けて詳しく入力</button>
                <button onClick={() => finish(false)} className="btn btn-primary">結果を見る<ArrowRight size={15} /></button>
              </div>}
        </div>
      </div>
      <ChildrenEditorModal open={kidsOpen} onClose={() => setKidsOpen(false)} plan={built} focus={kidsFocus} setFocus={setKidsFocus} update={updateKids} />
    </div>,
    document.body,
  );
}

export function buildPlan(base: Plan, d: Draft): Plan {
  // 名前・年金開始年齢・ふるさと納税など、ウィザードで聞かない項目は既存の値を引き継ぐ
  const self = defaultMember({ ...base.self, name: base.self.name || "本人", age: d.age, sex: d.sex, employment: d.employment, retireAge: d.retireAge, income: [{ age: d.age, value: d.employment === "none" ? 0 : d.income }] });
  self.dc = { ...self.dc, company: d.dcMonthly > 0 ? [{ age: d.age, value: d.dcMonthly }] : [] };
  const spouse = d.hasSpouse
    ? defaultMember({ ...(base.spouse ?? {}), name: base.spouse?.name || "配偶者", age: d.spouseAge, sex: base.spouse?.sex ?? (d.sex === "male" ? "female" : "male"), employment: d.spouseEmployment, income: [{ age: d.spouseAge, value: d.spouseEmployment === "none" ? 0 : d.spouseIncome }] })
    : null;
  const housing = d.housing === "rent"
    ? [{ ...defaultHousingPhase(d.age, "rent"), rentMonthly: d.rent, movingCost: 0 }]
    : d.housing === "planToBuy"
      ? [{ ...defaultHousingPhase(d.age, "rent"), rentMonthly: d.rent, movingCost: 0 }, { ...defaultHousingPhase(d.buyAge, "own"), property: defaultProperty({ price: d.price, downPayment: d.downPayment }) }]
      : [{ ...defaultHousingPhase(d.buyAge, "own"), movingCost: 0, property: defaultProperty({ price: d.price, downPayment: d.downPayment }) }];
  return {
    ...base,
    self, spouse,
    // 出生年齢が同じ子は既存の設定（進路など）を残す
    children: d.children,
    living: { ...base.living, monthly: [{ age: d.age, value: d.living }] },
    housing,
    // 貯蓄合計が変わったときだけ現金に寄せる（内訳を保っている既存プランはそのまま）
    assets: Math.round(base.assets.cash + base.assets.taxable + base.assets.nisaSelf + (base.assets.nisaSpouse ?? 0)) === d.cash ? base.assets : { ...base.assets, cash: d.cash, taxable: 0, taxableCost: 0, nisaSelf: 0, nisaSelfCost: 0, nisaSpouse: 0, nisaSpouseCost: 0 },
    invest: { ...base.invest, nisaAnnualCapSpouse: spouse ? base.invest.nisaAnnualCapSpouse : 0 },
  };
}
