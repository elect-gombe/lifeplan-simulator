/**
 * 制度定数（2025年度〜の恒久ルールを基準。年度改定される値はここに集約）。
 * 単位はすべて円。
 */
export const MAN = 10_000;

// ── 所得税 ──────────────────────────────────────────────
export const INCOME_TAX_BRACKETS: { upTo: number; rate: number; deduction: number }[] = [
  { upTo: 1_950_000, rate: 0.05, deduction: 0 },
  { upTo: 3_300_000, rate: 0.10, deduction: 97_500 },
  { upTo: 6_950_000, rate: 0.20, deduction: 427_500 },
  { upTo: 9_000_000, rate: 0.23, deduction: 636_000 },
  { upTo: 18_000_000, rate: 0.33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 0.40, deduction: 2_796_000 },
  { upTo: Infinity, rate: 0.45, deduction: 4_796_000 },
];
export const RECONSTRUCTION_SURTAX = 1.021; // 復興特別所得税（〜2037）
export const RESIDENT_TAX_RATE = 0.10;
export const RESIDENT_TAX_PER_CAPITA = 5_000; // 均等割（森林環境税込み）
// 住民税の非課税限度額（合計所得金額ベース、1級地）。扶養親族等が n 人なら 35万×(n+1)＋加算
export const RT_EXEMPT_SINGLE = 450_000;       // 扶養なしの非課税限度額（均等割・所得割とも）
export const RT_EXEMPT_PER_PERSON = 350_000;   // 本人＋扶養親族等 1 人あたり
export const RT_EXEMPT_ADD_PER_CAPITA = 310_000; // 均等割の加算（扶養親族等がいる場合）
export const RT_EXEMPT_ADD_INCOME = 420_000;     // 所得割の加算（扶養親族等がいる場合）

/** 基礎控除（2025年改正後の恒久値）: 所得税 58万（合計所得132万以下は95万）、住民税 43万 */
export const BASIC_DEDUCTION_IT = 580_000;
export const BASIC_DEDUCTION_IT_LOW = 950_000;
export const BASIC_DEDUCTION_IT_LOW_LIMIT = 1_320_000;
export const BASIC_DEDUCTION_RT = 430_000;

// ── 給与所得控除（2025年改正: 最低 65万） ──────────────
export function employmentIncomeDeduction(gross: number): number {
  if (gross <= 1_900_000) return 650_000;
  if (gross <= 3_600_000) return gross * 0.3 + 80_000;
  if (gross <= 6_600_000) return gross * 0.2 + 440_000;
  if (gross <= 8_500_000) return gross * 0.1 + 1_100_000;
  return 1_950_000;
}

// ── 公的年金等控除（65歳未満/以上、他の所得 1000万以下） ──
export function publicPensionDeduction(pension: number, age: number): number {
  if (age >= 65) {
    if (pension <= 3_300_000) return Math.min(pension, 1_100_000);
    if (pension <= 4_100_000) return pension * 0.25 + 275_000;
    if (pension <= 7_700_000) return pension * 0.15 + 685_000;
    if (pension <= 10_000_000) return pension * 0.05 + 1_455_000;
    return 1_955_000;
  }
  if (pension <= 1_300_000) return Math.min(pension, 600_000);
  if (pension <= 4_100_000) return pension * 0.25 + 275_000;
  if (pension <= 7_700_000) return pension * 0.15 + 685_000;
  if (pension <= 10_000_000) return pension * 0.05 + 1_455_000;
  return 1_955_000;
}

// ── 人的控除 ────────────────────────────────────────────
export const DEPENDENT_GENERAL = 380_000;   // 16-18歳・23歳〜
export const DEPENDENT_SPECIFIC = 630_000;  // 19-22歳
export const DEPENDENT_GENERAL_RT = 330_000;
export const DEPENDENT_SPECIFIC_RT = 450_000;
export const SPOUSE_DEDUCTION_MAX = 380_000;
export const SPOUSE_DEDUCTION_MAX_RT = 330_000;

// ── 社会保険（被保険者負担分） ──────────────────────────
export const HEALTH_RATE_EMPLOYEE = 0.0500;       // 協会けんぽ平均 ~10%/2
export const NURSING_RATE_EMPLOYEE = 0.0080;      // 40〜64歳
export const PENSION_RATE_EMPLOYEE = 0.0915;      // 厚生年金 18.3%/2
export const EMPLOYMENT_INSURANCE_RATE = 0.0055;  // 雇用保険
export const CHILD_SUPPORT_RATE = 0.0025;         // 子ども・子育て支援金（2028年度の水準）
export const PENSION_STANDARD_MONTHLY_CAP = 650_000;  // 標準報酬月額上限
export const PENSION_BONUS_CAP_ANNUAL = 1_500_000 * 3; // 賞与上限（150万/回）を年3回まで近似
export const HEALTH_STANDARD_MONTHLY_CAP = 1_390_000;

// 国民年金・国民健康保険（自営業）
// 社会保険の加入・被扶養者の収入要件（いわゆる 106万・130万の壁）
export const SI_ENROLL_ANNUAL = 1_060_000;        // 短時間労働者の適用拡大（月額 8.8万円 × 12）
export const SI_DEPENDENT_LIMIT = 1_300_000;      // 被扶養者・第3号被保険者の収入要件
export const SI_DEPENDENT_LIMIT_SENIOR = 1_800_000; // 60歳以上・障害者

