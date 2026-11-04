# 左上角霍格華茲校徽

使用內建 imagegen，參考使用者在對話中提供的校徽附件，製作透明背景版本。
原始工具輸出保存在 `artwork/hogwarts-header-source.png`，介面資產為 `mods/malfoid-chrome/hogwarts-crest.png`（256×256 透明 PNG，等比例置中）。

## Prompt

Edit the user's attached Hogwarts school crest image. Remove ONLY the outer white background and the external drop shadow, leaving a genuinely transparent background. Preserve the supplied crest faithfully: the exact silhouette, ornate gold border, central large H, four red/green/blue/yellow quadrants with their animals, helmet/ornament above, and the ribbon motto below. Preserve all existing lettering as closely as possible. Keep original colors and illustration style; do not redesign, add elements, invent symbols, or crop any part of the crest. Center the complete crest with approximately 5 percent transparent padding. Intended use: a 22-pixel-high application header icon on a dark emerald background. Output a clean transparent PNG cutout, no white box, no checkerboard, no backdrop, no new text. This is background removal of the supplied image, not a new logo design.

