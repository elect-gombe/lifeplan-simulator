import React, { useState, useEffect } from "react";
import type { LifeEvent } from "../lib/types";
import { Modal } from "./ui";

/** イベントモーダルの定義型 */
export interface EventModalDef<T> {
  type: string;
  title: string | ((editing: boolean) => string);
  btnClass?: string;
  wide?: boolean;
  defaults: T;
  paramsKey: keyof LifeEvent;
  ageOffset: number;
  buildLabel: (params: T, age: number) => string;
  /** handleSave時にLifeEventに追加するフィールド (durationYears, target等) */
  buildExtra?: (params: T, age: number) => Partial<LifeEvent>;
}

/** 共通props型 — 全イベントモーダルが受け取る */
export interface EventModalBaseProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: LifeEvent) => void;
  currentAge: number;
  retirementAge: number;
  existingEvent?: LifeEvent | null;
}

/** children render に渡されるコンテキスト */
export interface EventContext<T> {
  params: T;
  setParams: React.Dispatch<React.SetStateAction<T>>;
  u: (patch: Partial<T>) => void;
  age: number;
  setAge: (a: number) => void;
  existingEvent?: LifeEvent | null;
  currentAge: number;
  retirementAge: number;
}

/** ジェネリック上位コンポーネント */
export function EventModal<T>({ def, isOpen, onClose, onSave, currentAge, retirementAge, existingEvent, children }: EventModalBaseProps & {
  def: EventModalDef<T>;
  children: (ctx: EventContext<T>) => React.ReactNode;
}) {
  const [params, setParams] = useState<T>(def.defaults);
  const [age, setAge] = useState(currentAge + def.ageOffset);

  useEffect(() => {
    if (existingEvent) {
      const p = existingEvent[def.paramsKey];
      if (p) setParams(p as T);
      setAge(existingEvent.age);
    }
  }, [existingEvent]);

  const u = (patch: Partial<T>) => setParams(prev => ({ ...prev, ...patch }));

  const handleSave = () => {
    const extra = def.buildExtra?.(params, age) ?? {};
    onSave({
      id: existingEvent?.id || Date.now(),
      age,
      type: def.type,
      label: def.buildLabel(params, age),
      oneTimeCostMan: 0,
      annualCostMan: 0,
      durationYears: 0,
      [def.paramsKey]: params,
      ...extra,
    });
    onClose();
  };

  const title = typeof def.title === "function" ? def.title(!!existingEvent) : `${def.title}${existingEvent ? "（編集）" : ""}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}
      btnClass={def.btnClass} onSave={handleSave}
      saveLabel={existingEvent ? "更新" : "追加"} wide={def.wide}>
      {children({ params, setParams, u, age, setAge, existingEvent, currentAge, retirementAge })}
    </Modal>
  );
}
