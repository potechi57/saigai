# EMF/WMF→PNG変換サーバー（Cloud Run用）。
# LibreOffice headless（soffice）を実行できる環境にNode.jsを載せただけの、
# シンプルなコンテナ。詳細はREADME.md・server.jsのコメント参照。

FROM node:20-bookworm-slim

# libreoffice: 変換エンジン本体（フルパッケージを入れて互換性を優先している。
#   MVPとして「まず確実に動く」ことを優先し、必要な機能だけに絞った軽量化は
#   動作確認後の課題としている）。
# fonts-noto-cjk: 日本語のカルテに含まれるスケッチ内の文字を正しく描画するため。
# imagemagick: LibreOfficeが書き出したPNGの周囲の余白（実際の絵より大きい
#   既定サイズのキャンバスになることがある）をトリミングするために使う
#   （EMF自体の変換には使っていない。PNG→PNGの単純なトリミングのみで、
#   server.jsコメントに記載のEMF変換に関する信頼性の懸念とは無関係）。
#   /convert-range（xlsx→PDF→PNG）ではPDFの1ページ目をラスタライズする用途にも使うが、
#   ImageMagickのPDF処理は内部的にGhostscript（gs）に委譲する作りのため、
#   ghostscriptを別途明示的にインストールしないと`convert input.pdf[0] ...`が
#   "no images defined"エラーで失敗する（--no-install-recommendsのため自動では
#   入らない。実機検証で確認済み）。
# 各種依存ライブラリ: LibreOfficeの実行に必要なフォント・レンダリング関連ライブラリ。
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice \
      fonts-noto-cjk \
      fonts-dejavu \
      imagemagick \
      ghostscript \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ImageMagickはDebianの既定ポリシー（/etc/ImageMagick-6/policy.xml）でPDFの読み込みを
# 禁止している（Ghostscript経由のPDF処理に起因する既知の脆弱性への一般的な対策）。
# /convert-range（printArea.js経由でxlsxをPDF化→1ページ目をPNG化）にはPDF読み込みが
# 必須のため、このコンテナ内でのみ許可に変更する（この変換対象は自分たちが管理する
# インフラ上でのみ動く、県が用意したExcelファイルであり、任意の外部PDFを処理する
# ものではないため許容している）。
RUN sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-6/policy.xml

WORKDIR /app
COPY package.json package-lock.json ./
# jszip（/convert-range向けに、xlsx内の列幅・行高・ページ余白を読み取るためだけに使用。
# printArea.js参照。xlsx自体は書き換えない）をインストールする。
# package-lock.jsonをコミットしているため、再現性のあるnpm ciを使う。
RUN npm ci --omit=dev
COPY server.js printArea.js ./

# Cloud RunはPORT環境変数でリッスンポートを指定してくる（既定8080）。
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
