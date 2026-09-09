import { KARTE_TYPE_LABEL, ROAD_TYPE_LABEL, RESPONSE_META } from "@/lib/labels";
import {
  Section,
  TextField,
  NumberField,
  DateField,
  TextAreaField,
  SelectField,
  CheckboxField,
} from "@/components/FormFields";

const PROJECT_CATEGORY_LABEL = { GENERAL: "一般", TOLL: "有料" };
const ROAD_STATUS_LABEL = { CURRENT: "現道", OLD: "旧道", NEW: "新道", NEWEST: "新新道" };
const GEODETIC_SYSTEM_LABEL = { WORLD: "世界測地系", JAPAN: "日本測地系" };
const RESPONSE_CATEGORY_LABEL = Object.fromEntries(
  Object.entries(RESPONSE_META).map(([value, meta]) => [value, meta.label])
);

export type KarteFormValues = {
  facilityNo?: string | null;
  karteType?: string | null;
  routeName?: string | null;
  routeNo?: string | null;
  manageOrgName?: string | null;
  manageOrgCode?: string | null;
  distanceMarkerFromKm?: number | string | null;
  distanceMarkerToKm?: number | string | null;
  sideOfRoad?: string | null;
  extensionLengthM?: number | string | null;
  projectCategory?: string | null;
  roadType?: string | null;
  roadStatus?: string | null;
  locationDistrict?: string | null;
  locationTown?: string | null;
  landmark?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  geodeticSystem?: string | null;
  responseCategory?: string | null;
  responseEvaluatedAt?: string | null; // YYYY-MM-DD
  keyDeformationSummary?: string | null;
  inspectionContentSummary?: string | null;
  specialistComment?: string | null;
  mainFormRockfall?: boolean;
  mainFormCollapse?: boolean;
};

// カルテ編集画面（指示書12章）。新規登録・既存編集の両方をこのコンポーネントで賄う。
// 落石・崩壊固有項目は常に表示し「カルテ区分が落石・崩壊の場合のみ使用される」旨を注記する
// （区分に応じた出し分けにはクライアントJSが必要になるため、MVPでは簡素な形にとどめている）。
export default function KarteForm({
  action,
  initial,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: KarteFormValues;
  submitLabel: string;
}) {
  const v = initial ?? {};
  return (
    <form action={action} className="space-y-4">
      <Section title="基本情報">
        <TextField name="facilityNo" label="施設管理番号" defaultValue={v.facilityNo} required />
        <SelectField
          name="karteType"
          label="カルテ区分"
          defaultValue={v.karteType}
          options={KARTE_TYPE_LABEL}
          includeBlank={false}
          required
        />
        <TextField name="routeName" label="路線名" defaultValue={v.routeName} required />
        <TextField name="routeNo" label="路線番号" defaultValue={v.routeNo} />
        <TextField name="manageOrgName" label="管理機関名" defaultValue={v.manageOrgName} />
        <TextField name="manageOrgCode" label="管理機関コード" defaultValue={v.manageOrgCode} />
      </Section>

      <Section title="位置情報">
        <TextField name="locationDistrict" label="所在地（郡・市等）" defaultValue={v.locationDistrict} />
        <TextField name="locationTown" label="所在地（町村等）" defaultValue={v.locationTown} />
        <TextField name="landmark" label="位置目印" defaultValue={v.landmark} />
        <NumberField name="latitude" label="緯度（10進度）" defaultValue={v.latitude} step="0.000001" />
        <NumberField name="longitude" label="経度（10進度）" defaultValue={v.longitude} step="0.000001" />
        <SelectField name="geodeticSystem" label="測地系" defaultValue={v.geodeticSystem} options={GEODETIC_SYSTEM_LABEL} />
      </Section>

      <Section title="道路情報">
        <NumberField name="distanceMarkerFromKm" label="距離標（自・km）" defaultValue={v.distanceMarkerFromKm} step="0.001" />
        <NumberField name="distanceMarkerToKm" label="距離標（至・km）" defaultValue={v.distanceMarkerToKm} step="0.001" />
        <TextField name="sideOfRoad" label="上下線の別" defaultValue={v.sideOfRoad} placeholder="上 / 下 / 他" />
        <NumberField name="extensionLengthM" label="延長（m）" defaultValue={v.extensionLengthM} step="0.1" />
        <SelectField name="projectCategory" label="事業区分" defaultValue={v.projectCategory} options={PROJECT_CATEGORY_LABEL} />
        <SelectField name="roadType" label="道路種別" defaultValue={v.roadType} options={ROAD_TYPE_LABEL} />
        <SelectField name="roadStatus" label="現道・旧道区分" defaultValue={v.roadStatus} options={ROAD_STATUS_LABEL} />
      </Section>

      <Section title="対応状況">
        <SelectField
          name="responseCategory"
          label="対応区分"
          defaultValue={v.responseCategory}
          options={RESPONSE_CATEGORY_LABEL}
          includeBlank={false}
        />
        <DateField name="responseEvaluatedAt" label="評価年月日" defaultValue={v.responseEvaluatedAt} />
      </Section>

      <Section title="コメント">
        <TextAreaField name="keyDeformationSummary" label="着目すべき変状" defaultValue={v.keyDeformationSummary} />
        <TextAreaField name="inspectionContentSummary" label="点検内容の要点" defaultValue={v.inspectionContentSummary} />
        <TextAreaField name="specialistComment" label="専門技術者のコメント" defaultValue={v.specialistComment} />
      </Section>

      <Section title="落石・崩壊カルテ固有項目" note="カルテ区分が「落石・崩壊」の場合のみ使用されます">
        <CheckboxField name="mainFormRockfall" label="主な災害形態：落石" defaultChecked={v.mainFormRockfall} />
        <CheckboxField name="mainFormCollapse" label="主な災害形態：崩壊" defaultChecked={v.mainFormCollapse} />
      </Section>

      <div>
        <button type="submit" className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
