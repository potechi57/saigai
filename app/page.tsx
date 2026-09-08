import { redirect } from "next/navigation";

// MVP初期段階ではダッシュボードは作り込まず、カルテ一覧へのリダイレクトのみとする
// （指示書5章「ダッシュボードを過剰に作り込まない」方針に沿う）。
export default function Home() {
  redirect("/karte");
}
