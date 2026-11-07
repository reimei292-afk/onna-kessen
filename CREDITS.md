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

## 天鳳：写真・古地図・海図（パブリックドメイン、Wikimedia Commons）
512px 以下に縮小して assets/th_photo/ に置いています。

- liner_1.jpg: Photograph of the main dining room on the salon deck of White Star Liner "Olympic" ... LCCN96503966.jpg — Public domain — https://commons.wikimedia.org/wiki/File:Photograph_of_the_main_dining_room_on_the_salon_deck_of_White_Star_Liner_%22Olympic%22_..._LCCN96503966.jpg
- liner_3.jpg: Prinses Juliana photo.jpg — Public domain — https://commons.wikimedia.org/wiki/File:Prinses_Juliana_photo.jpg
- liner_4.jpg: Zeelandia Liverpool Museums cropped.jpg — Public domain — https://commons.wikimedia.org/wiki/File:Zeelandia_Liverpool_Museums_cropped.jpg
- warship_1.jpg: Brazilian battleship Minas Geraes (1910-1952) (35534459624).jpg — Public domain — https://commons.wikimedia.org/wiki/File:Brazilian_battleship_Minas_Geraes_(1910-1952)_(35534459624).jpg
- warship_2.jpg: USS Indiana ggbain 09989.jpg — Public domain — https://commons.wikimedia.org/wiki/File:USS_Indiana_ggbain_09989.jpg
- land_1.jpg: Tagonoura.jpg — Public domain — https://commons.wikimedia.org/wiki/File:Tagonoura.jpg
- land2_1.jpg: Scottish painter - Scottish lake landscape in front of mountains.jpg — Public domain — https://commons.wikimedia.org/wiki/File:Scottish_painter_-_Scottish_lake_landscape_in_front_of_mountains.jpg
- land2_2.jpg: Mountain lake landscape.JPG — Public domain — https://commons.wikimedia.org/wiki/File:Mountain_lake_landscape.JPG
- map_1.jpg: 1794 Samuel Dunn Wall Map of the World in Hemispheres - Geographicus - World2-dunn-1794.jpg — Public domain — https://commons.wikimedia.org/wiki/File:1794_Samuel_Dunn_Wall_Map_of_the_World_in_Hemispheres_-_Geographicus_-_World2-dunn-1794.jpg
- map_2.jpg: 17th century world map - Nova Totius Terrarum Orbis Tabula.jpg — Public domain — https://commons.wikimedia.org/wiki/File:17th_century_world_map_-_Nova_Totius_Terrarum_Orbis_Tabula.jpg
- map_3.jpg: 17th century world map - Nova Totius Terrarum Orbis Tabula (Aquita).jpg — Public domain — https://commons.wikimedia.org/wiki/File:17th_century_world_map_-_Nova_Totius_Terrarum_Orbis_Tabula_(Aquita).jpg
- chart_1.jpg: Admiralty Chart No 2613 France N. Coast Sheet XI Cape Levi to Fecamp, Published 1894.jpg — Public domain — https://commons.wikimedia.org/wiki/File:Admiralty_Chart_No_2613_France_N._Coast_Sheet_XI_Cape_Levi_to_Fecamp,_Published_1894.jpg
- chart_2.jpg: A general chart of the west coast and western islands of Scotland from Cantire to Cape Wrath and Butt of the Lewis Mackenzie 74400887.jpg — Public domain — https://commons.wikimedia.org/wiki/File:A_general_chart_of_the_west_coast_and_western_islands_of_Scotland_from_Cantire_to_Cape_Wrath_and_Butt_of_the_Lewis_Mackenzie_74400887.jpg
- chart_3.jpg: 1853 U.S. Coast Survey Nautical Chart or Map of Nantucket, Massachusetts - Geographicus - Nantucket-uscs-1853.jpg — Public domain — https://commons.wikimedia.org/wiki/File:1853_U.S._Coast_Survey_Nautical_Chart_or_Map_of_Nantucket,_Massachusetts_-_Geographicus_-_Nantucket-uscs-1853.jpg
- chart_4.jpg: 1854 U.S. Coast Survey Nautical Chart or Map of Nantucket, Massachusetts - Geographicus - NantucketShoals-uscs-1854.jpg — Public domain — https://commons.wikimedia.org/wiki/File:1854_U.S._Coast_Survey_Nautical_Chart_or_Map_of_Nantucket,_Massachusetts_-_Geographicus_-_NantucketShoals-uscs-1854.jpg

## 天鳳：シネマの映画
- assets/th_film/kids_auto_race_1914.mp4: Charlie Chaplin "Kids Auto Race at Venice" (1914, Keystone) — Public Domain（Internet Archive の表示: http://creativecommons.org/licenses/publicdomain/）— https://archive.org/details/CC_1914_02_07_KidsAutoRaceAtVenice — 240p・音声なしに再エンコード
- assets/th_film/ouhou_*.jpg: 本作「桜鳳」ステージのゲーム内画面（自作）
