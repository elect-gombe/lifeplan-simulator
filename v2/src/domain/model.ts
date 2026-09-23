/**
 * ドメインモデル: ユーザーが編集する「プラン」の型定義。
 *
 * 単位の約束:
 *  - 金額は原則「万円」（ユーザー入力の単位）。engine 側で円に変換する。
 *  - DC/iDeCo の掛金だけは慣習に合わせて「円/月」。
 *  - 年齢はすべて「本人（self）の年齢」を軸にする。配偶者・子の年齢は差分から導出。
 *  - 率は % 表記（4 = 4%）。
 */

/** 年齢ごとに値が変わる階段状の系列。age 昇順。最初の要素より前の年齢は最初の値を使う。 */
export type Schedule = { age: number; value: number }[];

export type Sex = "male" | "female";
export type Employment = "employee" | "selfEmployed" | "none";

export interface DcReceive {
  method: "lump" | "annuity" | "mixed";
  startAge: number;      // 受取開始年齢（60〜75）
  annuityYears: number;  // 年金受取の年数
  lumpRatioPct: number;  // 併用時の一時金割合
}

export interface Member {
  name: string;
  age: number;
  sex: Sex;
  employment: Employment;
  workStartAge: number;   // 厚生年金加入開始（就職）年齢
  retireAge: number;      // 給与収入が止まる年齢
  income: Schedule;       // 額面年収（万円/年）
  incomeGrowthPct: number; // 各スケジュール区間内での昇給率（%/年）
  pensionStartAge: number; // 公的年金の受給開始年齢（60〜75）
  dc: {
    company: Schedule;   // 企業型DC 事業主掛金（円/月、給与に含まれない）
    matching: Schedule;  // 選択制DC / マッチング拠出（円/月、給与から拠出＝所得・社保の対象外）
    ideco: Schedule;     // iDeCo（円/月、所得控除）
    receive: DcReceive;
  };
  /** 社会保険の加入: auto = 年収で判定（106万以上で加入／130万未満かつ配偶者が会社員なら被扶養者）、join = 必ず加入、dependent = 被扶養者 */
  socialInsurance: "auto" | "join" | "dependent";
  furusato: boolean;      // ふるさと納税を上限まで行う
  severancePay: number;   // 退職一時金（万円、退職年に受取。退職所得課税）
  deathBenefit: number;   // 死亡退職金・弔慰金（万円、在職中に死亡した年に遺族へ。相続税のみなし財産）
}

export type StageKey = "nursery" | "kinder" | "elementary" | "middle" | "high" | "university" | "grad";
export type SchoolKind = "public" | "private";
export type LivingAway = "home" | "rural" | "urban";

export interface EducationStage {
  enabled: boolean;
  kind: SchoolKind;
  away?: LivingAway;      // 大学・大学院のみ
  annualOverride?: number; // 万円/年。未設定なら標準値
}

export interface Child {
  id: string;
  name: string;
  birthAge: number;       // 本人の年齢（過去でもよい: 現在すでに生まれている子）
  education: Record<StageKey, EducationStage>;
  leaveMonthsSelf: number;   // 本人の育休月数
  leaveMonthsSpouse: number; // 配偶者の育休月数
}

export interface ChildrenCommon {
  birthCost: number;        // 出産一時費用（万円）
  careMonthly: number;      // 教育費以外の養育費（万円/月/人、独立まで）
  independenceAge: number;  // 子が独立する年齢（養育費・生活費減額の基準）
  leaveBenefit: boolean;    // 育児休業給付金を受給する
  /** 育休復帰後の時短勤務（本人・配偶者を個別に設定） */
  returnSelf: ReturnToWork;
  returnSpouse: ReturnToWork;
}

/** 育休復帰後の働き方。ratioPct = 復帰後の年収比率（100 で時短なし）、years = 適用年数（0 で適用なし） */
export interface ReturnToWork { ratioPct: number; years: number }

