import { useState } from "react";
import type { LifeEvent } from "../../lib/types";
import { InsuranceModal } from "../InsuranceModal";
import { CarModal } from "../CarModal";
import type { WizardData, StepProps } from "./types";
import { EventList } from "./EventList";

export function StepInsuranceCar({ data, onChange }: StepProps) {
  const u = (patch: Partial<WizardData>) => onChange({ ...data, ...patch });
  const [insuranceModalOpen, setInsuranceModalOpen] = useState(false);
  const [editingInsurance, setEditingInsurance] = useState<LifeEvent | null>(null);
  const [carModalOpen, setCarModalOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<LifeEvent | null>(null);

  const handleInsuranceSave = (event: LifeEvent) => {
    const updated = editingInsurance
      ? data.insuranceEvents.map(e => e.id === editingInsurance.id ? event : e)
      : [...data.insuranceEvents, event];
    u({ insuranceEvents: updated });
    setEditingInsurance(null);
    setInsuranceModalOpen(false);
  };

  const handleCarSave = (event: LifeEvent) => {
    const updated = editingCar
      ? data.carEvents.map(e => e.id === editingCar.id ? event : e)
      : [...data.carEvents, event];
    u({ carEvents: updated });
    setEditingCar(null);
    setCarModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">保険・車</h2>

      <EventList
        label="保険" icon="🛡️"
        events={data.insuranceEvents}
        onAdd={() => { setEditingInsurance(null); setInsuranceModalOpen(true); }}
        onEdit={e => { setEditingInsurance(e); setInsuranceModalOpen(true); }}
        onRemove={id => u({ insuranceEvents: data.insuranceEvents.filter(e => e.id !== id) })}
      />

      <EventList
        label="車" icon="🚗"
        events={data.carEvents}
        onAdd={() => { setEditingCar(null); setCarModalOpen(true); }}
        onEdit={e => { setEditingCar(e); setCarModalOpen(true); }}
        onRemove={id => u({ carEvents: data.carEvents.filter(e => e.id !== id) })}
      />

      {insuranceModalOpen && (
        <InsuranceModal
          isOpen={true}
          onClose={() => { setInsuranceModalOpen(false); setEditingInsurance(null); }}
          onSave={handleInsuranceSave}
          currentAge={data.currentAge}
          retirementAge={data.retirementAge}
          existingEvent={editingInsurance}
        />
      )}
      {carModalOpen && (
        <CarModal
          isOpen={true}
          onClose={() => { setCarModalOpen(false); setEditingCar(null); }}
          onSave={handleCarSave}
          currentAge={data.currentAge}
          retirementAge={data.simEndAge}
          existingEvent={editingCar}
        />
      )}
    </div>
  );
}
