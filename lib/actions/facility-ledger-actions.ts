"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { FacilityLedgerDocClass } from "@prisma/client";
import { composeRouteName } from "@/lib/route-name";
import { logAudit } from "@/lib/audit";
import { facilityLedgerDisplayName } from "@/lib/labels";

// トンネル台帳等、Excelのような構造化データが無くスキャン画像でしか残っていない
// 台帳を、「画像1枚以上＋最低限の基本情報」という単純な形で登録するための
// Server Action群。カルテ（道路防災カルテ）のExcel取込とは完全に独立した、
// 別の仕組みにしている（詳細はprisma/schema.prismaのFacilityLedgerコメント参照）。
//
// 【必須項目は画像のみ】種別（分野・施設名称）・管理番号・台帳名・路線名・所在地・
// 緯度経度は全て任意にしている（会話ログ「全てを入れなくてもよいように」参照）。
// 台帳名が未入力の場合は、種別（分野・施設名称）から自動生成し、それも無ければ
// 「台帳（画像）」という最低限のプレースホルダにする。
//
// 【画像は複数枚まとめて登録・後から追加可能】同じ施設で調書・図面等、複数枚の
// 画像をまとめて登録したり、登録後に別の画像を追加したりできるようにする
// （会話ログ参照）。各画像はlabel（タブ名）を持ち、後から自由に変更できる
// （renameFacilityLedgerImage）。

function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

export type CreateFacilityLedgerResult = { ok: true } | { ok: false; error: string };

export async function createFacilityLedger(
  _prevState: CreateFacilityLedgerResult | null,
  formData: FormData
): Promise<CreateFacilityLedgerResult> {
  // <input type="file" multiple>で選ばれた全ファイルを取得する。同じ施設で
  // 複数枚（調書・図面等）をまとめて登録できるようにするため（会話ログ参照）。
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { ok: false, error: "台帳の画像ファイルを1枚以上選択してください。" };
  }
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "画像ファイル（jpg/png等）を選択してください。" };
    }
  }

  if (!hasBlobCredentials()) {
    return {
      ok: false,
      error: "Vercel Blobが未設定です。VercelダッシュボードでBlobストアを作成し、このプロジェクトに接続してください。",
    };
  }

  // 分類（法令台帳／施設台帳）は、以前は未指定・不正値の場合に無言で「施設台帳」を
  // 既定値にしていたが、これが原因で「法令台帳として登録したつもりが、実際には
  // 施設台帳として保存され、検索で見つからない」という事例が発生した（会話ログ
  // 参照）。分類はデータの帰属を左右する重要な項目のため、明示的な指定が無ければ
  // 登録自体を拒否する（components/FacilityLedgerForm.tsxのラジオボタンにも
  // requiredを付け、通常はここに到達する前にブラウザ側で止まる想定だが、
  // JavaScript無効時・不正なフォーム送信時のフォールバックとしてサーバー側でも
  // 検証する）。
  const docClassRaw = formData.get("docClass");
  if (typeof docClassRaw !== "string" || !(docClassRaw in FacilityLedgerDocClass)) {
    return { ok: false, error: "分類（法令台帳／施設台帳）を選択してください。" };
  }
  const docClass = docClassRaw as FacilityLedgerDocClass;

  const facilityType = str(formData, "facilityType");
  const facilitySubType = str(formData, "facilitySubType");
  const managementNo = str(formData, "managementNo");
  const routeName = composeRouteName(strOr(formData, "routePrefix"), strOr(formData, "routeNameRest"));
  const location = str(formData, "location");
  const note = str(formData, "note");
  const latitude = num(formData, "latitude");
  const longitude = num(formData, "longitude");

  // 台帳名が未入力の場合、種別（分野・施設名称）から自動生成する
  // （例:「道路 トンネル」）。種別も無ければ最低限のプレースホルダにする。
  const name = str(formData, "name") ?? ([facilityType, facilitySubType].filter(Boolean).join(" ") || "台帳（画像）");

  let imageUrls: string[];
  try {
    imageUrls = await Promise.all(
      files.map(async (file) => {
        const blob = await put(`facility-ledgers/${docClass}-${Date.now()}-${file.name}`, file, { access: "public" });
        return blob.url;
      })
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `画像のアップロードに失敗しました（詳細: ${detail}）` };
  }

  const created = await prisma.facilityLedger.create({
    data: {
      docClass,
      facilityType,
      facilitySubType,
      managementNo,
      name,
      routeName,
      location,
      latitude,
      longitude,
      note,
      images: {
        // 複数枚まとめて登録した場合、既定のタブ名は「画像1」「画像2」…と連番にする
        // （後から/ledgers/[id]で自由に変更できる。会話ログ参照）。
        create: imageUrls.map((imageUrl, i) => ({ label: `画像${i + 1}`, imageUrl, sortOrder: i })),
      },
    },
  });

  await logAudit({
    action: "CREATE",
    entityType: "台帳（画像）",
    summary: `${facilityLedgerDisplayName(created.managementNo, created.name)}を新規登録（画像${imageUrls.length}枚）`,
    linkHref: `/ledgers/${created.id}`,
  });

  revalidatePath("/ledgers");
  revalidatePath("/karte");
  redirect("/ledgers");
}

