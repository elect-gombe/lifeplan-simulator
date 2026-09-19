/** Per-year context construction and death/retirement detection. */
import type { LifeEvent } from "../types";
import { resolveEventAge } from "../types";
import type { SimConfig, AgeEventInfo, YearContext } from "./types";

export function phaseAgeEvents(ctx: YearContext, config: SimConfig): AgeEventInfo {
  const { age, yearsFromStart, isEffDisabled, events } = ctx;
  const selfDeathEvent = events.find(e => !isEffDisabled(e) && e.type === "death" && e.deathParams && (e.target || "self") === "self" && age >= resolveEventAge(e, events));
  const spouseDeathEvent = events.find(e => !isEffDisabled(e) && e.type === "death" && e.deathParams && e.target === "spouse" && age >= resolveEventAge(e, events));
  const isSelfDead = !!selfDeathEvent;
  const isSpouseDead = !!spouseDeathEvent;
  const deathEvent = selfDeathEvent;
  const isDead = isSelfDead;
  const dp = deathEvent?.deathParams;
  const deathAge = deathEvent ? resolveEventAge(deathEvent, events) : 0;
  const isDeathYear = !!(deathEvent && age === deathAge);
  const isSpouseDeathYear = !!(spouseDeathEvent && age === resolveEventAge(spouseDeathEvent, events));
  const selfRetired = age >= config.selfRetirementAge;
  const spouseAge = config.spouse ? config.spouse.currentAge + yearsFromStart : 0;
  const spouseRetired = config.spouse ? spouseAge >= (config.spouse.retirementAge ?? 65) : false;
  return {
    isSelfDead, isSpouseDead, isDeathYear, isSpouseDeathYear,
    selfDeathEvent, spouseDeathEvent, deathEvent, dp, deathAge, isDead,
    selfRetired, spouseAge, spouseRetired,
  };
}

export function buildYearContext(age: number, config: SimConfig, events: LifeEvent[]): YearContext {
  const yearsFromStart = age - config.currentAge;
  const inflationFactor = Math.pow(1 + config.inflation, yearsFromStart);
  const isEffDisabled = (e: LifeEvent) => !!e.disabled || (e.parentId != null && !!events.find(p => p.id === e.parentId)?.disabled);
  return {
    age, yearsFromStart, inflationFactor,
    baseCalendarYear: config.baseCalendarYear,
    isEffDisabled, events, config,
  };
}