export interface Living {
  monthly: Schedule;             // 基本生活費（万円/月、住居費・教育費・保険を除く）
  retirementMonthly: number | null; // 年金受給開始後の基本生活費（万円/月）。null で継続
  reductionPerChildPct: number;  // 子1人が独立するごとに生活費を減らす率（%）
  survivorPct: number;           // 世帯主または配偶者死亡後の生活費（%）
  /** 内訳で入力するモード。true のとき monthly の現在値（先頭）は items の合計に同期される */
  detailed: boolean;
  /** 生活費の内訳（万円/月）。detailed=false でも保持し、切り替え時に使う */
  items: LivingItem[];
}

export interface LivingItem { key: string; label: string; monthly: number }

/** 生活費の内訳カテゴリ（家計調査の 10 大費目から住居・教育・保険・車を除いたもの＋こづかい） */
export const LIVING_ITEM_PRESET: { key: string; label: string; hint: string }[] = [
  { key: "food", label: "食費", hint: "食料・外食" },
  { key: "electricity", label: "電気代", hint: "" },
  { key: "gas", label: "ガス代", hint: "" },
  { key: "water", label: "水道代", hint: "" },
  { key: "telecom", label: "通信費", hint: "スマホ・ネット・NHK・サブスク" },
  { key: "daily", label: "日用品・家具家事", hint: "消耗品・家電の買い替え" },
  { key: "clothing", label: "被服・美容", hint: "" },
  { key: "medical", label: "医療・保健", hint: "医療費・薬・サプリ" },
  { key: "transport", label: "交通費", hint: "電車・バス・タクシー（車は「イベント」で）" },
  { key: "leisure", label: "教養・娯楽", hint: "趣味・旅行・書籍" },
  { key: "social", label: "交際費", hint: "" },
  { key: "allowance", label: "こづかい", hint: "" },
  { key: "other", label: "その他", hint: "" },
];

/** 統計データ（総務省 家計調査 2024 年 二人以上の世帯・単身世帯の月平均。住居・教育・自動車・保険を除いた概算、万円/月） */
export const LIVING_STATS: Record<"family" | "single", Record<string, number>> = {
  family: { food: 8.8, electricity: 1.3, gas: 0.5, water: 0.5, telecom: 1.3, daily: 1.3, clothing: 0.9, medical: 1.5, transport: 0.8, leisure: 2.9, social: 1.6, allowance: 1.0, other: 2.0 },
  single: { food: 4.4, electricity: 0.7, gas: 0.3, water: 0.2, telecom: 0.8, daily: 0.6, clothing: 0.5, medical: 0.8, transport: 0.6, leisure: 2.0, social: 1.2, allowance: 0.5, other: 1.5 },
};

export function defaultLivingItems(): LivingItem[] {
  return LIVING_ITEM_PRESET.map(p => ({ key: p.key, label: p.label, monthly: 0 }));
}

export const livingItemsTotal = (items: LivingItem[]): number => Math.round(items.reduce((a, i) => a + (i.monthly || 0), 0) * 10) / 10;

export type RepaymentType = "annuity" | "principal";
export type LoanRate =
  | { kind: "fixed"; pct: number }
  | { kind: "variable"; initialPct: number; laterPct: number; changeAfterYears: number };
export type HousingDeductionType = "none" | "certified" | "zeh" | "energy" | "other" | "existing";

export interface Prepayment { age: number; amount: number; mode: "shorten" | "reduce" }

export interface Property {
  price: number;               // 物件価格（万円）
  downPayment: number;         // 頭金（万円）
  closingCostPct: number;      // 諸費用率（% of 価格）
  loanYears: number;
  repayment: RepaymentType;
  rate: LoanRate;
  prepayments: Prepayment[];
  refinance: { age: number; pct: number; years: number; cost: number } | null;
  maintenanceMonthly: number;  // 管理費・修繕積立・修繕費（万円/月）
  propertyTaxAnnual: number;   // 固定資産税・都市計画税（万円/年）
  earthquakePremiumAnnual: number; // 地震保険料（万円/年。地震保険料控除の対象）
  deduction: HousingDeductionType;
  loanShareSelfPct: number;    // 100 = 本人単独。50 = ペアローン等分
  danshin: boolean;            // 団体信用生命保険（死亡時にローン免除）
  appreciationPct: number;     // 資産価値の年変動率（%）
  landRatioPct: number;        // 価格に占める土地の割合（%）。相続税評価と小規模宅地等の特例に使う
  landAreaSqm: number;         // 土地面積（㎡）。小規模宅地等の特例の 330㎡ 上限判定に使う
  smallLotRelief: boolean;     // 小規模宅地等の特例（配偶者・同居親族が取得する前提）
  salePrice: number | null;    // 売却価格（万円）。null なら価格×変動率
}

