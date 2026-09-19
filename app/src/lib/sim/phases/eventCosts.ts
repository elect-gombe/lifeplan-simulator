/** Single-pass dispatcher turning active life events into yearly costs. */
import type { LifeEvent, EventYearCost, PropertyParams } from "../../types";
import { isEventActive, resolveEventAge, resolveKF } from "../../types";
import { calcPropertyCapitalGainsTax, calcGiftTax } from "../../tax";
import { buildLoanSchedule } from "../../mortgage";
import type { SimConfig, AgeEventInfo, YearContext } from "../types";
import { getLoanBalance, computePropertyYearCost } from "../propertyCosts";
import { computeCarYearCost } from "../carCosts";

// ===== phaseEventCosts: Single-pass event cost dispatcher =====
export interface EventCostOutput {
  eventOngoing: number;
  eventOnetime: number;
  eventCostBreakdown: EventYearCost[];
  baseLivingExpense: number;
  totalExpense: number;
  insurancePremiumTotal: number;
  insurancePremiumSelf: number;
  insurancePremiumSpouse: number;
  insurancePayoutTotal: number;
  propertySaleProceeds: number;
  propertyCapitalGainsTax: number;
  giftTax: number;
  loanBalance: number;
  selfLoanBalance: number;
  spouseLoanBalance: number;
  yearHousingLoanDed: number;
  yearHousingLoanDedSpouse: number;
  activeEvts: LifeEvent[];
  propertyFixedCostEvts: LifeEvent[];
}

// Phase 3: 死亡後の取扱い適用ヘルパー
export function applyAfterDeathRule(
  amount: number,
  rule: LifeEvent["afterDeathRule"],
  isSelfDead: boolean,
  isSpouseDead: boolean,
): number {
  if (!rule) return amount;
  let adj = amount;
  if (isSelfDead) {
    if (rule.selfDeath === "stop") return 0;
    if (rule.selfDeath === "reduce") adj *= (rule.selfDeathReducePct ?? 100) / 100;
  }
  if (isSpouseDead) {
    if (rule.spouseDeath === "stop") return 0;
    if (rule.spouseDeath === "reduce") adj *= (rule.spouseDeathReducePct ?? 100) / 100;
  }
  return adj;
}

