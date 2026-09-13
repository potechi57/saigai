"use client";

import { useActionState, useState } from "react";
import { createFacilityLedger, type CreateFacilityLedgerResult } from "@/lib/actions/facility-ledger-actions";
import { FACILITY_LEDGER_DOC_CLASS_LABEL } from "@/lib/labels";
import { FACILITY_FIELDS, FACILITY_TYPES } from "@/lib/facility-taxonomy";
import LocationPickerMap from "@/components/LocationPickerLoader";

// トンネル台帳等、画像1枚＋最低限の基本情報だけの台帳を登録するフォーム。
// 台帳（画像）は法令台帳・施設台帳のどちらにも必要になるため（会話ログ参照。
// 以前はFacilityLedger＝法令台帳と誤って対応付けていた）、まず分類
// （法令台帳／施設台帳）を選び、次に種別（分野→施設名称）を選ぶ2段階の
// カスケード選択にしている。種別は検索・地図画面の法令台帳タブと同じ分類
// （lib/facility-taxonomy.ts。島根県公共土木施設台帳の分類）をそのまま使う。
//
// 画像さえあれば登録できるよう、種別・台帳名・路線名・所在地・緯度経度は
// 全て任意にしている（台帳名は未入力なら種別から自動生成される。
// lib/actions/facility-ledger-actions.ts参照）。
//
// Excelのような自動抽出元が無いため、以前はカルテの取込画面のような自動入力が
// 無かったが、「施設台帳（一覧表）に先に登録してから台帳画像を貼り付ける」という
// 実務の順序に合わせ、施設台帳から選んだ内容をinitialとして受け取り、
// 台帳名・路線名・所在地・緯度経度の初期値にできるようにした
// （app/ledgers/new/page.tsx参照）。緯度経度が分からないことが多いため、数値の
// 直接入力に加えて、地図クリック・地名検索でも選べるようにしている
// （components/LocationPickerMap.tsx参照）。
export default function FacilityLedgerForm({
  initialDocClass,
  initial,
}: {
  initialDocClass?: "LEGAL" | "FACILITY";
  initial?: { name: string; routeName: string; location: string; latitude: string; longitude: string };
}) {
  const [state, formAction, isPending] = useActionState<CreateFacilityLedgerResult | null, FormData>(
    createFacilityLedger,
    null
  );
  const [docClass, setDocClass] = useState<"LEGAL" | "FACILITY">(initialDocClass ?? "FACILITY");
  const [bunya, setBunya] = useState<string>("");

  return (
    <form action={formAction} className="space-y-4 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
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
            defaultValue=""
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
          台帳名（任意。未入力の場合は種別から自動生成。例: 魚瀬トンネル）
        </span>
        <input
          type="text"
          name="name"
          defaultValue={initial?.name}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">路線名（任意）</span>
        <input
          type="text"
          name="routeName"
          defaultValue={initial?.routeName}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
          所在地（任意・自由記述。例: 自 松江市秋鹿町 至 松江市魚瀬町）
        </span>
        <input
          type="text"
          name="location"
          defaultValue={initial?.location}
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
          initialLatitude={initial?.latitude ? Number(initial.latitude) : null}
          initialLongitude={initial?.longitude ? Number(initial.longitude) : null}
        />
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">台帳の画像ファイル（必須。スキャン画像等）</span>
        <input type="file" name="image" accept="image/*" required className="block w-full text-sm" />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">備考</span>
        <textarea
          name="note"
          rows={3}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-gray-800 dark:bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
      >
        {isPending ? "登録中..." : "登録する"}
      </button>

      {state && !state.ok && (
        <p className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
