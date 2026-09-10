# emf-converter

Excelに埋め込まれたEMF/WMF（ベクター形式のスケッチ画像）をPNGに変換するだけの、
小さなHTTPサーバー。防災カルテWebアプリ（`../../`、Next.js／Vercel）のExcel取込処理
（`lib/excel/emf-convert.ts`）から呼び出される。

## なぜこのサーバーが別コンポーネントとして存在するか

- Vercelのサーバーレス関数にはネイティブバイナリ（LibreOffice等）を載せられない
  （デプロイパッケージのサイズ上限・実行環境の制約）。
- 当初はクラウド変換API（Aspose Cloud）を使う案もあったが、行政（県）のデータを
  セキュリティ認証（SOC 2・ISO 27001等）を持たない第三者サービスへ送信することに
  なるため見送り、**自分たちで管理するCloud Run上でLibreOffice headlessを動かし、
  変換処理を自前で完結させる**方式にした。これにより変換対象のデータが外部の
  第三者サービスへ渡ることは無い。

## なぜImageMagickではなくLibreOfficeか

ImageMagickのEMF変換は内部的に外部ツール（LibreOffice等）に処理を委譲する作りで、
特にLinux環境では変換に失敗する例が広く報告されている（ImageMagick自体が
EMF用のまともなネイティブデリゲートを持たないため）。回り道をせず、
LibreOffice headless（`soffice --headless --convert-to png`）を直接使う方が確実。

## ローカルでの動作確認

Docker Desktop等が必要。

```bash
docker build -t emf-converter .
docker run --rm -p 8080:8080 -e API_KEY=devsecret emf-converter
```

別ターミナルから、実際のEMF/WMFファイルを送って確認する:

```bash
curl -X POST "http://localhost:8080/convert?ext=emf" \
  -H "X-Api-Key: devsecret" \
  --data-binary @sample.emf \
  --output result.png
```

`result.png`が正しく開ければ成功。`API_KEY`環境変数を省略するとローカルでは
認証チェックをスキップする（本番では必ず設定すること。下記参照）。

## Google Cloud Runへのデプロイ

事前にGoogle Cloudのプロジェクトを用意し、`gcloud`CLIでログイン・
プロジェクト選択を済ませておく（`gcloud auth login` / `gcloud config set project <PROJECT_ID>`）。
Cloud Run・Artifact Registry・Cloud Buildの各APIを有効化しておくこと。

```bash
# 1. コンテナイメージをビルドしてArtifact Registry等へpush
#    （このコマンドはビルドとpushを1回で行う。リージョンは東京(asia-northeast1)を推奨）
gcloud builds submit --tag asia-northeast1-docker.pkg.dev/<PROJECT_ID>/<REPO>/emf-converter

# 2. 認証用の共有シークレットを生成（例）して控えておく
openssl rand -hex 32

# 3. Cloud Runにデプロイ
gcloud run deploy emf-converter \
  --image asia-northeast1-docker.pkg.dev/<PROJECT_ID>/<REPO>/emf-converter \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --concurrency 1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars API_KEY=<手順2で生成した値>
```

### 各フラグの意味（MVP向けに意図的に選んでいる値）

- `--concurrency 1`: 1つのコンテナ内で複数の`soffice`プロセスを同時に動かすと
  不安定になりやすい（プロファイルロック等）ため、リクエストごとに別インスタンスへ
  振り分けさせる。低頻度の利用が前提のMVPでは、この制約によるコスト増は小さい。
- `--min-instances 0`: 呼び出し頻度が低い（Excel取込でEMF/WMFが埋め込まれている
  場合のみ）ため、アイドル時は課金されないスケール・トゥ・ゼロにしている。
  その分、久しぶりに呼ばれたときはコールドスタート（LibreOfficeの起動を含め
  数秒〜十数秒）が発生するが、Excel取込は元々進捗表示付きの非同期処理のため
  実用上問題にならない。
- `--memory 2Gi` / `--cpu 2`: LibreOfficeの起動・変換にはある程度のメモリ・CPUが
  必要。実際の負荷を見て調整可能。
- `--allow-unauthenticated` ＋ アプリ側の`X-Api-Key`ヘッダー認証:
  Cloud RunのIAM認証（サービスアカウント＋IDトークン）の方がより堅牢だが、
  Vercel側にサービスアカウント鍵を持たせる構成はMVPには過剰と判断し、
  まずはシンプルな共有シークレット方式にしている。**本番移行時はIAM認証への
  切り替えを検討すること**（`--no-allow-unauthenticated` ＋
  Cloud Run起動元サービスアカウントへの`roles/run.invoker`付与＋
  Vercel側で`google-auth-library`によるIDトークン取得）。

デプロイ完了後に表示されるURL（例:
`https://emf-converter-xxxxxxxxxx-an.a.run.app`）と、手順2で生成した値を、
Next.jsアプリ側の環境変数に設定する（`../../.env.example`参照）:

```
EMF_CONVERTER_URL=https://emf-converter-xxxxxxxxxx-an.a.run.app
EMF_CONVERTER_API_KEY=<手順2で生成した値>
```

## 動作確認チェックリスト

- [ ] `curl https://<デプロイ後のURL>/health` が `ok` を返す
- [ ] 実際のカルテExcelから抽出したEMFファイルで`/convert?ext=emf`を試し、
      得られたPNGを目視確認する（向き・欠け・文字化けが無いか）
- [ ] Next.jsアプリ側の環境変数（`EMF_CONVERTER_URL`・`EMF_CONVERTER_API_KEY`）を
      設定した状態でExcel取込を実行し、様式ＡのEMFスケッチがPNGとして取り込まれることを確認する

## 既知の制限・今後の改善候補

- 現状は認証情報未設定でも動作する（ローカル確認用のフォールバック）。
  本番運用前に`API_KEY`が必ず設定されていることを確認すること。
- 画像はフルパッケージの`libreoffice`を入れているためコンテナサイズが大きい
  （1GB前後）。動作確認後、`libreoffice-draw`等より絞ったパッケージ構成に
  縮小できる可能性がある。
- IAM認証（サービスアカウント＋IDトークン）への切り替えは未実施（上記参照）。
