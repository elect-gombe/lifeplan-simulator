/**
 * Simulation-wide constants (housing loan deduction, taxable account tax rate,
 * working-pension thresholds, post-retirement social insurance rates).
 */
/** 住宅ローン控除: 期間（年） */
export const HOUSING_LOAN_DEDUCTION_YEARS = 13;
/** 住宅ローン控除: 控除率 */
export const HOUSING_LOAN_DEDUCTION_RATE = 0.007;
/** 住宅ローン控除: 年間上限（円） */
export const HOUSING_LOAN_DEDUCTION_MAX = 350000;
/** 特定口座の譲渡益税率 */
export const TAXABLE_ACCOUNT_TAX_RATE = 0.20315;
/** 在職老齢年金: 支給停止基準額(円/月) — Phase 12: 年齢別に適用 */
export const WORKING_PENSION_THRESHOLD_UNDER65 = 280000;  // 60-64歳: 低在老
export const WORKING_PENSION_THRESHOLD_OVER65 = 470000;   // 65歳以降: 高在老

// ===== 退職後の社会保険料（国民健康保険・介護保険・後期高齢者医療）=====
// 退職後は厚生年金・雇用保険・子育て支援金はなし
// 国民健康保険: 所得割（前年所得ベース）+ 均等割。自治体差が大きいが概算で所得の約8-10%
// 75歳〜: 後期高齢者医療制度（所得割約8%+均等割）
// 介護保険（65歳〜）: 第1号被保険者。所得段階別だが概算で年金の約2%
export const NHI_RATE = 0.10;              // 国民健康保険 概算所得割率（均等割込み）
export const LATE_ELDERLY_RATE = 0.09;     // 後期高齢者医療 概算率
export const NURSING_1ST_RATE = 0.02;      // 介護保険 第1号被保険者 概算率
export const LATE_ELDERLY_AGE = 75;        // 後期高齢者医療 開始年齢
