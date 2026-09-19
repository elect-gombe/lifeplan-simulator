/** Mutable accumulators carried across the year loop. */
// ===== SimState: Mutable accumulators for the year loop =====
export interface SimState {
  cumulativeCash: number;
  selfDCAsset: number;
  spouseDCAsset: number;
  cumulativeReinvest: number;
  selfNISAAsset: number;
  spouseNISAAsset: number;
  selfNISACostBasis: number;
  spouseNISACostBasis: number;
  cumulativeTaxable: number;
  cumulativeTaxableCost: number;
  cumulativeSalary: number;
  salaryYears: number;
  spouseCumulativeSalary: number;
  spouseSalaryYears: number;
  totalC: number;
  totalPensionLoss: number;
  // DC受取実績の累積（総括表示用）
  selfDCReceivedLumpSum: number;
  selfDCReceivedAnnuityTotal: number;
  selfDCReceivedTax: number;
  spouseDCReceivedLumpSum: number;
  spouseDCReceivedAnnuityTotal: number;
  spouseDCReceivedTax: number;
}

export function initSimState(effectiveCurrentAssets: number): SimState {
  return {
    cumulativeCash: effectiveCurrentAssets * 10000,
    selfDCAsset: 0,
    spouseDCAsset: 0,
    cumulativeReinvest: 0,
    selfNISAAsset: 0,
    spouseNISAAsset: 0,
    selfNISACostBasis: 0,
    spouseNISACostBasis: 0,
    cumulativeTaxable: 0,
    cumulativeTaxableCost: 0,
    cumulativeSalary: 0,
    salaryYears: 0,
    spouseCumulativeSalary: 0,
    spouseSalaryYears: 0,
    totalC: 0,
    totalPensionLoss: 0,
    selfDCReceivedLumpSum: 0,
    selfDCReceivedAnnuityTotal: 0,
    selfDCReceivedTax: 0,
    spouseDCReceivedLumpSum: 0,
    spouseDCReceivedAnnuityTotal: 0,
    spouseDCReceivedTax: 0,
  };
}
