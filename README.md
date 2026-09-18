# Yono 手写字体（工作名）

以开源清松手写体 8 为基础制作适用于 Doodle 画布的中文与西文手写字体。

## 已确定的方向

- 中文以清松 8 为基础。笔画应相对直、平滑、稳定，手写感来自字形结构、比例、倾斜与收笔，不添加随机抖动。
- 中文、西文、数字与标点统一视觉粗细、字面大小、基线和书写气质。
- 图标暂不重新设计；后续处理覆盖时保留已有图标语义与造型。
- 首先制作 Regular，再逐步补字；完整覆盖目标仍然保留。
- 修改版采用独立名称，保留作者版权与 OFL，原始字体单独保存。

## 来源与当前状态

[清松手写体 8 原始字体](sources/jason-handwriting-8/JasonHandwriting8.ttf)、[来源记录](sources/jason-handwriting-8/UPSTREAM.md)和 [OFL](sources/jason-handwriting-8/OFL.txt) 已收录。

当前预览版为 **Yono Hand Regular 0.101**：

- [TTF](build/YonoHand-Regular.ttf)：可安装字体文件。
- [WOFF2](build/YonoHand-Regular.woff2)：Web 字体文件。
- [五字重画样张](artifacts/yono-hand-v0.101-chinese-proof.png)：与 0.100 比较原句和单字，检查 24 / 32 / 48 / 72 px 及模拟加粗效果。
- [中西文对比样张](artifacts/yono-hand-v0.101-proof.png)：同字号、同基线渲染清松 8 和修改版。
- [构建报告](build/build-report.json)：变更字形、覆盖数量、度量数据、文件尺寸与 SHA-256。

0.101 重画「补、沿、缩、容、算」五个中文字形：明确衣字旁、三点水与绞丝旁的分笔，调整「容」的部件比例，分开「算」的竹字头及目部内白。笔画由手工指定的位置与粗细生成闭合的 quadratic 轮廓，保留轻微斜度、压力变化与圆润收笔，不添加随机抖动。五字沿用原有 advance，更新 left side bearing 以匹配新轮廓；其余字符与 0.100 一致。笔画数据集中在 [src/chinese.ts](src/chinese.ts)。

本版沿用 0.100 的 ASCII 调整：字母、数字和半角标点等比放大 20%，同步调整 advance；单词空格从 512 units 调整为 350 units。ASCII 曲线拓扑保持不变，仅进行坐标缩放与整数取整。垂直度量容纳全部字形，写入独立字体名称与完整 OFL 授权信息。参数集中在 [src/design.ts](src/design.ts)。

此版本保留基础字体的 9,461 个码点，尚未增加覆盖。完整 Maple 字符覆盖与图标合入仍待后续完成。样张已检查所用码点映射，但不代表原字库的所有字形写法已逐字审核。

## 构建与验证

使用 **Node.js 24.2.0+、pnpm 12.4.1 和正式版 TypeScript 7.0.2**。Node 直接执行 TypeScript，`tsc` 负责静态检查，`node:test` 负责测试。依赖版本固定在 [package.json](package.json) 与 [pnpm-lock.yaml](pnpm-lock.yaml)。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
pnpm test
pnpm build
pnpm proof
pnpm proof:chinese
```

`pnpm build --output /path/to/output` 可以指定输出目录。所有字体计算和 WOFF2 编码完成后才写入产物，构建报告最后写入；文件写入阶段并非跨文件原子事务，若发生 I/O 错误，修复后重新构建即可。

构建使用固定的原始字体并校验 SHA-256，保留上游固定时间戳。相同工具版本下，重复构建的 TTF、WOFF2 和报告一致。

测试包含 18 项检查，覆盖原字库保护、sfnt 校验和、码点映射、五字以外的全部 glyph 轮廓、所有字符的 advance、重画笔画的方向与 overlap 标记、字体命名与许可、垂直边界与 maxp 容量、WOFF2 往返、构建可重复性和未重画字符的实际像素回归。独立的 [0.100 基准](tests/fixtures/README.md)用于验证已有字体效果。重画字形的结构与可读性通过上述多字号样张人工检查。

测试的像素回归需要 ImageMagick / FreeType。PNG 样张额外使用 macOS 的 `STHeiti Light.ttc` 作为标题字体；这些工具不参与 TTF / WOFF2 构建。

六款已发布字体的对比图可使用包含对应字体文件的目录重新生成：

```sh
pnpm compare /path/to/font-files
```

## 代码结构

- [src/derive.ts](src/derive.ts)：纯字体变换，输入源字体字节和许可文本，返回 TTF 字节与变更信息。
- [src/chinese.ts](src/chinese.ts)：五个中文字形的手工笔画数据及闭合轮廓生成。
- `src/sfnt.ts`、`src/glyph.ts`、`src/names.ts`、`src/metrics.ts`：二进制表、轮廓、名称与测量数据操作。
- [src/font.ts](src/font.ts)：`fonteditor-core` 的读取与 WOFF2 编解码边界。
- [scripts/build.ts](scripts/build.ts)：文件读写、构建组装与报告输出。
- `scripts/render-proof.ts`、`scripts/render-chinese-proof.ts`、`scripts/compare-fonts.ts`：实际字体样张渲染。
- `sources/`：原始字体、上游记录与许可；`build/`：生成产物；`artifacts/`：覆盖清单与样张。

构建只重写必要的表，ASCII 与五个重画字以外的 glyph 保留原始字节，`cmap`、`GDEF`、`post` 等未修改表原样保留。重画笔画使用同向轮廓及 overlap 标记，更新 `maxp` 容量，并保留原字库的压缩 `hmtx` 布局。`fonteditor-core` 负责解析和 WOFF2 编解码，不使用其通用 TTF writer 重写整份字体。

## 字符覆盖基线

目标使用本机 Maple Mono NF CN 字体家族 16 个文件的 Unicode cmap 并集，共 33,095 个码点。每个参考文件的 SHA-256、完整目标清单与缺失清单见 [coverage-baseline.json](artifacts/coverage-baseline.json)。

- 清松 8 自身覆盖 9,461 个码点，其中 9,313 个属于目标清单，另有 148 个目标外码点。
- 汉字：目标 20,976 个，已覆盖 9,142 个，缺少 11,834 个。
- 私用区：目标 10,379 个，基础字体未覆盖；单独处理，现阶段不重画图标。
- 其他字符：目标 1,740 个，已覆盖 171 个，缺少 1,569 个。

这些数字表示码点映射，不代表字形设计质量、排版功能或图标语义已经通过验收。私用区也不自动等同于经过逐项确认的图标清单。

## 样张

- [Yono Hand 0.101 五字前后对比](artifacts/yono-hand-v0.101-chinese-proof.png)。
- [Yono Hand 0.101 中西文对比](artifacts/yono-hand-v0.101-proof.png)。
- [已发布字体对比](artifacts/handwriting-fonts-comparison.png)：真实字体文件渲染，使用共同繁体样本。
- `artifacts/handwriting-study-*` 是此前的原创字形探索草稿，不属于清松 8 衍生字体的构建输出；历史 SVG/PNG 与 [第二版笔画数据](artifacts/study-02-strokes.json)保留供参考。
