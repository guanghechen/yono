# Yono Hand

面向 Doodle 画布的手写字体：中文采用清晰的硬笔行楷，英文采用接近 Excalidraw 的白板手写风格。手写感来自笔位、结构、提按与收锋，不添加随机抖动。

当前版本 **0.300** 提供 **Regular、Bold、Italic、Bold Italic** 四款独立字体。每款均覆盖 **21,316 个码点**，包含全部 **20,976 个目标汉字**、**95 个 ASCII 字符**和 **39 个额外标点、空白与符号**；全部目标汉字均使用新轮廓。

## 交付文件

- Regular（400）：[TTF](build/YonoHand-Regular.ttf) / [WOFF2](build/YonoHand-Regular.woff2)。
- Bold（700）：[TTF](build/YonoHand-Bold.ttf) / [WOFF2](build/YonoHand-Bold.woff2)。
- Italic（400）：[TTF](build/YonoHand-Italic.ttf) / [WOFF2](build/YonoHand-Italic.woff2)。
- Bold Italic（700）：[TTF](build/YonoHand-BoldItalic.ttf) / [WOFF2](build/YonoHand-BoldItalic.woff2)。
- [Web CSS](build/yono-hand.css)：四款 `@font-face`，统一使用 `font-family: 'Yono Hand'`。
- [四款实际 TTF 对照样张](artifacts/yono-variants-proof.png)：相同字号、字距下的中英文、复杂字与小字号正文。
- [SVG 字体样张](artifacts/yono-production-specimen.svg)：中西文组合、标点、复杂字和 24 px 正文。
- [完整 ASCII 母版](artifacts/yono-production-ascii.svg)及[中文字形检查页](artifacts/yono-production-chinese.svg)。
- [Regular 实际 TTF 对比样张](artifacts/yono-hand-v0.300-proof.png)：使用 FreeType 渲染，与清松 8 同字号、同基线对照。
- [构建报告](build/build-report.json)：重画清单、新增码点、覆盖统计、各 variant 的样式与垂直度量、产物尺寸与 SHA-256。
- 字体许可：[OFL](build/OFL.txt)及 [GlyphWiki 数据许可](build/GlyphWiki-LICENSE.txt)。

TTF 较大是因为保存了全量可编辑 quadratic 轮廓；网页使用 WOFF2。该版本满足“全部目标汉字完成后再交付可安装版本”的门槛，构建会拒绝缺少目标汉字的设计集。

四款共享 family、字符 advance width 与行高度量，切换样式不会改变文本宽度或默认行高。Bold 将自有母版的笔画宽度提高至 1.4 倍；Italic 将轮廓绕基线向右倾斜 10°，采用倾斜派生字形，尚未单独设计 cursive 字形。Bold Italic 同时应用两者。字体内包含独立轮廓及匹配的 weight、style flags、italic angle 与 caret slope，应用可通过常规 Bold / Italic 选择对应字体。

Web 使用时将 CSS 与四个 WOFF2 放在同一目录并引入 CSS；`font-weight: 400 / 700` 与 `font-style: normal / italic` 分别选择对应 variant。可设置 `font-synthesis: none` 禁用浏览器合成。

## 字形与来源

中文包含 44 个人工指定笔位的母版，其余 20,932 个目标汉字以 GlyphWiki 笔画及部件数据为结构底稿，由 Yono 的行楷笔画算法重建。SVG 和 TTF 共用轮廓生成代码。英文使用独立绘制的宽圆字腹、高挑竖笔和近等粗笔画，保留字母、数字和技术符号的辨识度。

- [中文与初版笔画](designs/xingkai/glyphs.ts)、[常用中文扩展](designs/xingkai/chinese-extension.ts)。
- [英文白板字形](designs/xingkai/whiteboard-latin.ts)、[其余 ASCII](designs/xingkai/latin-complete.ts)、[标点与符号](designs/xingkai/symbols.ts)。
- [认可的中文参考片段](designs/xingkai/approved-reference.png)来自本次 Lumina 编辑图；字形母版由笔画数据重新绘制。
- 英文参考 Excalidraw 官方 Virgil / Excalifont 的书写气质，[参考样张](designs/xingkai/whiteboard-reference.png)由官方字体渲染。
- [GlyphWiki 来源记录](sources/glyphwiki/UPSTREAM.md)、[固定结构数据](sources/glyphwiki/subset.json)和[许可](sources/glyphwiki/LICENSE.txt)。34,642 条数据记录完整保留部件依赖和固定版本引用；根节点优先采用大陆字形。
- 字体以[清松手写体 8](sources/jason-handwriting-8/JasonHandwriting8.ttf)的表结构和原始覆盖为基础，保留其版权与 [OFL](sources/jason-handwriting-8/OFL.txt)，使用独立名称。没有重新设计的 206 个码点在 Regular 中保留上游轮廓；其余款式对这些轮廓应用加粗或倾斜。继承字形的加粗使用半径 0.01 em 的重叠平移轮廓，保留曲线与字腔 winding。

