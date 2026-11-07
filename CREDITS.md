# クレジット（素材の出典）

- 山城・城下町・総構えの大城の質感：[`assets/yj_tex/CREDITS.md`](assets/yj_tex/CREDITS.md)
  - ambientCG（CC0）の写真の質感
  - 小田原城の写真から作った石垣・土塁の質感（Wikimedia Commons、CC BY-SA 4.0：Ymblanter／柴馬アワー）
- 侍女の写真のビルボード・three.js・モーションデータ：`README.md` の「侍女の見た目（写真のビルボード）とクレジット」「動きのデータ」
- 総構えの徴募の場面の私服の娘（`assets/conscripts/conscript_01〜08_*.webp`）：既にいる侍女（mob01・mob02・mob04・mob08・mob09・girl35・girl39・girl41）の写真を手がかりに画像生成で作り、rembg で切り抜いたもの。着替えた後は各自のいつもの写真に戻る。
- 声：edge-tts で生成（`tools/voice_profiles.py` の声の目録）

## 新武装客船「天鳳」（2026-11-07）
- assets/th_music/danube.mp3 — J. Strauss II「美しく青きドナウ」, European Archive 録音, CC0（Wikimedia Commons: "Strauss, An der schönen blauen Donau.ogg"）。64kbps モノラル mp3 に変換。
- assets/th_music/chopin.mp3 — F. Chopin「夜想曲 第2番 変ホ長調 Op.9-2」, 演奏 Peter Johnston, CC0（Wikimedia Commons: "Chopin Nocturne No. 2 in E Flat Major, Op. 9.ogg"）。64kbps モノラル mp3 に変換。
- assets/th_tex/*（チーク・絨毯・壁・船体・バルコニー）— 本作のために画像生成で作成。

## 天鳳 D6 画廊の絵（2026-11-07b）— すべてパブリックドメイン、Wikimedia Commons から 512px に縮小
- assets/th_art/great.jpg — 葛飾北斎「神奈川沖浪裏」（Tsunami_by_hokusai_19th_century.jpg）
- assets/th_art/fuji.jpg — 葛飾北斎「凱風快晴」（Red_Fuji_southern_wind_clear_morning.jpg）
- assets/th_art/pearl.jpg — ヨハネス・フェルメール「真珠の耳飾りの少女」（1665_Girl_with_a_Pearl_Earring.jpg）
- assets/th_art/milk.jpg — ヨハネス・フェルメール「牛乳を注ぐ女」（Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg）
- assets/th_art/starry.jpg — フィンセント・ファン・ゴッホ「星月夜」（Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg）
- assets/th_art/sunfl.jpg — フィンセント・ファン・ゴッホ「ひまわり」（Vincent_Willem_van_Gogh_127.jpg）
- assets/th_art/lilies.jpg — クロード・モネ「睡蓮」1906（Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg）

## 天鳳 2026-11-07c
- assets/th_art/almond.jpg — フィンセント・ファン・ゴッホ「花咲くアーモンドの枝」, パブリックドメイン（Wikimedia Commons: Vincent_van_Gogh_-_Almond_blossom_-_Google_Art_Project.jpg）。ガレリアの天井に使用。
- assets/th_models/* — Poly Haven（https://polyhaven.com）, CC0。dining_chair_02, round_wooden_table_01, Sofa_01, ArmChair_01, BarberShopChair_01, outdoor_table_chair_set_01, wooden_bookshelf_worn, metal_office_desk, coffee_table_round_01, dining_table。1k の glTF、色テクスチャのみ 512px に縮小。
- lib/GLTFLoader.js, lib/BufferGeometryUtils.js — three.js r158（MIT License, © three.js authors）。lib/three_shim.mjs は three.min.js を ES モジュールとして読むための橋（本作）。
