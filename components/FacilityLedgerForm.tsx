"use client";

import { useActionState, useState } from "react";
import { createFacilityLedger, type CreateFacilityLedgerResult } from "@/lib/actions/facility-ledger-actions";
import { FACILITY_LEDGER_DOC_CLASS_LABEL } from "@/lib/labels";
import { FACILITY_FIELDS, FACILITY_TYPES, FACILITY_LEDGER_ITEM_FIELDS, FACILITY_LEDGER_ITEM_TYPES } from "@/lib/facility-taxonomy";
import { ROUTE_PREFIX_OPTIONS, parseRouteName } from "@/lib/route-name";
import LocationPickerMap from "@/components/LocationPickerLoader";

// トンネル台帳等、画像1枚以上＋最低限の基本情報だけの台帳を登録するフォーム。
// 台帳（画像）は法令台帳・施設台帳のどちらにも必要になるため（会話ログ参照。
// 以前はFacilityLedger＝法令台帳と誤って対応付けていた）、まず分類
// （法令台帳／施設台帳）を選び、次に種別（分野→施設名称）を選ぶ2段階の
// カスケード選択にしている。種別はShimaneのページの【法令台帳一覧】
// 【施設台帳一覧】の表そのままの分類（lib/facility-taxonomy.ts）を使い、分類の
// 選択（LEGAL/FACILITY）に応じてどちらの表を使うか切り替える（以前は分類に
// 関わらず常に法令台帳側の表を使っていたため、施設台帳として登録する場合に
// 施設台帳側にしか無い項目（空港等）が選べず、逆に法令台帳側にしか無い項目
// （港湾の海岸共通等）も、法令台帳の表自体が施設台帳の項目と混ざっていて選べない、
// という不具合になっていた。会話ログ「法令台帳と施設台帳がごっちゃになって
// いますね」参照）。
//
// 画像さえあれば登録できるよう、種別・管理番号・台帳名・路線名・所在地・
// 緯度経度は全て任意にしている（台帳名は未入力なら種別から自動生成される。
// lib/actions/facility-ledger-actions.ts参照）。管理番号は構造化データの裏付けが
// 無い画像台帳では分かっていないことが多いため任意項目にしており、無ければ
// 台帳名で代用表示する（lib/labels.tsのfacilityLedgerDisplayName参照）。
//
// 画像は同じ施設で調書・図面等を複数枚まとめて選択して登録でき（<input multiple>）、
// 登録後も/ledgers/[id]から追加・削除・タブ名の変更ができる（会話ログ参照）。
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
  initial?: {
    managementNo?: string;
    name: string;
    routeName: string;
    location: string;
    latitude: string;
    longitude: string;
  };
}) {
  const [state, formAction, isPending] = useActionState<CreateFacilityLedgerResult | null, FormData>(
    createFacilityLedger,
    null
  );
  // 分類（法令台帳／施設台帳）は、呼び出し元（資料読み込みハブ・台帳一覧の
  // 「＋法令台帳として登録」等）が明示的に指定してきた場合のみ初期選択し、
  // 指定が無い場合はどちらも選ばせない（undefined）。以前は指定が無いと無言で
  // 「施設台帳」を初期選択していたため、法令台帳のつもりで登録したユーザーが
  // ラジオボタンに気付かず、実際には施設台帳として保存されてしまう事例が発生した
  // （会話ログ「法令台帳として登録したものが、なぜか施設台帳に登録されている
  // のかもしれません」参照）。下のinput要素にrequiredを付け、未選択のまま送信
  // できないようにしている。
  const [docClass, setDocClass] = useState<"LEGAL" | "FACILITY" | undefined>(initialDocClass);
  const [bunya, setBunya] = useState<string>("");
  // 分類（法令台帳／施設台帳）に応じて、種別選択で使う分野・施設名称の一覧を
  // 切り替える（上のコメント参照）。
  const fields = docClass === "LEGAL" ? FACILITY_FIELDS : FACILITY_LEDGER_ITEM_FIELDS;
  const types = docClass === "LEGAL" ? FACILITY_TYPES : FACILITY_LEDGER_ITEM_TYPES;
  // 路線名先頭の「(国)」等の前置きは、全角/半角の表記ゆれを防ぐため自由入力にせず
  // 固定の選択肢から選ばせる（lib/route-name.ts参照。会話ログ「()が全角か半角かなどで
  // 別々に登録される恐れがあります」参照）。initialの路線名（自動入力時）に前置きが
  // 含まれていれば、フォームの初期状態にも反映する。
  const initialRouteName = parseRouteName(initial?.routeName);

  return (
    <form action={formAction} className="space-y-4 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
          分類 <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3">
          {(Object.entries(FACILITY_LEDGER_DOC_CLASS_LABEL) as [("LEGAL" | "FACILITY"), string][]).map(
            ([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                <input
                  type="radio"
                  name="docClass"
                  value={value}
                  required
                  checked={docClass === value}
                  onChange={() => {
                    setDocClass(value);
                    // 分類を切り替えると使う分野・施設名称の一覧自体が変わるため、
                    // 前の分類で選んでいた分野をクリアする（別分類の分野が残っていても
                    // 意味を持たないため）。
                    setBunya("");
                  }}
                />
                {label}
              </label>
            )
          )}
        </div>
        {!docClass && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            法令台帳・施設台帳のどちらとして登録するか選んでください。
          </p>
        )}
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
            {fields.map((f) => (
              <option key={f.key} value={f.label}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">種別・施設名称（任意）</label>
          <select
            key={`${docClass}-${bunya}`}
            name="facilitySubType"
            disabled={!bunya}
            defaultValue=""
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">未選択</option>
            {(types[fields.find((f) => f.label === bunya)?.key ?? ""] ?? []).map((t) => (
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
          defaultValue={initial?.managementNo}
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
          defaultValue={initial?.name}
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
        <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
          台帳の画像ファイル（必須。スキャン画像等。同じ施設の調書・図面等を複数枚まとめて選択できます。タブ名は「画像1」「画像2」…で登録され、登録後に自由に変更できます）
        </span>
        <input type="file" name="images" accept="image/*" required multiple className="block w-full text-sm" />
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