export interface HousingPhase {
  id: string;
  startAge: number;
  kind: "rent" | "own";
  rentMonthly: number;   // kind=rent
  movingCost: number;    // フェーズ開始時の引越し・初期費用（万円）
  property: Property;    // kind=own
}

export interface InitialAssets {
  cash: number;                 // 預貯金（万円）
  taxable: number;              // 特定口座 時価（万円）
  taxableCost: number;          // 特定口座 取得価額（万円）
  nisaSelf: number;             // NISA 時価（万円）
  nisaSelfCost: number;         // NISA 取得価額（万円）
  nisaSpouse: number;
  nisaSpouseCost: number;
  dcSelf: number;               // DC/iDeCo 残高（万円）
  dcSpouse: number;
}

export interface InvestPolicy {
  nisaEnabled: boolean;
  nisaAnnualCapSelf: number;    // 万円/年（つみたて＋成長 最大360）
  nisaAnnualCapSpouse: number;
  nisaLifetimeCap: number;      // 万円（1800）
  reserveMonths: number;        // 生活防衛資金の下限（生活費×月数）。割り込むと取り崩し
  reserveMaxMonths: number;     // これを超える現金は投資に回す
  useTaxableWhenNisaFull: boolean; // NISA枠を使い切ったら特定口座で運用
  returns: { nisaPct: number; taxablePct: number; dcPct: number; cashPct: number };
  volatilityPct: number;        // モンテカルロ用 年率標準偏差
  /** 取り崩す口座の順番。taxableFirst = 特定口座→NISA（非課税枠を長く残す）、nisaFirst = NISA→特定口座、proportional = 残高比例 */
  withdrawalOrder: WithdrawalOrder;
  /** 計画的な取り崩し（老後の定率・定額）。asNeeded = 現金が下限を割ったときだけ売る（従来） */
  withdrawal: WithdrawalPlan;
  /** 目標貯蓄: 「○歳までに○万円を現金で用意する」。期間中は現金のキープ上限を段階的に引き上げ、余剰を投資に回さず現金で積み立てる */
  cashGoals: CashGoal[];
}

export interface CashGoal {
  id: string;
  label: string;
  age: number;            // 使う年（本人年齢）。この年の頭までに用意する
  amount: number;         // 万円（現在価格）
  inflate: boolean;       // 目標額をインフレ連動させる
  years: number;          // 積立期間（年）。age − years の年から積み始める
  fromInvestments: boolean; // 収支の余剰で足りない分を運用資産から毎年少しずつ移す（オフなら余剰の範囲で積み立て、不足は使う年に売却）
}

export type WithdrawalOrder = "taxableFirst" | "nisaFirst" | "proportional";
export interface WithdrawalPlan {
  mode: "asNeeded" | "fixedRate" | "fixedAmount";
  startAge: number;         // この本人年齢から毎年取り崩す
  ratePct: number;          // fixedRate: 年初の運用資産（NISA＋特定）に対する割合（%/年）
  amount: number;           // fixedAmount: 年額（万円、開始時点の物価。インフレ連動）
  stopInvesting: boolean;   // 開始後は余剰現金を投資に回さない（現金のまま持つ）
}

export type EventKind = "expense" | "income" | "car" | "insurance" | "death";

interface EventBase { id: string; kind: EventKind; label: string; enabled: boolean }

export interface CashEvent extends EventBase {
  kind: "expense" | "income";
  startAge: number;
  years: number;         // 1 = 単発
  every: number;         // N年ごと（1 = 毎年）
  amount: number;        // 万円（年額 or 単発額）
  inflate: boolean;      // インフレ連動
  taxable: boolean;      // income のみ: 雑所得として課税
  stopOnSelfDeath: boolean;
}

