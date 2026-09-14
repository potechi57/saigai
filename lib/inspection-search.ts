// 点検調書系（1施設1ファイルの詳細点検報告書。GateSignInspection＝門型標識が現状の
// 唯一の実装だが、近日中に橋梁点検・道路法面点検の調書も追加予定であり、同じ
// 「管理番号・路線名・所在地」で絞り込む検索が必要になる見込み。会話ログ参照）に
// 共通する検索条件の組み立てを1箇所にまとめる。
//
// Prismaのモデルごとに WhereInput の型が異なる（GateSignInspectionWhereInput・
// 将来のBridgeInspectionWhereInput等）ため、この関数自体は特定モデルの型に依存
// させず、呼び出し側で対象モデルのWhereInputにキャストして使う想定にしている
// （フィールド名を文字列で渡すだけの、ゆるい型のヘルパーにとどめている）。
// 判定区分（健全性の診断）はモデルによって値の体系が異なりうるため、あえてこの
// 共通ヘルパーには含めず、呼び出し側で個別に組み立てる（門型標識はⅠ〜Ⅳ表記だが、
// 橋梁点検等も同じ体系か未確認のため。CLAUDE.md「未検証のアプローチを前提に
// しない」方針）。

export type InspectionCommonSearchParams = {
  managementNo?: string; // 部分一致（大文字小文字を区別しない）
  routeName?: string; // 完全一致（<select>から選ぶ前提のため）
  location?: string; // 部分一致（大文字小文字を区別しない）
};

export type InspectionCommonFieldNames = {
  managementNo: string; // 例:"managementNo"
  routeName: string; // 例:"routeName"
  location: string; // 例:"location"
};

export function buildInspectionCommonConditions(
  params: InspectionCommonSearchParams,
  fields: InspectionCommonFieldNames
): Record<string, unknown>[] {
  const conditions: Record<string, unknown>[] = [];
  if (params.managementNo) {
    conditions.push({ [fields.managementNo]: { contains: params.managementNo, mode: "insensitive" } });
  }
  if (params.routeName) {
    conditions.push({ [fields.routeName]: params.routeName });
  }
  if (params.location) {
    conditions.push({ [fields.location]: { contains: params.location, mode: "insensitive" } });
  }
  return conditions;
}
