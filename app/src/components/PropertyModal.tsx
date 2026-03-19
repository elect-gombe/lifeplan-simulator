import React, { useState, useEffect } from "react";
import type { LifeEvent, PropertyParams } from "../lib/types";
import { Modal } from "./ui";
import { PropertyFormWithPreview } from "./PropertyForm";

export const DEFAULT_PROPERTY_PARAMS: PropertyParams = {
  priceMan: 5000, downPaymentMan: 500, loanYears: 35,
  repaymentType: "equal_payment",
  rateType: "variable", fixedRate: 1.8,
  variableInitRate: 0.5, variableRiskRate: 1.5, variableRiseAfter: 10,
  maintenanceMonthlyMan: 2, taxAnnualMan: 15, hasLoanDeduction: true,
  loanStructure: "single", pairRatio: 50,
  deductionTarget: "self", danshinTarget: "self",
};

export function PropertyModal({ isOpen, onClose, onSave, currentAge, retirementAge, existingEvent }: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}) {
  const [purchaseAge, setPurchaseAge] = useState(currentAge + 5);
  const [pp, setPP] = useState<PropertyParams>(DEFAULT_PROPERTY_PARAMS);

  useEffect(() => {
    if (existingEvent?.propertyParams) {
      setPP(existingEvent.propertyParams);
      setPurchaseAge(existingEvent.age);
    }
  }, [existingEvent]);

  const handleSave = () => {
    onSave({
      id: existingEvent?.id || Date.now(),
      age: purchaseAge, type: "property",
      label: `住宅(${pp.priceMan}万)`,
      oneTimeCostMan: 0, annualCostMan: 0, durationYears: 0,
      propertyParams: pp,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🏠 住宅購入${existingEvent ? "（編集）" : ""}`}
      onSave={handleSave} saveLabel={existingEvent ? "更新" : "追加"} wide>
      <PropertyFormWithPreview pp={pp} onChange={setPP} purchaseAge={purchaseAge} onPurchaseAgeChange={setPurchaseAge} />
    </Modal>
  );
}