export interface CarEvent extends EventBase {
  kind: "car";
  startAge: number;
  endAge: number;
  price: number;             // 万円
  loanYears: number;         // 0 = 一括
  loanRatePct: number;
  replaceEveryYears: number; // 0 = 買い替えなし
  runningAnnual: number;     // 維持費（税・保険・駐車場・燃料 万円/年）
}

export interface InsuranceEvent extends EventBase {
  kind: "insurance";
  member: "self" | "spouse";
  type: "term" | "incomeProtection";
  /** 生命保険料控除の区分（一般・介護医療・個人年金）。各区分 所得税 4 万 / 住民税 2.8 万が上限 */
  deductionType: "general" | "medical" | "pension";
  startAge: number;          // 本人年齢
  endAge: number;            // 保険期間終了（本人年齢）
  premiumMonthly: number;    // 万円/月
  payout: number;            // term: 一時金（万円） / incomeProtection: 月額（万円/月）
  payoutUntilAge: number;    // incomeProtection: 何歳（本人年齢）まで
}

export interface DeathEvent extends EventBase {
  kind: "death";
  member: "self" | "spouse";
  age: number;               // 本人年齢
}

export type LifeEvent = CashEvent | CarEvent | InsuranceEvent | DeathEvent;

export interface Economy {
  inflationPct: number;     // 物価上昇率（生活費・教育費など）
  macroSlidePct: number;    // 年金のマクロ経済スライド調整率（負）
  landValuationPct: number;     // 土地の相続税評価額 ÷ 時価（%）。路線価はおおむね時価の 8 割
  buildingValuationPct: number; // 建物の相続税評価額 ÷ 時価（%）。固定資産税評価額はおおむね 6 割
  stressTest: { enabled: boolean; age: number; dropPct: number; recoveryYears: number };
}

/** リンクの単位（入力パネルのセクションに対応） */
export type LinkGroup = "family" | "income" | "living" | "housing" | "children" | "invest" | "events" | "risk" | "settings";

/** 別プランへのリンク。overrides に含まれないグループはベースプランの値をそのまま使う。 */
export interface PlanLink { baseId: string; overrides: LinkGroup[] }

export interface Plan {
  id: string;
  name: string;
  color: string;
  link?: PlanLink | null;   // 未設定 = 独立したプラン
  baseYear: number;         // 本人が self.age 歳である暦年
  endAge: number;           // シミュレーション最終年齢（この年齢まで含む）
  self: Member;
  spouse: Member | null;
  children: Child[];
  childrenCommon: ChildrenCommon;
  living: Living;
  housing: HousingPhase[];
  assets: InitialAssets;
  invest: InvestPolicy;
  events: LifeEvent[];
  economy: Economy;
  funeralCost: number;      // 葬儀費用（万円）
}

// ─────────────────────────────────────────────────────────────
// Factories / defaults
// ─────────────────────────────────────────────────────────────

let idCounter = 0;
export function newId(prefix = "id"): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export const DEFAULT_DC_RECEIVE: DcReceive = { method: "lump", startAge: 65, annuityYears: 20, lumpRatioPct: 50 };

export function defaultMember(partial: Partial<Member> = {}): Member {
  const age = partial.age ?? 35;
  return {
    name: "本人",
    age,
    sex: "male",
    employment: "employee",
    workStartAge: 22,
    retireAge: 65,
    income: [{ age, value: 600 }],
    incomeGrowthPct: 1,
    pensionStartAge: 65,
    dc: { company: [], matching: [], ideco: [], receive: { ...DEFAULT_DC_RECEIVE } },
    socialInsurance: "auto",
    furusato: false,
    severancePay: 0,
    deathBenefit: 0,
    ...partial,
  };
}

export const STAGE_ORDER: StageKey[] = ["nursery", "kinder", "elementary", "middle", "high", "university", "grad"];

export function defaultEducation(preset: "public" | "privateUniv" | "private" = "public"): Record<StageKey, EducationStage> {
  const pub = (): EducationStage => ({ enabled: true, kind: "public" });
  const priv = (): EducationStage => ({ enabled: true, kind: "private" });
  const base: Record<StageKey, EducationStage> = {
    nursery: pub(), kinder: pub(), elementary: pub(), middle: pub(), high: pub(),
    university: { enabled: true, kind: "public", away: "home" },
    grad: { enabled: false, kind: "public", away: "home" },
  };
  if (preset === "privateUniv") base.university = { enabled: true, kind: "private", away: "home" };
  if (preset === "private") {
    base.kinder = priv(); base.elementary = priv(); base.middle = priv(); base.high = priv();
    base.university = { enabled: true, kind: "private", away: "home" };
  }
  return base;
}