export type UpdateFacilityLedgerResult = { ok: true } | { ok: false; error: string };

// 台帳の基本情報（画像以外）を編集する。画像の追加・削除・タブ名変更は
// 別のaction（add/rename/deleteFacilityLedgerImage）で行う。
export async function updateFacilityLedger(
  id: string,
  _prevState: UpdateFacilityLedgerResult | null,
  formData: FormData
): Promise<UpdateFacilityLedgerResult> {
  const docClassRaw = formData.get("docClass");
  const docClass =
    typeof docClassRaw === "string" && docClassRaw in FacilityLedgerDocClass
      ? (docClassRaw as FacilityLedgerDocClass)
      : FacilityLedgerDocClass.FACILITY;

  const facilityType = str(formData, "facilityType");
  const facilitySubType = str(formData, "facilitySubType");
  const managementNo = str(formData, "managementNo");
  const routeName = composeRouteName(strOr(formData, "routePrefix"), strOr(formData, "routeNameRest"));
  const location = str(formData, "location");
  const note = str(formData, "note");
  const latitude = num(formData, "latitude");
  const longitude = num(formData, "longitude");
  const name = str(formData, "name") ?? ([facilityType, facilitySubType].filter(Boolean).join(" ") || "台帳（画像）");

  const updated = await prisma.facilityLedger.update({
    where: { id },
    data: { docClass, facilityType, facilitySubType, managementNo, name, routeName, location, latitude, longitude, note },
  });

  await logAudit({
    action: "UPDATE",
    entityType: "台帳（画像）",
    summary: `${facilityLedgerDisplayName(updated.managementNo, updated.name)}を更新`,
    linkHref: `/ledgers/${id}`,
  });

  revalidatePath(`/ledgers/${id}`);
  revalidatePath("/ledgers");
  revalidatePath("/karte");
  return { ok: true };
}

// 台帳一覧（/ledgers、カード単位）・台帳詳細（/ledgers/[id]）の両方から呼ばれる。
// 詳細画面から削除した場合、削除後もそのページ（存在しないid）に留まると404に
// なってしまうため、常に一覧へredirectする（一覧から呼んだ場合も同じ一覧に
// 留まるだけなので害はない）。
export async function deleteFacilityLedger(id: string): Promise<void> {
  // 画像は本体（FacilityLedger）とは別ストレージ（Vercel Blob）のため、DB上の
  // カスケード削除（onDelete: Cascade）とは別に、各画像のBlobも個別に削除する
  // 必要がある（lib/actions/import-actions.tsのdeletePhotosWithBlobs等と同じ理由）。
  const ledger = await prisma.facilityLedger.delete({
    where: { id },
    include: { images: true },
  });
  await Promise.all(ledger.images.map((img) => del(img.imageUrl).catch(() => {})));
  await logAudit({
    action: "DELETE",
    entityType: "台帳（画像）",
    summary: `${facilityLedgerDisplayName(ledger.managementNo, ledger.name)}を削除`,
  });
  revalidatePath("/ledgers");
  revalidatePath("/karte");
  redirect("/ledgers");
}

export type AddFacilityLedgerImageResult = { ok: true } | { ok: false; error: string };

