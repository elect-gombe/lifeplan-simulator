import { UserPlus, UserMinus } from "lucide-react";
import { defaultMember } from "@/domain/model";
import { useActivePlan } from "@/state/store";
import { Card, NumField, Segmented, Row, TextField } from "@/ui/primitives";
import { shiftSelfAge, shiftSpouseAge } from "@/domain/shift";
import { SectionTitle, LinkedSection } from "../Editor";

export function FamilySection() {
  const { plan, update } = useActivePlan();
  const self = plan.self, sp = plan.spouse;
  return (
    <>
      <SectionTitle title="家族" desc="世帯の基本情報。年齢はすべて本人の年齢を軸に計算します。" />
      <LinkedSection group="family">
      <Card title="本人">
        <Row>
          <label className="block"><span className="label block mb-1">表示名</span><TextField value={self.name} onChange={v => update(d => { d.self.name = v; })} ariaLabel="本人の表示名" /></label>
          <NumField label="年齢" value={self.age} unit="歳" min={18} max={90} onChange={v => update(d => shiftSelfAge(d, v))} help="年齢を変えると、本人年齢で指定しているもの（収入・生活費・住まい・子どもの誕生・イベント・試算終了年齢など）が同じ年数だけずれます。" />
          <div><span className="label block mb-1">性別</span><Segmented value={self.sex} onChange={v => update(d => { d.self.sex = v; })} options={[{ value: "male", label: "男性" }, { value: "female", label: "女性" }]} size="sm" /></div>
        </Row>
        <div className="mt-3">
          <span className="label block mb-1">働き方</span>
          <Segmented value={self.employment} onChange={v => update(d => { d.self.employment = v; })} size="sm"
            options={[{ value: "employee", label: "会社員・公務員" }, { value: "selfEmployed", label: "自営業" }, { value: "none", label: "働いていない" }]} />
          <p className="hint mt-1">会社員は厚生年金・健康保険（労使折半）、自営業は国民年金・国民健康保険で計算します。</p>
        </div>
      </Card>

      <Card title="配偶者・パートナー" right={
        sp
          ? <button className="btn btn-ghost text-xs" onClick={() => update(d => { d.spouse = null; })}><UserMinus size={14} />なし にする</button>
          : <button className="btn btn-outline text-xs" onClick={() => update(d => { d.spouse = defaultMember({ name: "配偶者", age: d.self.age - 2, sex: d.self.sex === "male" ? "female" : "male", income: [{ age: d.self.age - 2, value: 400 }] }); })}><UserPlus size={14} />追加</button>
      }>
        {sp ? (
          <>
            <Row>
              <label className="block"><span className="label block mb-1">表示名</span><TextField value={sp.name} onChange={v => update(d => { d.spouse!.name = v; })} ariaLabel="配偶者の表示名" /></label>
              <NumField label="年齢" value={sp.age} unit="歳" min={18} max={90} onChange={v => update(d => shiftSpouseAge(d, v))} help="配偶者の年齢で指定している収入・DC のスケジュールも同じ年数だけずれます。" />
              <div><span className="label block mb-1">性別</span><Segmented value={sp.sex} onChange={v => update(d => { d.spouse!.sex = v; })} options={[{ value: "male", label: "男性" }, { value: "female", label: "女性" }]} size="sm" /></div>
            </Row>
            <div className="mt-3">
              <span className="label block mb-1">働き方</span>
              <Segmented value={sp.employment} onChange={v => update(d => { d.spouse!.employment = v; if (v === "none") d.spouse!.income = [{ age: d.spouse!.age, value: 0 }]; })} size="sm"
                options={[{ value: "employee", label: "会社員・公務員" }, { value: "selfEmployed", label: "自営業" }, { value: "none", label: "働いていない" }]} />
            </div>
          </>
        ) : <p className="hint">配偶者がいる場合は追加してください。収入・年金・税（配偶者控除）・遺族年金に反映されます。</p>}
      </Card>

      </LinkedSection>
    </>
  );
}