GlyphWiki 的结构描述由项目内的解析器处理，使用自有笔画生成代码；没有引入 KAGE engine 软件包。正常构建不访问网络，两个来源文件均校验固定 SHA-256。

## 构建、导出与验证

使用 Node.js 24.2.0+、pnpm 12.4.1、TypeScript 7.0.2。现有第三方依赖为 `fonteditor-core`；GlyphWiki 为固定的数据输入。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm test
pnpm build
pnpm proof
pnpm proof:chinese
pnpm proof:production
pnpm proof:variants
```

`pnpm build --output /path/to/output` 可指定目录，一次生成四款 TTF、四款 WOFF2 和 CSS。报告顶层的轮廓变更清单以 Regular 为基准，`variants` 记录各款式的 metadata 与文件名。全部字体计算、目标覆盖检查及 WOFF2 编码完成后才写入产物，构建报告最后写入。写入阶段不是跨文件原子事务，遇到 I/O 错误时需重新构建。

按任意已覆盖文字导出可编辑的 SVG 轮廓，无需安装字体：

```sh
pnpm svg --text '宏观分层与依赖 · Doodle → 你好，世界！' --output artifacts/example.svg
```

`--size` 指定字号，`--font` 可指定其他已构建的 TTF。SVG 使用实际字体轮廓，保留 Unicode 标签，不依赖查看设备上的字体。

验证包含：

- 逐字核对全部目标汉字及 ASCII 的覆盖、编码后轮廓和 advance。
- 四款全部码点的 WOFF2 往返轮廓、度量、名称与映射一致性，以及款式间一致的覆盖和 advance width。
- 四款 family/style linking、weight、italic angle、caret slope 和 CSS 映射；中英文及继承字形的实际像素加粗与倾斜检查。
- 上游文件保护、未改写 glyph 字节、无关表、sfnt checksum、maxp 容量及垂直边界。
- 固定版本部件、嵌套变换、非线性拉伸、曲线类型和错误数据拒绝。
- 两次独立构建的字节级可重复性与真实产物哈希。
- 未改动字符相对于独立 0.100 基准的 FreeType 未 hinting 像素回归。新版英文会影响全局自动 hinting，故该检查明确关闭 hinting。

结构、映射和轮廓使用全量自动检查；视觉检查覆盖中西文样张、复杂字、易混字符以及多字号效果。样张渲染和像素回归需要 ImageMagick / FreeType；说明文字使用 macOS `STHeiti Light.ttc`，这些工具不参与字体构建。

## 字符覆盖边界

完整 Maple Mono NF CN 覆盖目标为 33,095 个码点，详见[原始基线](artifacts/coverage-baseline.json)。本版本覆盖其中 21,168 个，另外保留 148 个目标外码点。

- 目标汉字：20,976 / 20,976，全部重建。
- 尚未覆盖：10,379 个私用区码点和 1,548 个其他码点。
- 私用区图标尚未合入，后续合入时保留其语义和造型。

“目标汉字全部覆盖”不代表完整 Maple 字符集或所有 Unicode 字符都已覆盖。

## 代码与历史样张

- `src/pen.ts`：带笔压的闭合 quadratic 轮廓与 SVG 序列化。
- `src/glyphwiki.ts`：部件与笔画解析、行楷轮廓重建。
- `src/masters.ts`：生产字形组装、流式 CJK 生成、字体坐标转换。
- `src/variants.ts`：四款样式参数、倾斜及继承字形加粗。
- `src/derive.ts`、`src/cmap.ts`、`src/glyph.ts`、`src/sfnt.ts`：字体派生、Unicode 映射及必要二进制表更新。
- `scripts/build.ts`：来源校验、全量汉字交付检查、编码及产物报告。
- `scripts/import-glyphwiki.ts`：从官方快照提取目标及部件依赖；正常构建无需运行。

[03 版样张](artifacts/yono-xingkai-03-specimen.svg)、[04 版样张](artifacts/yono-xingkai-04-specimen.svg)和母版保留供风格对照。`pnpm study:xingkai` 重建 04 版探索样张；0.100 的独立验证字体保存在 [tests/fixtures](tests/fixtures/README.md)。早期 `handwriting-study-*` 是历史字形探索稿。
