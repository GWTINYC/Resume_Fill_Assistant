# Resume Fill Assistant · Jev Apply（0.3 原型）

Chrome / Edge 浏览器扩展：在本机保存简历与个人资料，用 **DeepSeek 或 Jev** 识别网申字段，预览后由插件填入。

[下载最新版插件](https://github.com/GWTINYC/Resume_Fill_Assistant/releases/latest/download/jev-apply-extension.zip) · [版本发布记录](https://github.com/GWTINYC/Resume_Fill_Assistant/releases)

## 0.3 新增

- **DeepSeek 智能填写**：读取网页字段、已保存个人资料、备注和启用素材的文本，生成带原文出处的填写计划；用户可编辑建议，再点击填入。
- **保留 Jev**：原有字段映射、选项语义匹配和本地精确匹配继续可用。
- **PDF + TXT 多素材**：可同时保存多份，独立查看、下载原件、替换、删除，选择哪些素材供 DeepSeek 使用。
- **独立密钥与服务选择**：DeepSeek、Jev 密钥分别本地保存，切换、重启或清除其中一个不会影响另一个。
- 兼容 0.2 已保存的 Jev 密钥、个人资料和单份 PDF，无需重新导入。

## 安装与升级

建议使用最新稳定版 Chrome / Edge，最低声明版本为 Chromium 140，采用 Manifest V3。

1. 下载并解压 `jev-apply-extension.zip`。
2. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
3. 打开“开发者模式”，点击“加载已解压的扩展程序”。
4. 选择包含 `manifest.json` 的 `jev-apply` 文件夹，在工具栏固定扩展图标。

更新时覆盖原来的扩展文件夹，在扩展管理页点击“重新加载”，保持原路径和扩展身份。不要通过卸载重装来更新：卸载扩展、清除浏览器配置或改变扩展身份可能导致本地数据丢失。Chrome 和 Edge 各自保存资料，不做跨浏览器同步。

## 使用

1. 到普通网页点击扩展图标，打开“资料 / PDF / TXT”。
2. 导入一份或多份 PDF / TXT。原文件与文本自动本地保存。导入时会辅助识别邮箱和中国大陆手机号，供你核对。
3. 补充结构化资料、自定义项或零散备注，点击“保存个人资料”。使用 DeepSeek 时可直接利用素材文本，不必先把每项都整理为字段。
4. 在侧栏选择识别服务，输入该服务的官方 API key，点击“保存到本机”。两套密钥相互独立，浏览器重启后仍保留。
5. 打开网申页并点击扩展图标，选择“扫描当前页”。本地精确匹配无需密钥。
6. 点击“DeepSeek 智能填写”或“Jev 智能匹配”。
7. 核对待填内容、对应经历和勾选状态。DeepSeek 建议显示资料出处，内容可编辑；也可改为选择已保存的资料项。
8. 点击“填入勾选项”。已有内容默认跳过，只有明确允许覆盖时才覆盖。
9. 检查网站校验提示、附件和条款，自行点击下一步或提交。换页后重新扫描。

### 两种服务的区别

| 项目 | DeepSeek | Jev |
| --- | --- | --- |
| 当前模型 | `deepseek-flash` | `jev-1.13.0` |
| 主要用途 | 从资料与素材提取/整理字段值，生成填写计划 | 在已定义的资料项和网页选项中做语义选择 |
| 是否使用素材全文和备注 | 使用启用素材的文本与已保存备注 | 不使用 |
| 结果校验 | 字段 ID、控件支持情况、原文引用存在、选项合法性、日期格式等 | 候选 ID、概率与 confidence 门槛 |
| 用户核对 | 提议值、引用出处、对应经历 | 资料映射、选项含义 |

DeepSeek 的输出不是任意浏览器脚本。插件只允许填写扫描到的受支持字段，不运行模型提供的 JavaScript、选择器、导航或提交指令。引用检查只证明引文存在于资料中，不能证明模型的语义判断正确；仍需核对。

## 素材与本地持久化

- **PDF**：最大 20 MB，文本提取支持 40 页以内且有文本层的文件。加密、扫描版等文件可保留原件，读取失败会明确提示；不含 OCR。
- **TXT**：最大 2 MB，支持 UTF-8（包括 BOM）、带 BOM 的 UTF-16，以及 UTF-8 无法解码时回退 GB18030/GBK。拒绝空白或包含二进制控制字符的文件。
- 可同时保留 PDF 与 TXT。添加文件不会覆盖旧素材；需要更新时使用“替换这份素材”。
- 在素材列表选择一项后，可查看文本、查看原文件、下载原件或删除。下载保留原文件字节和文件名。
- 每份素材可勾选是否在 DeepSeek 填写时使用。关闭仅影响模型请求，不删除本地文件。
- 素材保存在本地 IndexedDB；个人资料、备注、服务选择及 API key 保存在扩展本地存储。
- 资料与备注可导出/导入 JSON。密钥不包含在资料 JSON 中，素材原文件通过下载功能单独备份。
- 结构化个人资料优先于素材中冲突的信息；无法确定时提示模型跳过。
- 单次 DeepSeek 请求使用的资料文本上限为 100,000 字符，过长时明确报错，请取消部分素材或缩短资料；不会静默截断。

扩展没有自己的服务器、遥测或云同步。本地存储没有额外加密；密钥不写入源码或分发包。

## 数据发送范围

**导入、编辑、扫描、本地名称匹配均在本机执行。** 只有点击当前服务的智能识别按钮才调用模型：

- **Jev**：字段标签、类型、邻近标题、选项文字、资料项目名称；选项语义匹配时额外发送相关的单项资料值。不发送素材全文或备注。
- **DeepSeek**：本批网页字段描述、已保存个人资料的标签和值、补充备注、启用素材的文本。不会上传原始 PDF / TXT 二进制文件。
- 填入后，目标网站自身可能即时保存输入。插件不控制目标网站的数据处理。

接口固定为官方服务：

- `POST https://api.typesafe.ai/v1/systemone`
- `POST https://api.deepseek.com/chat/completions`

权限为 activeTab、scripting、storage、sidePanel，加上述两个 API 域名；没有全站常驻读取权限。模型密钥只能由可信扩展上下文读取。

## 支持的网页操作

- 标准 HTML 文本、邮箱、电话、URL、数字输入框、textarea。
- 标准 select 单选下拉框、radio 单选组、原生 date / month。
- 从 label、aria-label、aria-labelledby、placeholder、name 和邻近标题识别字段。
- 同源、权限允许的 iframe，每框架最多扫描 100 项。
- 写入后发送 input/change 事件；具体网站框架仍需实际验证。
- 页面地址改变、字段失效、资料更新或 DeepSeek 素材变化时要求重新扫描。
- 不自动补造缺失日期；无效日期回滚；不默认覆盖已有内容。

仍需人工或专项适配：自制下拉框、级联地区、非原生日期控件、多选 checkbox、Shadow DOM、不可访问的跨域 iframe，以及“新增经历”区块。插件不会点击下一步、提交、条款同意、验证码、签名或上传附件。北森、Moka、Workday 等真实站点尚未专项验收，不能保证所有页面即装即用。

## 模型配置与验证

DeepSeek 根据调研时的官方文档采用 `deepseek-flash`、`response_format: {type: "json_object"}`、`thinking: {type: "disabled"}`，每批最多 12 个字段。空内容、无效 JSON、不完整输出或接口错误会提示；未知字段、无出处引文、重复字段、非法选项和不合法日期不进入执行计划。不使用模型自报置信度作为自动正确性的保证。

Jev 固定为 `jev-1.13.0`，每批最多 6 个问题；选中概率与 confidence 均至少为 0.80 才接受建议。该门槛是初始设置，不代表 80% 的正确率保证。

验证范围：

- 13 项核心测试：原有 Jev 行为、TXT 编码、素材发送范围、DeepSeek 输出校验等。
- Chrome for Testing 与 Edge：Jev 原有扫描/匹配/填写流程，PDF 读写、重启恢复、默认跳过、事件、iframe、日期回滚。
- Chrome for Testing 与 Edge：模拟 DeepSeek 官方 API 完成 TXT/备注识别、出处展示、编辑、填入、异常响应处理、服务/密钥隔离、多素材与重启恢复。
- 真实 Jev API 在此前版本中使用虚构资料联调通过。
- **没有提供 DeepSeek 密钥，因此尚未完成真实 DeepSeek 服务联调；本版该部分为模拟接口端到端验证。**
- 正式 Chrome 尚未通过普通界面手动安装验证。自动化使用 Chrome for Testing；测试临时副本添加 localhost 权限，交付包没有该权限。
- 未上传用户真实简历，也未使用真实网申账户验收。

## 开发

```sh
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run test:deepseek
```

安装 Edge 后，使用 `BROWSER_CHANNEL=msedge npm run test:browser` 和 `BROWSER_CHANNEL=msedge npm run test:deepseek` 验证。构建产物在 `dist/`。

主要模块：`src/storage.js`（密钥/素材持久化）、`src/deepseek.js`（填写计划与验证）、`src/core.js`（Jev 与资料映射）、`src/page.js`（网页扫描和填写）、`src/panel.js`（服务切换与预览）、`src/options.js`（资料与多素材管理）、`src/text-material.js`（TXT 解码）。

PDF 使用 Mozilla PDF.js，许可证随安装包保存在 `vendor/PDFJS-LICENSE`。所需 worker、字体和字符映射本地打包，不加载远程脚本。

官方接口参考：[DeepSeek 首次调用](https://api-docs.deepseek.com/)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode)、[Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)、[TypeSafe API](https://docs.typesafe.ai/api)。
