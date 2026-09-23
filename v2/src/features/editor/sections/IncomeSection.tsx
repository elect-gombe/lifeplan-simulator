import type { Member } from "@/domain/model";
import { useActivePlan } from "@/state/store";
import { useSim } from "@/state/useSim";
import { Card, NumField, Segmented, Row, Toggle, Collapsible, Pill } from "@/ui/primitives";
import { ScheduleEditor } from "@/ui/ScheduleEditor";
import { fmtMan, fmtManFine } from "@/lib/format";
import { SectionTitle, LinkedSection } from "../Editor";

export function IncomeSection() {
  const { plan, update } = useActivePlan();
  const { res } = useSim(plan);
  const first = res.rows[0];
  return (
    <>
      <SectionTitle title="収入・年金" desc="額面の年収（賞与込み）を入力。手取り・税・社会保険料・公的年金は自動で計算します。" />
      <LinkedSection group="income">
      <MemberIncome who="self" m={plan.self} color="var(--s-cash)" planEnd={plan.endAge} selfAge={plan.self.age}
        onChange={fn => update(d => fn(d.self))} takeHome={first.self.tax?.takeHome ?? 0} pension={res.rows.find(r => r.self.publicPension > 0)?.self.publicPension ?? 0} pensionParts={(() => { const r = res.rows.find(r => r.self.publicPension > 0)?.self; return r ? { basic: r.pensionBasic, employee: r.pensionEmployee } : null; })()} />
      {plan.spouse && (
        <MemberIncome who="spouse" m={plan.spouse} color="var(--s-alt)" planEnd={plan.endAge} selfAge={plan.self.age}
          onChange={fn => update(d => { if (d.spouse) fn(d.spouse); })} takeHome={first.spouse?.tax?.takeHome ?? 0} pension={res.rows.find(r => (r.spouse?.publicPension ?? 0) > 0)?.spouse?.publicPension ?? 0} pensionParts={(() => { const r = res.rows.find(r => (r.spouse?.publicPension ?? 0) > 0)?.spouse; return r ? { basic: r.pensionBasic, employee: r.pensionEmployee } : null; })()} />
      )}
      </LinkedSection>
    </>
  );
}

