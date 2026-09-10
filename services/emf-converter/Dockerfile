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
# 各種依存ライブラリ: LibreOfficeの実行に必要なフォント・レンダリング関連ライブラリ。
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice \
      fonts-noto-cjk \
      fonts-dejavu \
      imagemagick \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server.js ./

# Cloud RunはPORT環境変数でリッスンポートを指定してくる（既定8080）。
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
