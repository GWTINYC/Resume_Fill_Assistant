# 同类项目复查与本轮借鉴（2026-10-08）

## 检索范围与证据

重新搜索公开网申自动填写产品、中文浏览器扩展和 GitHub 项目，并复查上轮重点仓库的 HEAD。产品支持范围是厂商声明；源码和测试文件可证明设计存在，但不代表在所有真实招聘页面上成功。本轮没有安装竞品或上传个人简历，也没有操作用户正在使用的招聘表单。

| 对象 | 本轮观察 | 取舍 |
| --- | --- | --- |
| [Simplify Copilot 官方帮助](https://help.simplify.jobs/help/articles/2415391-using-copilot-to-autofill-applications) | 说明相同问题可复用保存的回答；不支持的页面提供资料复制入口 | 参考复用与人工检查；不采用简历改写、上传或自动投递 |
| [Careerflow 官方帮助](https://help.careerflow.ai/en/articles/10008754-using-the-autofill-feature) | 文档列出具体支持平台，填写后仍要求检查 | 不把宣传页“任意网站”当作已验证的兼容保证 |
| [Resume Pro](https://github.com/TshyGO/resume-form-assistant-plugin/tree/9c486d2573a7dd8844b14704ce17108c0c35c470) | 10 月 7 日更新了网页已填内容的录入与保存前复核；控件实现有逐级等待和真实选中值检查 | 本轮重点参考控件状态、局部失败边界；保留我们已有的人工确认学习 |
| [OpenJobAutofill](https://github.com/Br1an67/OpenJobAutofill/tree/005eda98841b3671ead615ebfde5922f0dfd7c36) | HEAD 仍为 5 月 13 日；有站点适配和资料路径匹配 | 未发现上轮之后的新提交；继续参考分层思路 |
| [FieldMemory 分支](https://github.com/zhangqiyuan24/OpenJobAutofill-FieldMemory/tree/e8a8541611e64eb1cc5ded1e88d2b0b40800ce1e) | HEAD 仍为 9 月 8 日；记忆标签、类别与资料路径 | 不把自动写入成功当作人工确认，也不使用固定分值冒充概率 |
| [AI 简历填表助手](https://github.com/1lck/AI-Resume-Form-Filling-Assistant/tree/76c052d254da0b668ea1af9a1a2eb247dd3e62f8) | HEAD 仍为 9 月 5 日；有页面结构签名和映射缓存 | 借鉴缓存概念，独立实现；未复制 GPL-3.0 代码 |
| [HelpResume](https://github.com/funnyjacy/HelpResume/tree/caf6a78064cf5842249930bc2bd3448b429bb5cf) | 新纳入；README 介绍北森/Moka 与框架事件同步，也承认复杂级联控件存在限制 | 没有把平台名当作控件全面兼容证据；本轮不复用其代码 |
| [resume-bridge](https://github.com/cloud-oc/resume-bridge/tree/a904fa9b070de7c07ec7f5026cab0e6d8dfbb3b0) / [CampusApply-Agent](https://github.com/hanjiayuan2025-coder/CampusApply-Agent/tree/6dee3305534b01722136108bc2a478103dd92368) | 新纳入；强调结构化资料、ATS 适配与填写后检查 | GitHub 元数据未识别许可证，未直接取用代码；没有引入额外框架或服务 |

### 重点实现出处

- Resume Pro [custom-controls.js](https://github.com/TshyGO/resume-form-assistant-plugin/blob/9c486d2573a7dd8844b14704ce17108c0c35c470/custom-controls.js)：`readSelection`、逐层读取选项、父级激活后等待子级变化、重新读取选项后点击、核验实际已选内容。
- AI 简历填表助手 [content.js 的结构缓存](https://github.com/1lck/AI-Resume-Form-Filling-Assistant/blob/76c052d254da0b668ea1af9a1a2eb247dd3e62f8/content.js#L2342)：把站点路径和字段结构组合为缓存标识。
- FieldMemory [字段映射与复用](https://github.com/zhangqiyuan24/OpenJobAutofill-FieldMemory/blob/e8a8541611e64eb1cc5ded1e88d2b0b40800ce1e/src/content.js#L5148)：标签/类别及重复字段的区分。

本轮按现有接口独立实现以下两项改动，未复制上述项目实现，没有新增外部依赖、桌面程序或浏览器权限。

## 已落地：本地成功方案缓存

快速模式仅保存已完成网页写入和读回核验的模型建议；缓存与“用户已确认资料”分开。

- 页面标识包含完整 URL 的本地摘要、页面上下文与字段语义；查询参数或路由改变会失效，避免同一路径不同岗位之间误用。不持久保存原始 URL 或其中的参数。
- 字段签名包含标签、名称、类型、章节、经历、日期部分、格式限制及选项，不包含每次扫描生成的运行时 ID。缓存命中后重新绑定当前字段。
- 对启用素材的完整内容和拒绝反馈计算摘要。素材或反馈变化会让这代预测缓存全部失效，防止新材料里的更正/冲突被忽略；单个字段的标签、选项或经历改变只使对应项不命中。
- 每次复用仍重新核对引用原文、允许的素材范围、经历、日期、选项和长度；拒绝记录仍可阻止写入。
- 缓存命中仍为橙色待确认，不提高模型置信度。用户确认资料优先，严格模式不复用未独立复核的方案。
- 仅缓存可区分的主页面字段；同签名重复字段和子框架字段不缓存。子框架照常使用原来的填写流程。
- 保存期 7 天，最多 96 项、约 2 MB；过大单项不缓存。没有原文、操作失败或读回失败的字段不保存。
- 缓存读取失败时照常分析；缓存保存失败不把已成功填写改为失败，完成提示说明未保存加速记录。
- 清除个人资料时同步清除缓存，并递增清除代号，拒绝尚未完成的旧任务回写。缓存不加入资料导出或 PC 密钥文件，也不声称卸载后保留。

## 已落地：异步级联下拉按层等待

旧实现观察整个弹层是否稳定，再找下一级；父级早已稳定而子级仍在异步加载时，会过早报告缺少层级。

现在每一级分别等待：当前层已出现 → 选项稳定 → 唯一匹配 → 点击 → 子级出现或从旧分支更新。不会因为旧子级仍在页面上就提前点击。缺少层级、同名歧义、菜单关闭/替换、未提交选择仍返回明确失败，不计为成功；不点击招聘网站保存或提交。

## 验证

- 核心与缓存单元测试：68 项通过。
- 浏览器回归：缓存、复杂下拉、反馈、严格协作、Moka、北森、资料学习、经历新增，共 8 套通过。模型相关回归使用合成资料和模拟响应。
- 缓存端到端：首次 2 次模型请求，页面/侧栏重新打开后相同字段 0 次；选项编号改变时只重新分析该字段。缓存复用仍标橙，且没有产生人工确认资料。
- 级联回归：子级延迟约 1 秒时，0.10.2 的原实现稳定出现 `CASCADE_LEVEL`，新实现成功选择并读回；另测旧分支不被点击、子级永不加载时局部超时。
- 清除回归：删除资料同时删除缓存，旧任务晚到的写入被拒绝。
- 没有在真实招聘站点或 Windows 实机重跑；不把合成结果等同于所有页面的成功率。

## 后续可继续借鉴的方向

保持本版范围，后续优先评估：把已确认值与素材路径的长期关系一并保存、按稳定经历身份跨站复用，以及为更多控件增加诊断和局部重试。当前缓存不会在原文变化后直接套用旧预测，也不会替用户接受橙色项。