function MemberIncome({ m, color, onChange, takeHome, pension, planEnd, selfAge, who, pensionParts}: { m: Member; color: string; onChange: (fn: (m: Member) => void) => void; takeHome: number; pension: number; planEnd: number; selfAge: number; who: "self" | "spouse"; pensionParts: { basic: number; employee: number } | null}) {
  const offset = who === "self" ? 0 : m.age - selfAge;
  const memberEnd = planEnd + offset;
  const totalDc = (m.dc.company[0]?.value ?? 0) + (m.dc.matching[0]?.value ?? 0) + (m.dc.ideco[0]?.value ?? 0);
  return (
    <Card title={<span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{m.name}</span>}
      subtitle={m.employment === "none" ? "働いていない設定です（家族セクションで変更）" : `今年の手取り 約 ${fmtMan(takeHome)}${pension ? `・公的年金 約 ${fmtManFine(pension / 12)}/月（${m.pensionStartAge}歳〜${pensionParts ? `、基礎 ${fmtMan(pensionParts.basic)}＋厚生 ${fmtMan(pensionParts.employee)}/年` : ""}）` : ""}`}>
      {m.employment !== "none" && (
        <div className="space-y-4">
          <ScheduleEditor label="額面年収" help="今後の変化（転職・昇進・時短・退職前の減収など）を行で追加" value={m.income} onChange={s => onChange(x => { x.income = s; })} unit="万円" step={10} startAge={m.age} endAge={m.retireAge} color={color} />
          <Row>
            <NumField label="昇給率" value={m.incomeGrowthPct} unit="%/年" step={0.5} min={-5} max={10} onChange={v => onChange(x => { x.incomeGrowthPct = v; })} help="各区間の開始値から毎年この率で増えます。" />
            <NumField label="退職（収入が止まる）年齢" value={m.retireAge} unit="歳" min={40} max={80} onChange={v => onChange(x => { x.retireAge = v; })} help="給与がなくなる年齢。退職金もこの年に受け取る想定です。再雇用で収入が下がる場合は、上の年収に行を足して減額してください。" />
            <NumField label="就職した年齢" value={m.workStartAge} unit="歳" min={15} max={40} onChange={v => onChange(x => { x.workStartAge = v; })} help="厚生年金の加入期間の計算に使います。" />
          </Row>
          <Row>
            <NumField label="年金の受給開始" value={m.pensionStartAge} unit="歳" min={60} max={75} onChange={v => onChange(x => { x.pensionStartAge = v; })} help="65歳より早いと月0.4%減額、遅いと月0.7%増額。" />
            <NumField label="退職金" value={m.severancePay} unit="万円" step={100} min={0} onChange={v => onChange(x => { x.severancePay = v; })} help="退職年に受け取り、退職所得として課税。" />
            <NumField label="死亡退職金・弔慰金" value={m.deathBenefit} unit="万円" step={100} min={0} onChange={v => onChange(x => { x.deathBenefit = v; })} help="在職中に亡くなった場合に遺族へ支払われる額。「万一の分析」のシナリオと必要保障額に反映。相続税では退職手当金として非課税枠（500 万×法定相続人）の対象。" />
            <div>
              <span className="label block mb-1">社会保険</span>
              <Segmented size="sm" wrap value={m.socialInsurance} onChange={v => onChange(x => { x.socialInsurance = v; })}
                options={[{ value: "auto", label: "年収で判定", title: "給与 106万円以上で厚生年金・健保に加入。106万円未満で配偶者が会社員なら被扶養者（130万円未満）" }, { value: "join", label: "必ず加入", title: "パートでも勤務先の社会保険に入る" }, { value: "dependent", label: "扶養に入る", title: "配偶者の被扶養者・第3号被保険者として保険料 0" }]} />
            </div>
            <div className="flex items-end pb-1"><Toggle checked={m.furusato} onChange={v => onChange(x => { x.furusato = v; })} label="ふるさと納税（上限まで）" help="控除上限額を自動計算し、実質負担 2,000 円で寄附します（返礼品の価値は計算に含みません）。" /></div>
          </Row>
          <Collapsible title="企業型DC・iDeCo" summary={totalDc > 0 ? `月 ${totalDc.toLocaleString()} 円 → ${m.dc.receive.method === "lump" ? "一時金" : m.dc.receive.method === "annuity" ? "年金" : "併用"}で受取` : "未設定"} defaultOpen={totalDc > 0}>
            <div className="space-y-3">
              <ScheduleEditor label="企業型DC 事業主掛金" help="会社が出す掛金。給与とは別枠。" value={m.dc.company} onChange={s => onChange(x => { x.dc.company = s; })} unit="円/月" step={1000} max={55000} startAge={m.age} endAge={m.retireAge} color="var(--s-dc)" />
              <ScheduleEditor label="選択制DC・マッチング拠出" help="給与から拠出する分。所得税・社保の対象外になります。" value={m.dc.matching} onChange={s => onChange(x => { x.dc.matching = s; })} unit="円/月" step={1000} max={55000} startAge={m.age} endAge={m.retireAge} color="var(--s-dc)" />
              <ScheduleEditor label="iDeCo" help="全額が所得控除。会社員は月2.3万（企業DCありは6.2万−事業主掛金）が上限。" value={m.dc.ideco} onChange={s => onChange(x => { x.dc.ideco = s; })} unit="円/月" step={1000} max={75000} startAge={m.age} endAge={Math.min(m.retireAge, 65)} color="var(--s-dc)" />
              <div>
                <span className="label block mb-1">受け取り方</span>
                <Segmented value={m.dc.receive.method} onChange={v => onChange(x => { x.dc.receive.method = v; })} size="sm"
                  options={[{ value: "lump", label: "一時金" }, { value: "annuity", label: "年金" }, { value: "mixed", label: "併用" }]} />
                <Row className="mt-2">
                  <NumField label="受取開始" value={m.dc.receive.startAge} unit="歳" min={60} max={75} onChange={v => onChange(x => { x.dc.receive.startAge = v; })} help="DC・iDeCo を受け取り始める年齢（60〜75 歳）。" />
                  {m.dc.receive.method !== "lump" && <NumField label="年金の受取年数" value={m.dc.receive.annuityYears} unit="年" min={5} max={20} onChange={v => onChange(x => { x.dc.receive.annuityYears = v; })} help="年金形式で受け取る年数。受取中も残高の運用は続きます。雑所得として公的年金等控除の対象。" />}
                  {m.dc.receive.method === "mixed" && <NumField label="一時金の割合" value={m.dc.receive.lumpRatioPct} unit="%" min={0} max={100} step={10} onChange={v => onChange(x => { x.dc.receive.lumpRatioPct = v; })} help="併用のとき、残高のうち一時金で受け取る割合。残りを年金で受け取ります。一時金は退職所得（他の退職金と合算）。" />}
                </Row>
                <p className="hint mt-1">一時金は退職所得控除（勤続年数×40万、20年超は70万）後の 1/2 に課税。年金は公的年金等控除の対象。</p>
              </div>
            </div>
          </Collapsible>
          <div className="flex flex-wrap gap-1.5">
            <Pill>{m.employment === "employee" ? "厚生年金" : "国民年金"}</Pill>
            <Pill>加入 {m.workStartAge}〜{Math.min(m.retireAge, 70)}歳</Pill>
            {memberEnd > m.retireAge && <Pill>老後 {memberEnd - m.retireAge}年</Pill>}
          </div>
        </div>
      )}
    </Card>
  );
}
