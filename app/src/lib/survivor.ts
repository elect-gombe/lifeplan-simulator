// ===== Pension-related constants (令和6年度基準) =====
/** 遺族基礎年金 基本額（円/年） */
const SURVIVOR_BASIC_PENSION_BASE = 816000;
/** 遺族基礎年金 子の加算（第1子・第2子、円/年） */
const SURVIVOR_CHILD_ADDITION_1ST_2ND = 234800;
/** 遺族基礎年金 子の加算（第3子以降、円/年） */
const SURVIVOR_CHILD_ADDITION_3RD_PLUS = 78300;
/** 報酬比例部分の乗率 (5.481/1000) */
export const PENSION_RATE_PER_MILLE = 5.481;
/** 標準報酬月額の上限（円/月） */
const STANDARD_MONTHLY_SALARY_CAP = 650000;
/** 短期要件のみなし月数 */
const MIN_CONTRIBUTION_MONTHS = 300;
/** 遺族厚生年金の給付乗率 (3/4) */
const SURVIVOR_EMPLOYEE_PENSION_RATIO = 3 / 4;
/** 中高齢寡婦加算 満額（円/年）— 令和6年度: 612,000→令和7年度: 623,800 */
const WIDOW_SUPPLEMENT_FULL = 623800;
/** 中高齢寡婦加算 段階的廃止: 施行年度（令和10年=2028） */
const WIDOW_SUPPLEMENT_REFORM_START_YEAR = 2028;
/** 中高齢寡婦加算 段階的廃止: 逓減期間（26段階で25年かけて0へ） */
const WIDOW_SUPPLEMENT_PHASE_OUT_STEPS = 26;

// ===== 遺族年金の自動計算（令和7年度基準） =====
// 参考: 日本年金機構
// https://www.nenkin.go.jp/service/jukyu/izokunenkin/jukyu-yoken/20150424.html
//
// ■ 遺族基礎年金（国民年金法第37条〜）
//   受給要件: 子（18歳到達年度末まで、または20歳未満で障害1-2級）のある配偶者
//   年額: 816,000円（令和6年度）+ 子の加算
//     第1子・第2子: 各234,800円
//     第3子以降:    各 78,300円
//   子が全員18歳超になると支給終了
//
// ■ 遺族厚生年金（厚生年金保険法第58条〜）
//   報酬比例部分 = 平均標準報酬額 × 5.481/1000 × 被保険者期間月数
//   ※短期要件: 被保険者期間300月未満 → 300月みなし
//   遺族厚生年金 = 報酬比例部分 × 3/4
//   ※平均標準報酬額の上限: 等級50（650,000円/月）
//
// ■ 中高齢寡婦加算（厚生年金保険法第62条、改正法附則第15条）
//   要件: 夫死亡時に40歳以上65歳未満の妻で、遺族基礎年金を受給できない
//        （子がいないor子が全員18歳超）
//   満額: 623,800円/年（令和7年度）
//   65歳になると終了（老齢基礎年金に切り替え）
//
//   【令和7年改正 — 段階的廃止（令和10年4月施行）】
//   ・2028年4月以降に新たに受給権が発生する場合、逓減率を適用
//   ・逓減率 = (26 - 経過年数) / 26  （経過年数 = 死亡年度 - 2027）
//     2028年度(経過1年): 25/26 ≒ 0.962
//     2029年度(経過2年): 24/26 ≒ 0.923
//     ...
//     2052年度(経過25年): 1/26 ≒ 0.038
//     2053年度以降: 0（完全廃止）
//   ・既受給者（2028年3月以前に受給権発生）は満額のまま
//   ・逓減率は「死亡日が属する年度」で確定し、受給中は変わらない
//
export function calcSurvivorPension(
  avgAnnualSalary: number,
  contributionYears: number,
  childAges: number[],
  survivorAge?: number,      // 遺族（配偶者）の現在年齢
  survivorIsFemale: boolean = true, // 遺族が女性か（中高齢寡婦加算は妻のみ）
  deathCalendarYear?: number, // 死亡した暦年（段階的廃止の逓減率算定用）
): { basic: number; employee: number; widowSupplement: number; total: number; detail: string } {
  // 18歳以下の子の数
  const eligibleChildren = childAges.filter(a => a >= 0 && a < 18).length;

  // ■ 遺族基礎年金
  // 65歳以降は自分の老齢基礎年金に切り替わるため、遺族基礎年金は支給されない
  let basic = 0;
  if (eligibleChildren > 0 && (survivorAge == null || survivorAge < 65)) {
    basic = SURVIVOR_BASIC_PENSION_BASE;
    for (let i = 0; i < eligibleChildren; i++) {
      basic += i < 2 ? SURVIVOR_CHILD_ADDITION_1ST_2ND : SURVIVOR_CHILD_ADDITION_3RD_PLUS;
    }
  }

  // ■ 遺族厚生年金
  const avgMonthly = Math.min(avgAnnualSalary / 12, STANDARD_MONTHLY_SALARY_CAP);
  const months = Math.max(contributionYears * 12, MIN_CONTRIBUTION_MONTHS);
  const reportProportion = avgMonthly * PENSION_RATE_PER_MILLE / 1000 * months;
  const employee = Math.round(reportProportion * SURVIVOR_EMPLOYEE_PENSION_RATIO);

  // ■ 中高齢寡婦加算（妻のみ対象）
  // 令和7年改正: 2028年度以降の新規受給は26分の1ずつ逓減、2053年度に完全廃止
  let widowSupplement = 0;
  let widowTaperRate = 1; // 逓減率（1=満額, 0=廃止）
  if (survivorIsFemale && survivorAge != null && eligibleChildren === 0 && survivorAge >= 40 && survivorAge < 65) {
    if (deathCalendarYear != null && deathCalendarYear >= WIDOW_SUPPLEMENT_REFORM_START_YEAR) {
      // 2028年度以降: 段階的逓減
      const elapsedYears = deathCalendarYear - WIDOW_SUPPLEMENT_REFORM_START_YEAR + 1; // 2028→1, 2029→2, ...
      const remaining = WIDOW_SUPPLEMENT_PHASE_OUT_STEPS - elapsedYears; // 26-1=25, 26-2=24, ...
      widowTaperRate = Math.max(remaining, 0) / WIDOW_SUPPLEMENT_PHASE_OUT_STEPS;
    }
    // widowTaperRate: 2027以前→1.0, 2028→25/26, ..., 2052→1/26, 2053以降→0
    widowSupplement = Math.round(WIDOW_SUPPLEMENT_FULL * widowTaperRate);
  }

  const total = basic + employee + widowSupplement;

  // 詳細テキスト
  const parts: string[] = [];
  if (basic > 0) parts.push(`基礎${Math.round(basic / 10000)}万(子${eligibleChildren}人)`);
  parts.push(`厚生${Math.round(employee / 10000)}万`);
  if (widowSupplement > 0) {
    const taperPct = Math.round(widowTaperRate * 100);
    parts.push(`寡婦加算${Math.round(widowSupplement / 10000)}万${taperPct < 100 ? `(${taperPct}%)` : ""}`);
  }

  return { basic, employee, widowSupplement, total, detail: parts.join("+") };
}
