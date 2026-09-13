"use client";

import { useActionState, useState } from "react";
import { updateFacilityLedger, type UpdateFacilityLedgerResult } from "@/lib/actions/facility-ledger-actions";
import { FACILITY_LEDGER_DOC_CLASS_LABEL } from "@/lib/labels";
import { FACILITY_FIELDS, FACILITY_TYPES } from "@/lib/facility-taxonomy";
import { ROUTE_PREFIX_OPTIONS, parseRouteName } from "@/lib/route-name";
import LocationPickerMap from "@/components/LocationPickerLoader";

// 台帳詳細画面（/ledgers/[id]）で、画像以外の基本情報（分類・種別・管理番号・
// 台帳名・路線名・所在地・緯度経度・備考）を後から編集するためのフォーム。
// 画像取込時は最低限の情報で素早く登録できるようにしている分（会話ログ参照）、
// 登録後に判明した管理番号を追記したり、誤りを直したりできる必要があるため
// 用意した。フィールド構成・カスケード選択はFacilityLedgerForm（新規登録用）と
// ほぼ同じだが、こちらは画像を扱わず、既存値をdefaultValueとして受け取る。
export default function FacilityLedgerEditForm({
  ledgerId,
  initial,
}: {
  ledgerId: string;
  initial: {
    docClass: "LEGAL" | "FACILITY";
    facilityType: string;
    facilitySubType: string;
    managementNo: string;
    name: string;
    routeName: string;
    location: string;
    latitude: string;
    longitude: string;
    note: string;
  };
}) {
  const action = updateFacilityLedger.bind(null, ledgerId);
  const [state, formAction, isPending] = useActionState<UpdateFacilityLedgerResult | null, FormData>(
    action,
    null
  );
  const [docClass, setDocClass] = useState<"LEGAL" | "FACILITY">(initial.docClass);
  const [bunya, setBunya] = useState<string>(initial.facilityType);
  const initialRouteName = parseRouteName(initial.routeName);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">分類</label>
        <div className="flex gap-3">
          {(Object.entries(FACILITY_LEDGER_DOC_CLASS_LABEL) as [("LEGAL" | "FACILITY"), string][]).map(
            ([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="radio"
                  name="docClass"
                  value={value}
                  checked={docClass === value}
                  onChange={() => setDocClass(value)}
                />
                {label}
              </label>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">種別・分野（任意）</label>
          <select
            name="facilityType"
            value={bunya}
            onChange={(e) => setBunya(e.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">未選択</option>
            {FACILITY_FIELDS.map((f) => (
              <option key={f.key} value={f.label}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">種別・施設名称（任意）</label>
          <select
            key={bunya}
            name="facilitySubType"
            disabled={!bunya}
            defaultValue={initial.facilitySubType}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">未選択</option>
            {(FACILITY_TYPES[FACILITY_FIELDS.find((f) => f.label === bunya)?.key ?? ""] ?? []).map((t) => (
              <option key={t.label} value={t.label}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
          管理番号（任意。無い施設も多いため、無ければ台帳名で表示されます）
        </span>
        <input
          type="text"
          name="managementNo"
          defaultValue={initial.managementNo}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
          台帳名（任意。未入力の場合は種別から自動生成。例: 魚瀬トンネル）
        </span>
        <input
          type="text"
          name="name"
          defaultValue={initial.name}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <div>
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">路線名（任意）</span>
        <div className="flex gap-2">
          <select
            name="routePrefix"
            defaultValue={initialRouteName.prefix}
            className="w-40 shrink-0 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            {ROUTE_PREFIX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="routeNameRest"
            defaultValue={initialRouteName.rest}
            placeholder="例: 大野魚瀬恵曇線"
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
          所在地（任意・自由記述。例: 自 松江市秋鹿町 至 松江市魚瀬町）
        </span>
        <input
          type="text"
          name="location"
          defaultValue={initial.location}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <div>
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
          緯度・経度（任意。地図上にピンを立てたい場合）
        </span>
        <LocationPickerMap
          latName="latitude"
          lngName="longitude"
          initialLatitude={initial.latitude ? Number(initial.latitude) : null}
          initialLongitude={initial.longitude ? Number(initial.longitude) : null}
        />
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">備考</span>
        <textarea
          name="note"
          rows={3}
          defaultValue={initial.note}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
      >
        {isPending ? "保存中..." : "保存する"}
      </button>

      {state && !state.ok && (
        <p className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state && state.ok && <p className="text-sm text-green-700 dark:text-green-400">保存しました。</p>}
    </form>
  );
}
