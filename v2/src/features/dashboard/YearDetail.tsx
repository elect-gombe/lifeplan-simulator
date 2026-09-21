/** 1年分の詳細: 収入・支出の内訳、メンバー別の税・社保、残高。 */
import type { Plan } from "@/domain/model";
import type { YearRow } from "@/engine/simulate";
import { HBars } from "@/charts/Bars";
import { fmtMan } from "@/lib/format";
import { TaxDetail } from "./TaxDetail";

export function YearDetail({ row, plan }: { row: YearRow; plan: Plan }) {
  const b = row.balances;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <Stat label="収入（手取り）" value={fmtMan(row.totalIn)} tone="good" />
        <Stat label="支出" value={fmtMan(row.totalOut)} tone="out" />
        <Stat label="収支" value={fmtMan(row.net, { sign: true })} tone={row.net < 0 ? "critical" : "accent"} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div><div className="label mb-2">収入の内訳</div><HBars items={row.inflows} total={row.totalIn} color="var(--s-in)" /></div>
        <div><div className="label mb-2">支出の内訳</div><HBars items={row.outflows} total={row.totalOut} color="var(--s-out)" /></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
        {[["現金", b.cash], ["特定口座", b.taxable], ["NISA", b.nisa], ["DC・iDeCo", b.dc], ["住宅", b.home], ["ローン", -b.loan], ["純資産", b.netWorth]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg surface-2 px-2.5 py-2"><div className="ink-3">{l}</div><div className="tabular font-medium ink mt-0.5">{fmtMan(v as number)}</div></div>
        ))}
      </div>
      {row.flows.nisaIn + row.flows.taxableIn + row.flows.nisaOut + row.flows.taxableOut > 0 && (
        <p className="hint">
          この年の運用フロー: {row.flows.nisaIn > 0 && `NISA 積立 ${fmtMan(row.flows.nisaIn)} `}{row.flows.taxableIn > 0 && `特定口座 積立 ${fmtMan(row.flows.taxableIn)} `}
          {row.flows.nisaOut > 0 && `NISA 取り崩し ${fmtMan(row.flows.nisaOut)} `}{row.flows.taxableOut > 0 && `特定口座 取り崩し ${fmtMan(row.flows.taxableOut)} `}
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <TaxDetail m={row.self} name={plan.self.name} />
        {row.spouse && plan.spouse && <TaxDetail m={row.spouse} name={plan.spouse.name} />}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "good" | "out" | "critical" | "accent" }) {
  const color = tone === "good" ? "var(--s-in)" : tone === "out" ? "var(--s-out)" : tone === "critical" ? "var(--critical)" : "var(--accent)";
  return <div className="rounded-lg surface-2 px-3 py-2"><div className="hint">{label}</div><div className="text-lg font-semibold tabular" style={{ color }}>{value}</div></div>;
}

