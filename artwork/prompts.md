# Imagegen 素材紀錄

工具：內建 `image_gen.imagegen`。2026-11-04 製作。

## 四態角色圖（已被 Agent UI Kit 人像取代）

目前 `mods/malfoid-agents/states/` 的 idle／working／thinking／blocked／done 取自 `malfoid/five-magical-portrait-states.png`（2172×724 去背，不進 git）。
依 alpha 質量最小處切成五段（x 切點 457／881／1301／1724），各自置中放進 543×724 透明畫布；idle 右緣一小段鄰格飄髮已清除。以下為先前透明四態圖的紀錄。

參考圖：`malfoid/奇幻女巫角色狀態素材表.png`。
輸出：`artwork/character-states-source.png`，2172×724，透明 PNG。
固定四等分，依序輸出 idle／working／blocked／done，單格 543×724。

提示詞：

> Production sprite asset for a native desktop app, using the attached character design sheet as the reference. Create ONE horizontal strip on truly TRANSPARENT background, divided into FOUR EQUAL WIDTH cells, each with generous empty transparent gutters. Exactly four separate depictions of the SAME young adult witch from the top row of the reference: consistent photorealistic face, ash blonde long hair with fringe, black and deep emerald school robe, white collar, green striped tie. Same scale and frontal 3/4 orientation, framing from above head to mid-thigh, aligned heads and bottom edge. Cell 1 IDLE: calm slight smile, holding a closed dark green book at chest. Cell 2 WORKING: concentrating, wand angled slightly downward drawing a small teal/mint light arc close to hands. Cell 3 BLOCKED/NEEDS INPUT: looking attentively toward viewer, both palms cradling a small antique-gold glowing orb at chest, questioning gentle expression. Cell 4 DONE: cheerful smile, holding wand upright with a small gold spark. Keep all particles inside each cell; all hair, hands, and props fully inside their cell. Style cinematic photography matching the reference, detailed but readable at small sizes. Palette deep emerald #061710, muted silver, antique gold #D4AF37, mint #73DD98, teal #60C5B0. No background, no ground, no panels, no text, no labels, no UI, no frame, no hats, no extra characters. Maintain anatomical correctness, two arms and five fingers per hand. Each of the four cell images isolated from its neighbors. This is a clean character sprite strip, NOT an infographic or mockup.

## 城堡背景

參考圖：`malfoid/849588186_17947215588356941_1398154726893359704_n.jpg`，只參考建築、服飾色調與燭光。
輸出：`mods/malfoid-chrome/academy.png`，1536×1024。

提示詞：

> Use the attached photograph ONLY as visual style and architectural reference. Generate a wide landscape cinematic environment background for a native coding-terminal app called Malfoid, 3:2 or wide landscape composition. An empty ancient gothic magic academy library/common room at night, tall stone arches, dark emerald drapes with subtle silver serpent ornament, bookcases, a few small warm candles, muted teal moonlight through distant lancet windows. Absolutely NO people, faces, figures, text, letters, logos, UI, badges, labels or watermark. Predominantly almost black forest green #050E0B with dark emerald #061710, subdued teal #60C5B0 and very sparse antique gold #D4AF37 candle accents. Low exposure and low contrast, detailed architecture at edges and quiet spacious dark center so terminal text will remain readable. The left quarter should also contain a complete appealing tall arch and candlelit bookshelf, usable as a cropped tall sidebar. Atmospheric sophisticated photorealistic movie still, gentle depth, no bright white light sources, no particles in central reading area.

## 頭像與 SVG

頭像由 `854914162_17965221030247356_7725255626878377497_n.jpg` 做固定正方形裁切與縮圖；
不重繪人物。房間、面板與徽章為手寫 SVG。原始照片保持不變。
