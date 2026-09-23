import { describe, it, expect } from "vitest";
import { defaultPlan } from "@/domain/model";
import { runSim, simKey } from "@/state/useSim";

describe("runSim のキャッシュ", () => {
  it("名前・色・リンクだけ違うプランは同じ結果オブジェクトを返す（再計算しない）", () => {
    const p = defaultPlan();
    const a = runSim(p);
    const renamed = { ...p, name: "別名", color: "#000" };
    expect(runSim(renamed)).toBe(a);
    const cloned = structuredClone(p);
    expect(runSim(cloned)).toBe(a);
  });
  it("計算に影響する値が変わると別の結果になる", () => {
    const p = defaultPlan();
    const a = runSim(p);
    const b = runSim({ ...p, endAge: p.endAge + 1 });
    expect(b).not.toBe(a);
    expect(simKey(p)).not.toBe(simKey({ ...p, endAge: p.endAge + 1 }));
    expect(simKey(p)).toBe(simKey({ ...p, name: "x" }));
  });
});