export const NATIONAL_PENSION_MONTHLY = 17_510;   // 2025年度
export const NHI_INCOME_RATE = 0.105;             // 国保 所得割（医療+支援+介護）概算
export const NHI_PER_CAPITA = 55_000;             // 均等割（円/人/年）概算
export const NHI_CAP = 1_090_000;                 // 賦課限度額（介護分込み）
export const NHI_CAP_NO_NURSING = 920_000;
// 国保 均等割の軽減（判定所得 = 総所得金額等 − 43万）
export const NHI_REDUCE_7 = 0;        // 43万以下 → 7割軽減
export const NHI_REDUCE_5 = 305_000;  // 43万＋30.5万×被保険者数 以下 → 5割軽減
export const NHI_REDUCE_2 = 560_000;  // 43万＋56万×被保険者数 以下 → 2割軽減
export const LATE_ELDERLY_AGE = 75;
export const LATE_ELDERLY_RATE = 0.09;            // 後期高齢者医療 所得割概算
export const LATE_ELDERLY_PER_CAPITA = 50_000;
export const NURSING_65_PLUS_RATE = 0.02;         // 第1号被保険者 概算（所得比）
export const NURSING_65_PLUS_MIN = 60_000;

// ── 公的年金（令和7年度） ───────────────────────────────
export const BASIC_PENSION_FULL = 831_700;          // 老齢基礎年金 満額
export const BASIC_PENSION_MONTHS = 480;
export const EMPLOYEE_PENSION_MULTIPLIER = 5.481 / 1000;
export const PENSION_EARLY_RATE_PER_MONTH = 0.004;  // 繰上げ
export const PENSION_DEFER_RATE_PER_MONTH = 0.007;  // 繰下げ
export const WORKING_PENSION_THRESHOLD_MONTHLY = 510_000; // 在職老齢年金 支給停止基準（令和7年度）

// 遺族年金
export const SURVIVOR_BASIC = 831_700;
export const SURVIVOR_CHILD_ADD_1_2 = 239_300;
export const SURVIVOR_CHILD_ADD_3 = 79_800;
export const SURVIVOR_MIN_MONTHS = 300;
export const WIDOW_SUPPLEMENT = 623_800;
export const WIDOW_SUPPLEMENT_PHASEOUT_START = 2028; // 令和10年度から26年で逓減

// ── 退職所得 ────────────────────────────────────────────
export function retirementIncomeDeduction(years: number): number {
  const y = Math.max(1, Math.ceil(years));
  return y <= 20 ? Math.max(400_000 * y, 800_000) : 8_000_000 + 700_000 * (y - 20);
}

// ── 住宅ローン控除（2024〜2025入居、子育て世帯以外の恒久的水準で近似） ──
export const HOUSING_LOAN_DEDUCTION_RATE = 0.007;
export const HOUSING_LOAN_DEDUCTION: Record<string, { years: number; cap: number }> = {
  certified: { years: 13, cap: 45_000_000 },
  zeh:       { years: 13, cap: 35_000_000 },
  energy:    { years: 13, cap: 30_000_000 },
  other:     { years: 10, cap: 20_000_000 }, // 2024以降の一般住宅（中古扱いに準ずる）
  existing:  { years: 10, cap: 20_000_000 }, // 中古
};
export const HOUSING_LOAN_RT_CAP = 97_500;    // 住民税からの控除上限

// ── 金融所得 ────────────────────────────────────────────
export const CAPITAL_GAINS_TAX_RATE = 0.20315;
export const PROPERTY_GAIN_TAX_LONG = 0.20315;
export const PROPERTY_GAIN_TAX_SHORT = 0.3963;
export const RESIDENCE_SALE_SPECIAL_DEDUCTION = 30_000_000;

// ── 児童手当・教育支援 ──────────────────────────────────
export const CHILD_ALLOWANCE_UNDER3 = 15_000;
export const CHILD_ALLOWANCE_3_18 = 10_000;
export const CHILD_ALLOWANCE_THIRD = 30_000;
export const HS_SUPPORT_PUBLIC = 118_800;
export const HS_SUPPORT_PRIVATE = 457_000;   // 2026年度〜 私立上限
export const TASHI_TUITION_PUBLIC = 540_000;
export const TASHI_TUITION_PRIVATE = 700_000;
export const TASHI_ADMISSION_PUBLIC = 280_000;
export const TASHI_ADMISSION_PRIVATE = 260_000;

// ── 育児休業給付 ────────────────────────────────────────
export const LEAVE_RATE_FIRST = 0.67;
export const LEAVE_RATE_AFTER = 0.50;
export const LEAVE_FIRST_MONTHS = 6;
export const LEAVE_CAP_FIRST = 315_369;
export const LEAVE_CAP_AFTER = 235_350;

// ── 相続税 ──────────────────────────────────────────────
export const INHERITANCE_BASIC = 30_000_000;
export const INHERITANCE_PER_HEIR = 6_000_000;
export const INHERITANCE_INSURANCE_EXEMPT_PER_HEIR = 5_000_000;
export const INHERITANCE_SPOUSE_EXEMPT = 160_000_000;
