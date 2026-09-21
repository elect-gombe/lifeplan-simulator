/**
 * プランのリンク: 「ベースプラン ＋ セクション単位の上書き」を 1 つの完全な Plan に解決する。
 * リンクされたプラン自身も完全な Plan データを持つが、overrides に含まれないグループの値は無視され、
 * 常にベースの現在値が使われる（ベースを編集すると連動して変わる）。
 */
import type { Plan, LinkGroup, Member } from "./model";

export const LINK_GROUPS: { key: LinkGroup; label: string }[] = [
  { key: "family", label: "家族" },
  { key: "income", label: "収入・年金" },
  { key: "living", label: "生活費・資産" },
  { key: "housing", label: "住まい" },
  { key: "children", label: "子ども" },
  { key: "invest", label: "運用" },
  { key: "events", label: "イベント" },
  { key: "risk", label: "万一" },
  { key: "settings", label: "前提" },
];

const MEMBER_BASIC = ["name", "age", "sex", "employment"] as const;
const MEMBER_INCOME = ["income", "incomeGrowthPct", "retireAge", "workStartAge", "pensionStartAge", "dc",
  "socialInsurance", "furusato", "severancePay", "deathBenefit"] as const;

// Member に項目を足したとき、どちらのグループにも入れ忘れると「入力できるのに連動プランでは保存されない」
// という気づきにくい不具合になる。未割り当てが残るとこの行が型エラーになる。
type UnassignedMemberKey = Exclude<keyof Member, (typeof MEMBER_BASIC)[number] | (typeof MEMBER_INCOME)[number]>;
const _memberKeyCoverage: [UnassignedMemberKey] extends [never] ? true : UnassignedMemberKey = true;
void _memberKeyCoverage;

function copyMemberFields(from: Member, to: Member, keys: readonly (keyof Member)[]) {
  for (const k of keys) (to as unknown as Record<string, unknown>)[k] = (from as unknown as Record<string, unknown>)[k];
}

/** from の group に属する値を to に書き込む（to を mutate） */
export function copyGroup(group: LinkGroup, from: Plan, to: Plan): void {
  switch (group) {
    case "family":
      copyMemberFields(from.self, to.self, MEMBER_BASIC);
      if (!from.spouse) to.spouse = null;
      else if (to.spouse) copyMemberFields(from.spouse, to.spouse, MEMBER_BASIC);
      else to.spouse = structuredClone(from.spouse);
      break;
    case "income":
      copyMemberFields(from.self, to.self, MEMBER_INCOME);
      if (to.spouse && from.spouse) copyMemberFields(from.spouse, to.spouse, MEMBER_INCOME);
      break;
    case "living": to.living = from.living; to.assets = from.assets; break;
    case "housing": to.housing = from.housing; break;
    case "children": to.children = from.children; to.childrenCommon = from.childrenCommon; break;
    case "invest": to.invest = from.invest; break;
    case "events": to.events = [...from.events.filter(e => e.kind !== "death"), ...to.events.filter(e => e.kind === "death")]; break;
    case "risk":
      to.events = [...to.events.filter(e => e.kind !== "death"), ...from.events.filter(e => e.kind === "death")];
      to.funeralCost = from.funeralCost;
      to.economy = { ...to.economy, stressTest: from.economy.stressTest };
      break;
    case "settings":
      to.endAge = from.endAge; to.baseYear = from.baseYear;
      to.economy = { ...to.economy, inflationPct: from.economy.inflationPct, macroSlidePct: from.economy.macroSlidePct };
      break;
  }
}

/** リンクを解決した完全なプランを返す。独立プランやベースが見つからない場合はそのまま。 */
export function resolvePlan(plan: Plan, plans: Plan[]): Plan {
  if (!plan.link) return plan;
  const base = plans.find(p => p.id === plan.link!.baseId);
  if (!base || base.id === plan.id) return plan;
  const baseResolved = base.link ? resolvePlan(base, plans.filter(p => p.id !== plan.id)) : base;
  const out = structuredClone(baseResolved);
  out.id = plan.id; out.name = plan.name; out.color = plan.color; out.link = plan.link;
  for (const g of plan.link.overrides) copyGroup(g, plan, out);
  return out;
}

/**
 * 解決結果のキャッシュ: 自分のデータ（raw）とベースの解決結果の両方が同一オブジェクトなら、前回と同じオブジェクトを返す。
 * これにより、無関係なプランの編集や名称変更で他プランの解決結果が別オブジェクトにならず、下流の memo / シミュレーションキャッシュが効く。
 */
const resolveCache = new WeakMap<Plan, { base: Plan; out: Plan }>();
let lastResolved: Plan[] = [];

export function resolveAll(plans: Plan[]): Plan[] {
  const next = resolveAllUncached(plans);
  // 全要素が前回と同一なら配列も前回のものを返す（下流の useMemo が効く）
  if (next.length === lastResolved.length && next.every((p, i) => p === lastResolved[i])) return lastResolved;
  lastResolved = next;
  return next;
}

function resolveAllUncached(plans: Plan[]): Plan[] {
  return plans.map(p => {
    if (!p.link) return p;
    const base = plans.find(b => b.id === p.link!.baseId);
    if (!base || base.id === p.id) return p;
    const baseResolved = base.link ? resolvePlan(base, plans.filter(x => x.id !== p.id)) : base;
    const hit = resolveCache.get(p);
    if (hit && hit.base === baseResolved) return hit.out;
    const out = resolvePlan(p, plans);
    resolveCache.set(p, { base: baseResolved, out });
    return out;
  });
}

/** リンクを外して独立したプランにする（解決済みの値を固定） */
export function materialize(plan: Plan, plans: Plan[]): Plan {
  const r = resolvePlan(plan, plans);
  return { ...r, link: null };
}

/** group をこのプランで上書きする: 現在の解決値を自分のデータにコピーしてから overrides に追加 */
export function overrideGroup(plan: Plan, plans: Plan[], group: LinkGroup): Plan {
  if (!plan.link || plan.link.overrides.includes(group)) return plan;
  const resolved = resolvePlan(plan, plans);
  const own = structuredClone(plan);
  // income を上書きするのに自分側に配偶者がいない場合は、解決値の配偶者を丸ごと持つ（家族グループが連動でもベースの配偶者を編集できるように）
  if (group === "income" && resolved.spouse && !own.spouse) own.spouse = structuredClone(resolved.spouse);
  copyGroup(group, resolved, own);
  own.link = { ...plan.link, overrides: [...plan.link.overrides, group] };
  return own;
}

/** group の上書きをやめてベースに再連動する */
export function relinkGroup(plan: Plan, group: LinkGroup): Plan {
  if (!plan.link) return plan;
  return { ...plan, link: { ...plan.link, overrides: plan.link.overrides.filter(g => g !== group) } };
}

export function isGroupLinked(plan: Plan, group: LinkGroup): boolean {
  return !!plan.link && !plan.link.overrides.includes(group);
}