// 登録済みの台帳に、後から画像を1枚追加する（/ledgers/[id]）。
export async function addFacilityLedgerImage(
  ledgerId: string,
  _prevState: AddFacilityLedgerImageResult | null,
  formData: FormData
): Promise<AddFacilityLedgerImageResult> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "画像ファイルを選択してください。" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "画像ファイル（jpg/png等）を選択してください。" };
  }
  if (!hasBlobCredentials()) {
    return {
      ok: false,
      error: "Vercel Blobが未設定です。VercelダッシュボードでBlobストアを作成し、このプロジェクトに接続してください。",
    };
  }

  const ledger = await prisma.facilityLedger.findUnique({
    where: { id: ledgerId },
    select: {
      docClass: true,
      managementNo: true,
      name: true,
      images: { select: { sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 },
    },
  });
  if (!ledger) {
    return { ok: false, error: "台帳が見つかりません。" };
  }
  const nextSortOrder = (ledger.images[0]?.sortOrder ?? -1) + 1;
  const labelRaw = str(formData, "label");
  const label = labelRaw ?? `画像${nextSortOrder + 1}`;

  let imageUrl: string;
  try {
    const blob = await put(`facility-ledgers/${ledger.docClass}-${Date.now()}-${file.name}`, file, { access: "public" });
    imageUrl = blob.url;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `画像のアップロードに失敗しました（詳細: ${detail}）` };
  }

  await prisma.facilityLedgerImage.create({
    data: { ledgerId, label, imageUrl, sortOrder: nextSortOrder },
  });

  await logAudit({
    action: "UPDATE",
    entityType: "台帳（画像）",
    summary: `${facilityLedgerDisplayName(ledger.managementNo, ledger.name)}に画像「${label}」を追加`,
    linkHref: `/ledgers/${ledgerId}`,
  });

  revalidatePath(`/ledgers/${ledgerId}`);
  revalidatePath("/karte");
  return { ok: true };
}

export type RenameFacilityLedgerImageResult = { ok: true } | { ok: false; error: string };

// 画像のタブ名（label）を変更する（会話ログ「タブの名前付けは任意として、
// 取り込ませたあとに任意で修正できるように」参照）。
export async function renameFacilityLedgerImage(
  imageId: string,
  ledgerId: string,
  _prevState: RenameFacilityLedgerImageResult | null,
  formData: FormData
): Promise<RenameFacilityLedgerImageResult> {
  const label = str(formData, "label");
  if (!label) {
    return { ok: false, error: "タブ名を入力してください。" };
  }
  const updated = await prisma.facilityLedgerImage.update({
    where: { id: imageId },
    data: { label },
    include: { ledger: { select: { managementNo: true, name: true } } },
  });
  await logAudit({
    action: "UPDATE",
    entityType: "台帳（画像）",
    summary: `${facilityLedgerDisplayName(updated.ledger.managementNo, updated.ledger.name)}の画像タブ名を「${label}」に変更`,
    linkHref: `/ledgers/${ledgerId}`,
  });
  revalidatePath(`/ledgers/${ledgerId}`);
  return { ok: true };
}

// 画像を1枚削除する（台帳本体は残す。全て削除して0枚になっても台帳自体は残る）。
export async function deleteFacilityLedgerImage(imageId: string, ledgerId: string): Promise<void> {
  const image = await prisma.facilityLedgerImage.delete({
    where: { id: imageId },
    include: { ledger: { select: { managementNo: true, name: true } } },
  });
  await del(image.imageUrl).catch(() => {});
  await logAudit({
    action: "UPDATE",
    entityType: "台帳（画像）",
    summary: `${facilityLedgerDisplayName(image.ledger.managementNo, image.ledger.name)}から画像「${image.label}」を削除`,
    linkHref: `/ledgers/${ledgerId}`,
  });
  revalidatePath(`/ledgers/${ledgerId}`);
  revalidatePath("/karte");
}

// ── FormDataから安全に値を取り出す小さなヘルパー（lib/actions/karte-actions.tsと同じ方針） ──

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

// composeRouteName等、"値が無ければ空文字"（nullではなく""）を期待する呼び出し先向け。
function strOr(fd: FormData, key: string): string {
  return str(fd, key) ?? "";
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