export function defaultChild(index: number, birthAge: number): Child {
  return {
    id: newId("child"),
    name: `第${index + 1}子`,
    birthAge,
    education: defaultEducation("privateUniv"),
    leaveMonthsSelf: 0,
    leaveMonthsSpouse: 12,
  };
}

export function defaultProperty(partial: Partial<Property> = {}): Property {
  return {
    price: 5000,
    downPayment: 500,
    closingCostPct: 7,
    loanYears: 35,
    repayment: "annuity",
    rate: { kind: "variable", initialPct: 0.6, laterPct: 1.6, changeAfterYears: 10 },
    prepayments: [],
    refinance: null,
    maintenanceMonthly: 2.5,
    propertyTaxAnnual: 15,
    earthquakePremiumAnnual: 0,
    deduction: "energy",
    loanShareSelfPct: 100,
    danshin: true,
    appreciationPct: -1.5,
    landRatioPct: 60,
    landAreaSqm: 100,
    smallLotRelief: true,
    salePrice: null,
    ...partial,
  };
}

export function defaultHousingPhase(startAge: number, kind: "rent" | "own" = "rent"): HousingPhase {
  return {
    id: newId("house"),
    startAge,
    kind,
    rentMonthly: 12,
    movingCost: kind === "rent" ? 50 : 0,
    property: defaultProperty(),
  };
}

export function defaultPlan(partial: Partial<Plan> = {}): Plan {
  const self = partial.self ?? defaultMember({ name: "本人", age: 35, sex: "male" });
  return {
    id: newId("plan"),
    name: "現状プラン",
    color: "#2a78d6",
    link: null,
    baseYear: new Date().getFullYear(),
    endAge: 95,
    self,
    spouse: null,
    children: [],
    childrenCommon: {
      birthCost: 30, careMonthly: 3, independenceAge: 22,
      leaveBenefit: true, returnSelf: { ratioPct: 100, years: 0 }, returnSpouse: { ratioPct: 100, years: 0 },
    },
    living: {
      monthly: [{ age: self.age, value: 20 }],
      retirementMonthly: null,
      reductionPerChildPct: 10,
      survivorPct: 70,
      detailed: false,
      items: defaultLivingItems(),
    },
    housing: [defaultHousingPhase(self.age, "rent")],
    assets: {
      cash: 300, taxable: 0, taxableCost: 0,
      nisaSelf: 0, nisaSelfCost: 0, nisaSpouse: 0, nisaSpouseCost: 0,
      dcSelf: 0, dcSpouse: 0,
    },
    invest: {
      nisaEnabled: true,
      nisaAnnualCapSelf: 120, nisaAnnualCapSpouse: 120, nisaLifetimeCap: 1800,
      reserveMonths: 6, reserveMaxMonths: 12,
      useTaxableWhenNisaFull: true,
      returns: { nisaPct: 4, taxablePct: 4, dcPct: 3, cashPct: 0.2 },
      volatilityPct: 12,
      withdrawalOrder: "taxableFirst",
      withdrawal: { mode: "asNeeded", startAge: 65, ratePct: 4, amount: 120, stopInvesting: true },
      cashGoals: [],
    },
    events: [],
    economy: { inflationPct: 1.5, macroSlidePct: -0.8, landValuationPct: 80, buildingValuationPct: 60, stressTest: { enabled: false, age: 50, dropPct: 40, recoveryYears: 4 } },
    funeralCost: 200,
    ...partial,
  };
}

export const PLAN_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

/** 深いコピー（構造化クローン）。プランは plain data なので安全。 */
export function clonePlan(p: Plan): Plan {
  return structuredClone(p);
}

export function isCashEvent(e: LifeEvent): e is CashEvent { return e.kind === "expense" || e.kind === "income"; }
