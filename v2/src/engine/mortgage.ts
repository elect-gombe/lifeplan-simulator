/**
 * 住宅ローンの返済スケジュール（月次計算 → 年次集計）。
 * 元利均等 / 元金均等、固定 / 変動（段階金利）、繰上返済（期間短縮・返済額軽減）、借換に対応。
 * 単位: 円。
 */
import type { Property } from "@/domain/model";
import { MAN } from "./constants";

export interface LoanYear {
  yearIndex: number;        // 0 = 購入年
  age: number;              // 本人年齢
  openingBalance: number;
  payment: number;          // 年間返済額（元本＋利息）
  interest: number;
  principal: number;
  prepayment: number;       // 繰上返済額
  refinanceCost: number;
  closingBalance: number;   // 年末残高（繰上返済後）
  ratePct: number;          // 年末時点の適用金利
  events: string[];         // "金利上昇", "借換", "繰上返済", "完済"
}

export interface LoanSchedule {
  principal: number;
  years: LoanYear[];
  totalInterest: number;
  payoffAge: number | null;
  firstYearMonthly: number;
}

function monthlyAnnuity(balance: number, monthlyRate: number, months: number): number {
  if (months <= 0) return balance;
  if (monthlyRate <= 0) return balance / months;
  const f = Math.pow(1 + monthlyRate, months);
  return balance * monthlyRate * f / (f - 1);
}

export function buildLoanSchedule(p: Property, purchaseAge: number, horizonEndAge: number): LoanSchedule {
  const principal = Math.max(Math.round((p.price - p.downPayment) * MAN), 0);
  const out: LoanSchedule = { principal, years: [], totalInterest: 0, payoffAge: null, firstYearMonthly: 0 };
  if (principal <= 0 || p.loanYears <= 0) return out;

  let balance = principal;
  let remainingMonths = p.loanYears * 12;
  let ratePct = p.rate.kind === "fixed" ? p.rate.pct : p.rate.initialPct;
  let refinanced = false;
  let monthlyPay = p.repayment === "annuity" ? monthlyAnnuity(balance, ratePct / 100 / 12, remainingMonths) : 0;
  let principalPerMonth = p.repayment === "principal" ? balance / remainingMonths : 0;
  out.firstYearMonthly = Math.round(p.repayment === "annuity" ? monthlyPay : principalPerMonth + balance * ratePct / 100 / 12);

  const maxYears = Math.max(horizonEndAge - purchaseAge + 1, 1); // 借換で満期が延びても打ち切らない（残高 0 で終了）
  for (let y = 0; y < maxYears && balance > 0; y++) {
    const age = purchaseAge + y;
    const yr: LoanYear = { yearIndex: y, age, openingBalance: balance, payment: 0, interest: 0, principal: 0, prepayment: 0, refinanceCost: 0, closingBalance: 0, ratePct, events: [] };

    // 変動金利の段階変化（借換後は借換金利を固定として扱う）
    if (p.rate.kind === "variable" && !refinanced && y === p.rate.changeAfterYears && p.rate.laterPct !== ratePct) {
      ratePct = p.rate.laterPct;
      yr.events.push(`金利 ${p.rate.initialPct}%→${p.rate.laterPct}%`);
      if (p.repayment === "annuity") monthlyPay = monthlyAnnuity(balance, ratePct / 100 / 12, remainingMonths);
    }
    // 借換
    if (p.refinance && !refinanced && age === p.refinance.age && balance > 0) {
      refinanced = true;
      ratePct = p.refinance.pct;
      remainingMonths = Math.max(p.refinance.years * 12, 12);
      yr.refinanceCost = Math.round(p.refinance.cost * MAN);
      yr.events.push(`借換 ${p.refinance.pct}%/${p.refinance.years}年`);
      if (p.repayment === "annuity") monthlyPay = monthlyAnnuity(balance, ratePct / 100 / 12, remainingMonths);
      else principalPerMonth = balance / remainingMonths;
    }

    const mr = ratePct / 100 / 12;
    for (let m = 0; m < 12 && balance > 0 && remainingMonths > 0; m++) {
      const interest = balance * mr;
      let pay = p.repayment === "annuity" ? Math.min(monthlyPay, balance + interest) : Math.min(principalPerMonth + interest, balance + interest);
      if (remainingMonths === 1) pay = balance + interest;
      const princ = pay - interest;
      balance = Math.max(balance - princ, 0);
      yr.payment += pay; yr.interest += interest; yr.principal += princ;
      remainingMonths--;
    }

    // 繰上返済（年末に実行）
    for (const pre of p.prepayments) {
      if (pre.age !== age || balance <= 0 || pre.amount <= 0) continue;
      const amt = Math.min(Math.round(pre.amount * MAN), balance);
      balance -= amt;
      yr.prepayment += amt;
      yr.events.push(`繰上返済 ${Math.round(amt / MAN)}万`);
      if (balance <= 0) break;
      if (pre.mode === "reduce") {
        if (p.repayment === "annuity") monthlyPay = monthlyAnnuity(balance, mr, remainingMonths);
        else principalPerMonth = balance / remainingMonths;
      } else {
        // 期間短縮: 月返済額を維持して残月数を再計算
        if (p.repayment === "annuity" && monthlyPay > 0) {
          if (mr > 0) {
            const ratio = balance * mr / monthlyPay;
            remainingMonths = ratio < 1 ? Math.max(Math.ceil(-Math.log(1 - ratio) / Math.log(1 + mr)), 1) : remainingMonths;
          } else remainingMonths = Math.max(Math.ceil(balance / monthlyPay), 1);
        } else if (principalPerMonth > 0) {
          remainingMonths = Math.max(Math.ceil(balance / principalPerMonth), 1);
        }
      }
    }

    yr.payment = Math.round(yr.payment); yr.interest = Math.round(yr.interest); yr.principal = Math.round(yr.principal);
    yr.closingBalance = Math.round(balance);
    yr.ratePct = ratePct;
    out.totalInterest += yr.interest;
    if (balance <= 0.5) { balance = 0; yr.closingBalance = 0; yr.events.push("完済"); out.payoffAge = age; }
    out.years.push(yr);
  }
  return out;
}

/** 元利均等の月額（表示用） */
export function annuityMonthlyPayment(principalMan: number, ratePct: number, years: number): number {
  return Math.round(monthlyAnnuity(principalMan * MAN, ratePct / 100 / 12, years * 12));
}