export function phaseEventCosts(
  ctx: YearContext, config: SimConfig, ageInfo: AgeEventInfo
): EventCostOutput {
  const { age, inflationFactor, isEffDisabled, events } = ctx;
  const { isSelfDead, isSpouseDead, isDeathYear, isSpouseDeathYear, selfDeathEvent, spouseDeathEvent, dp, isDead } = ageInfo;

  // Accumulators
  let eventOngoing = 0;
  let eventOnetime = 0;
  const eventCostBreakdown: EventYearCost[] = [];
  let propertySaleProceeds = 0;
  let propertyCapitalGainsTax = 0;
  let giftTax = 0;
  let insurancePremiumTotal = 0;
  let insurancePremiumSelf = 0;
  let insurancePremiumSpouse = 0;
  let insurancePayoutTotal = 0;
  let loanBalance = 0;
  let selfLoanBalance = 0;
  let spouseLoanBalance = 0;

  // 団信カバー率の計算（プロパティイベント共通）
  const calcDanshinCover = (pp: PropertyParams) => {
    const dTarget = pp.danshinTarget || "self";
    const selfDP = selfDeathEvent?.deathParams;
    const spouseDP = spouseDeathEvent?.deathParams;
    const isPair = pp.loanStructure === "pair";
    const sRatio = isPair ? (pp.pairRatio ?? 50) / 100 : 1;
    let cover = 0;
    if (isSelfDead && selfDP?.hasDanshin && (dTarget === "self" || dTarget === "both")) cover += sRatio;
    if (isSpouseDead && (spouseDP?.hasDanshin || selfDP?.hasDanshin) && (dTarget === "spouse" || dTarget === "both")) cover += isPair ? 1 - sRatio : 0;
    return Math.min(cover, 1);
  };

  // 管理費・固定資産税の計上ヘルパー
  const addPropertyFixedCosts = (ppx: PropertyParams) => {
    if (ppx.maintenanceMonthlyMan > 0) {
      const amt = Math.round(ppx.maintenanceMonthlyMan * 12 * 10000 * inflationFactor);
      eventCostBreakdown.push({ label: "管理費・修繕", icon: "🔧", color: "#64748b", amount: amt });
      eventOngoing += amt;
    }
    if (ppx.taxAnnualMan > 0) {
      const amt = Math.round(ppx.taxAnnualMan * 10000 * inflationFactor);
      eventCostBreakdown.push({ label: "固定資産税", icon: "🏛️", color: "#64748b", amount: amt });
      eventOngoing += amt;
    }
  };

  // Classify events
  const activeEvts = events.filter(e => !isEffDisabled(e) && isEventActive(e, age, events));
  const propertyFixedCostEvts = events.filter(e => !isEffDisabled(e) && e.propertyParams && !isEventActive(e, age, events) && age >= resolveEventAge(e, events));
  const onetimeEvts = events.filter(e => !isEffDisabled(e) && resolveEventAge(e, events) === age);

  // --- Main loop over active events: type-based dispatch ---
  for (const e of activeEvts) {
    const eAge = resolveEventAge(e, events);
    const yearsSince = age - eAge;
    // Phase 11: N年ごとの間隔チェック（ongoing部分のみ。onetime部分は別途）
    const intervalOk = !e.intervalYears || e.intervalYears <= 1 || yearsSince % e.intervalYears === 0;

    if (e.propertyParams) {
      // === Property event ===
      const pp = e.propertyParams;

      // Check property sale
      if (pp.saleAge != null && age === pp.saleAge) {
        const purchasePrice = pp.priceMan * 10000;
        const appreciationRate = (pp.appreciationRate ?? 0) / 100;
        const salePrice = pp.salePriceMan != null ? pp.salePriceMan * 10000 : Math.round(purchasePrice * Math.pow(1 + appreciationRate, yearsSince));
        const schedule = buildLoanSchedule(pp, eAge);
        const schedEntry = yearsSince < schedule.length ? schedule[yearsSince] : null;
        const remainingLoan = schedEntry ? schedEntry.balance : 0;
        const cgtResult = calcPropertyCapitalGainsTax(purchasePrice, salePrice, yearsSince, pp.saleIsResidence ?? true, pp.saleCostRate ?? 4);
        propertyCapitalGainsTax += cgtResult.tax;
        const netProceeds = salePrice - remainingLoan - cgtResult.tax;
        propertySaleProceeds += netProceeds;

        eventCostBreakdown.push({
          label: "物件売却", icon: "🏠", color: "#16a34a", amount: -netProceeds,
          detail: `売却${Math.round(salePrice / 10000)}万 - 残債${Math.round(remainingLoan / 10000)}万 - 譲渡税${Math.round(cgtResult.tax / 10000)}万${cgtResult.isLongTerm ? "(長期)" : "(短期)"}`,
          isPhaseChange: true, phaseLabel: `物件売却 ${Math.round(salePrice / 10000)}万`,
        });
        if (cgtResult.tax > 0) {
          eventCostBreakdown.push({
            label: "不動産譲渡所得税", icon: "🏛️", color: "#dc2626", amount: cgtResult.tax,
            detail: `譲渡益${Math.round(cgtResult.gain / 10000)}万 - 特別控除${Math.round(cgtResult.specialDeduction / 10000)}万 = 課税${Math.round(cgtResult.taxableGain / 10000)}万`,
          });
        }
        continue;
      }

      // Skip if already sold
      if (pp.saleAge != null && age > pp.saleAge) continue;

      const danshinCoverRatio = calcDanshinCover(pp);

      if (danshinCoverRatio >= 1) {
        addPropertyFixedCosts(pp);
        const deathEvt = isSelfDead ? selfDeathEvent! : spouseDeathEvent!;
        if (age === resolveEventAge(deathEvt, events)) {
          eventCostBreakdown.push({ label: "団信によるローン免除(全額)", icon: "🛡️", color: "#16a34a", amount: 0, isPhaseChange: true, phaseLabel: "団信発動" });
        }
      } else {
        const costs = computePropertyYearCost(pp, yearsSince, inflationFactor, eAge);
        for (const c of costs) {
          if (danshinCoverRatio > 0 && c.label.includes("ローン返済")) {
            const reduced = Math.round(c.amount * (1 - danshinCoverRatio));
            eventCostBreakdown.push({ ...c, amount: reduced, detail: `${c.detail} (団信${Math.round(danshinCoverRatio * 100)}%免除)` });
            eventOngoing += reduced;
          } else {
            eventCostBreakdown.push(c);
            eventOngoing += c.amount;
          }
        }
      }

      // Loan balance tracking for this property
      if (pp.saleAge == null || age < pp.saleAge) {
        const { balance: bal, entry } = getLoanBalance(pp, eAge, yearsSince);
        if (bal > 0 || entry) {
          const danshinAdj = 1 - calcDanshinCover(pp);
          loanBalance += Math.round(bal * danshinAdj);
          if (entry && pp.loanStructure === "pair") {
            selfLoanBalance += Math.round((entry.selfBalance ?? 0) * danshinAdj);
            spouseLoanBalance += Math.round((entry.spouseBalance ?? 0) * danshinAdj);
          } else {
            selfLoanBalance += Math.round(bal * danshinAdj);
          }
        }
      }

      // Relocation new property loan balance (handled below in relocation section)

    } else if (e.carParams) {
      // === Car event ===
      const costs = computeCarYearCost(e.carParams, yearsSince, inflationFactor);
      for (const c of costs) {
        eventCostBreakdown.push(c);
        eventOngoing += c.amount;
      }

    } else if (e.insuranceParams) {
      // === Insurance event ===
      const ip = e.insuranceParams;
      const insTarget = e.target || "self";
      const insuredDead = insTarget === "self" ? isSelfDead : isSpouseDead;
      const insuredDeathYear = insTarget === "self" ? isDeathYear : isSpouseDeathYear;

      if (!insuredDead && age < ip.coverageEndAge) {
        const premium = ip.premiumMonthlyMan * 12 * 10000;
        insurancePremiumTotal += premium;
        if (insTarget === "spouse") { insurancePremiumSpouse += premium; } else { insurancePremiumSelf += premium; }
        eventCostBreakdown.push({ label: `保険料(${e.label})`, icon: "🛡️", color: "#6366f1", amount: premium });
        eventOngoing += premium;
      }
      if (insuredDead) {
        if (ip.insuranceType === "term_life" && insuredDeathYear) {
          insurancePayoutTotal += ip.lumpSumPayoutMan * 10000;
        } else if (ip.insuranceType === "income_protection" && age < ip.payoutUntilAge) {
          insurancePayoutTotal += ip.monthlyPayoutMan * 12 * 10000;
        }
      }

    } else if (e.giftParams && eAge === age) {
      // === Gift event ===
      const gp = e.giftParams;
      const amountYen = gp.amountMan * 10000;
      const giftResult = calcGiftTax(amountYen, gp.giftType, gp.recipientRelation);
      giftTax += giftResult.tax;
      const totalCost = amountYen + giftResult.tax;
      eventCostBreakdown.push({
        label: `贈与(${gp.giftType === "calendar" ? "暦年" : "精算"})`, icon: "🎁", color: "#a855f7",
        amount: totalCost,
        detail: giftResult.detail,
        isPhaseChange: true, phaseLabel: `贈与 ${gp.amountMan}万円`,
      });
      eventOnetime += totalCost;

    } else if (e.relocationParams && eAge === age) {
      // === Relocation event (one-time moving cost) ===
      const rp = e.relocationParams;
      const movingCost = rp.movingCostMan * 10000;
      eventCostBreakdown.push({ label: "引越費用", icon: "🏡", color: "#0891b2", amount: movingCost });
      eventOnetime += movingCost;

    } else if (e.parentId && !e.propertyParams && !e.carParams && !e.insuranceParams) {
      // === Sub-event (parentId set, no own params) ===
      const ongoing = e.annualCostMan * 10000 * inflationFactor;
      if (ongoing !== 0) {
        eventCostBreakdown.push({ label: e.label, icon: "", color: "#8b5cf6", amount: ongoing });
        eventOngoing += ongoing;
      }
      if (resolveEventAge(e, events) === age && e.oneTimeCostMan !== 0) {
        const onetime = e.oneTimeCostMan * 10000 * inflationFactor;
        eventCostBreakdown.push({ label: `${e.label}（一時）`, icon: "", color: "#8b5cf6", amount: onetime });
        eventOnetime += onetime;
      }

    } else if (e.privatePensionParams) {
      // === Phase 2: 私的年金 ===
      const pp = e.privatePensionParams;
      const target = e.target || "self";
      const isDead_ = target === "self" ? isSelfDead : isSpouseDead;
      if (!isDead_) {
        // 積立期間: 掛金を支出として計上（Phase 3: 死亡後ルール適用）
        if (pp.contributionMonthlyMan && pp.contributionEndAge && age >= eAge && age < pp.contributionEndAge) {
          let contribution = Math.round(pp.contributionMonthlyMan * 12 * 10000 * inflationFactor);
          contribution = applyAfterDeathRule(contribution, e.afterDeathRule, isSelfDead, isSpouseDead);
          if (contribution !== 0) {
            eventCostBreakdown.push({ label: `${e.label}(掛金)`, icon: "🏦", color: "#0d9488", amount: contribution });
            eventOngoing += contribution;
          }
        }
        // 受取期間: 年金収入として計上（Phase 3: 死亡後ルール適用）
        if (age >= pp.payoutStartAge && (pp.payoutEndAge === 0 || age < pp.payoutEndAge)) {
          let payout = Math.round(pp.payoutAnnualMan * 10000 * inflationFactor);
          payout = applyAfterDeathRule(payout, e.afterDeathRule, isSelfDead, isSpouseDead);
          if (payout !== 0) {
            eventCostBreakdown.push({ label: `${e.label}(受取)`, icon: "🏦", color: "#0d9488", amount: -payout });
            eventOngoing -= payout;
          }
        }
      }

    } else if (!e.parentId && !e.giftParams && !e.relocationParams) {
      // === Simple event ===
      // Phase 11: 間隔チェック（N年ごとのみ計上）
      if (intervalOk) {
        let ongoing = e.annualCostMan * 10000 * inflationFactor;
        ongoing = applyAfterDeathRule(ongoing, e.afterDeathRule, isSelfDead, isSpouseDead);
        if (ongoing !== 0) {
          const et = { label: e.label, icon: "", color: "#64748b", amount: ongoing };
          eventCostBreakdown.push(et);
          eventOngoing += ongoing;
        }
      }
    }

    // --- Relocation ongoing costs (rent + new property) for active relocation events ---
    if (e.relocationParams) {
      const rp = e.relocationParams;
      if (rp.newHousingType === "rent" && rp.newRentAnnualMan) {
        const duration = rp.newRentDurationYears ?? 999;
        if (yearsSince < duration) {
          const rent = rp.newRentAnnualMan * 10000 * inflationFactor;
          eventCostBreakdown.push({ label: "家賃(住み替え後)", icon: "🏢", color: "#0891b2", amount: rent });
          eventOngoing += rent;
        }
      }
      if (rp.newHousingType === "purchase" && rp.newPropertyParams) {
        if (yearsSince >= 0) {
          const newPP = rp.newPropertyParams;
          const costs = computePropertyYearCost(newPP, yearsSince, inflationFactor, eAge);
          for (const c of costs) {
            eventCostBreakdown.push({ ...c, label: `新居:${c.label}` });
            eventOngoing += c.amount;
          }
          // Relocation new property loan balance
          const { balance: relBal } = getLoanBalance(newPP, eAge, yearsSince);
          loanBalance += relBal;
        }
      }
    }
  }

  // --- Property fixed costs that continue after durationYears (管理費・固定資産税) ---
  for (const e of propertyFixedCostEvts) {
    const pp = e.propertyParams!;
    if (pp.saleAge != null && age >= pp.saleAge) continue; // sold
    addPropertyFixedCosts(pp);
  }

  // --- One-time costs for simple events (non-structured) ---
  for (const e of onetimeEvts) {
    if (!e.propertyParams && !e.carParams && !e.insuranceParams && !e.giftParams && !e.relocationParams) {
      const onetime = e.oneTimeCostMan * 10000 * inflationFactor;
      if (onetime !== 0) {
        eventCostBreakdown.push({ label: `${e.label}（一時）`, icon: "", color: "#64748b", amount: onetime });
        eventOnetime += onetime;
      }
    }
  }

  // --- Post-processing: extract housing loan deductions from eventCostBreakdown ---
  let yearHousingLoanDed = 0;
  let yearHousingLoanDedSpouse = 0;
  const hlIdxs: number[] = [];
  for (let i = 0; i < eventCostBreakdown.length; i++) {
    const ec = eventCostBreakdown[i];
    if (ec.label === "住宅ローン控除(本人)" && ec.amount < 0) {
      yearHousingLoanDed += -ec.amount;
      eventOngoing -= ec.amount;
      hlIdxs.push(i);
    } else if (ec.label === "住宅ローン控除(配偶者)" && ec.amount < 0) {
      yearHousingLoanDedSpouse += -ec.amount;
      eventOngoing -= ec.amount;
      hlIdxs.push(i);
    }
  }
  for (let i = hlIdxs.length - 1; i >= 0; i--) eventCostBreakdown.splice(hlIdxs[i], 1);

  // --- Base living expense with death reduction ---
  // Phase 16: 老後は専用の基本生活費を使用（設定されている場合）
  const selfPensionStartAge = config.effectivePensionStartAge ?? 65;
  const baseLivingMonthlyMan = (config.retirementLivingExpenseMan && age >= selfPensionStartAge)
    ? config.retirementLivingExpenseMan
    : resolveKF(config.expenseKF, age, 15);
  let baseLivingExpense = baseLivingMonthlyMan * 12 * 10000 * inflationFactor;

  const ler = config.livingExpenseRules;
  if (ler?.enabled) {
    // Phase 1: 子の独立による生活費減額
    const childEvents = config.events.filter(e => e.type === "child" && !isEffDisabled(e));
    let independentCount = 0;
    for (const ce of childEvents) {
      const childAge = age - ce.age;
      if (childAge >= ler.childIndependenceAge) independentCount++;
    }
    if (independentCount > 0) {
      baseLivingExpense *= Math.max(0, 1 - independentCount * ler.reductionPerChildPct / 100);
    }
    // Phase 1: 万一後の生活費調整（livingExpenseRulesが有効な場合はこちらを優先）
    if (isDead && isSpouseDead) {
      baseLivingExpense = 0;
    } else if (isDead) {
      baseLivingExpense *= ler.selfDeathReductionPct / 100;
    } else if (isSpouseDead) {
      baseLivingExpense *= ler.spouseDeathReductionPct / 100;
    }
  } else {
    // 既存の death reduction（deathParamsのexpenseReductionPctを使用）
    if (isDead && dp && isSpouseDead && spouseDeathEvent?.deathParams) {
      baseLivingExpense = 0;
    } else if (isDead && dp) {
      baseLivingExpense = baseLivingExpense * dp.expenseReductionPct / 100;
    } else if (isSpouseDead && spouseDeathEvent?.deathParams) {
      baseLivingExpense = baseLivingExpense * spouseDeathEvent.deathParams.expenseReductionPct / 100;
    }
  }

  const totalExpense = baseLivingExpense + eventOngoing + eventOnetime;

  return {
    eventOngoing, eventOnetime, eventCostBreakdown,
    baseLivingExpense, totalExpense,
    insurancePremiumTotal, insurancePremiumSelf, insurancePremiumSpouse, insurancePayoutTotal,
    propertySaleProceeds, propertyCapitalGainsTax, giftTax,
    loanBalance, selfLoanBalance, spouseLoanBalance,
    yearHousingLoanDed, yearHousingLoanDedSpouse,
    activeEvts, propertyFixedCostEvts,
  };
}
