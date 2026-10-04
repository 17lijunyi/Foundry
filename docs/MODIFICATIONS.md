# 本分支修改记录

## Foundry 改造 · 2026-10-04

本阶段产品设计、定制与维护：[@17lijunyi](https://github.com/17lijunyi)。基于[周承健的产品经理工作台](https://github.com/Zhouchengjian-user/product-manager-workbench)继续改造，保留该项目与 AionUi / AionCore 的版权、许可证和历史记录。下方列出本阶段的主要行为及当前源码入口，不把既有基础功能重新声明为 Foundry 原创。

### 品牌、布局与材质

- **Foundry 品牌**：统一应用显示名称，采用填满画布的折带 F 图标，更新桌面、窗口与 PWA 资源。保留既有应用标识及“产品经理工作台”数据目录，开发版使用独立配置目录。见[品牌常量](../AionUi/packages/desktop/src/common/branding.ts)、[应用身份](../AionUi/packages/desktop/src/common/platform/appIdentity.ts)、[应用图标](../AionUi/resources/app.png)。
- **紧凑布局**：首页以输入区为中心，助手图标缩为 32px；保留搜索、选择和现有助手能力。导航、聊天、设置与模型对比采用统一玻璃主题。见[工作空间](../AionUi/packages/desktop/src/renderer/pages/guid/GuidPage.tsx)、[助手区域](../AionUi/packages/desktop/src/renderer/pages/guid/components/AssistantGallery.tsx)、[布局样式](../AionUi/packages/desktop/src/renderer/pages/guid/index.module.css)、[全局主题](../AionUi/packages/desktop/src/renderer/styles/themes/liquid-glass.css)。
- **原生玻璃**：macOS 26 使用公开 AppKit `NSGlassEffectView`，较早系统运行时使用 `NSVisualEffectView`；原生模块不可用时回退 CSS 半透明面板，其他平台保留浏览器主题。原生材质用于主面板、侧边导航和底部 Dock；内容动效不移动原生玻璃外层。编译要求与实现见[原生模块说明](../AionUi/packages/desktop/native/README.md)及[几何同步](../AionUi/packages/desktop/src/renderer/components/layout/Titlebar/useNativeGlass.ts)。

### 十种真实交互动效

| 动效       | 当前行为与源码                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 助手就位   | 用户切换后，助手图标及选择标记短促呼应；[AssistantGallery](../AionUi/packages/desktop/src/renderer/pages/guid/components/AssistantGallery.tsx)                                                                                                                                                                |
| 提示词接力 | 快捷提示词进入可继续编辑的输入草稿；[GuidInputCard](../AionUi/packages/desktop/src/renderer/pages/guid/components/GuidInputCard.tsx)                                                                                                                                                                          |
| 资料归位   | 已添加附件显示入场反馈，不伪造上传进度；[FilePreview](../AionUi/packages/desktop/src/renderer/components/media/FilePreview.tsx)                                                                                                                                                                               |
| 命令开扇   | 斜杠菜单展开及键盘选择的视觉反馈；[SlashCommandMenu](../AionUi/packages/desktop/src/renderer/components/chat/SlashCommandMenu/index.tsx)                                                                                                                                                                      |
| 消息交接   | 后端确认的新用户消息进入列表，历史和流式更新不重播；[MessageList](../AionUi/packages/desktop/src/renderer/pages/conversation/Messages/MessageList.tsx)                                                                                                                                                        |
| 思考折页   | 思考和工具步骤完成后一次折叠，支持重新展开，失败工具步骤保持可见；[MessageThinking](../AionUi/packages/desktop/src/renderer/pages/conversation/Messages/components/MessageThinking.tsx)、[步骤组](../AionUi/packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.tsx) |
| 草稿排队   | 新草稿加入队尾并更新数量，保留待发送状态；[CommandQueuePanel](../AionUi/packages/desktop/src/renderer/components/chat/CommandQueuePanel.tsx)                                                                                                                                                                  |
| 模型并行   | 各模型独立反馈运行、完成与真实耗时，不随每个文本片段重播；[BenchRunStatus](../AionUi/packages/desktop/src/renderer/pages/ModelBench/BenchRunStatus.tsx)                                                                                                                                                       |
| 改写对照   | 对比真实编辑前后内容，确认采纳后保存，撤回恢复为未保存草稿；[RevisionReview](../AionUi/packages/desktop/src/renderer/pages/conversation/Preview/components/RevisionReview/index.tsx)                                                                                                                          |
| 产物落桌   | 文件卡或链接打开后，源入口与右侧预览短距离呼应；[预览启动](../AionUi/packages/desktop/src/renderer/hooks/file/usePreviewLauncher.ts)、[文件链接](../AionUi/packages/desktop/src/renderer/components/Markdown/LocalFileLink.tsx)                                                                               |

共用[动效控制](../AionUi/packages/desktop/src/renderer/hooks/ui/useMotion.ts)响应系统“减少动态效果”，在页面隐藏或组件卸载时取消动画。业务状态不依赖动画结束回调；不加入整页玻璃转场。

### 失败处理与草稿保护

- **发送失败**：请求拒绝或返回失败时恢复提交文本，不播放成功发送反馈；用户已输入的新内容保留。切换会话后，失败内容恢复到原会话草稿，不注入新会话。见[SendBox](../AionUi/packages/desktop/src/renderer/components/chat/SendBox/index.tsx)、[草稿恢复](../AionUi/packages/desktop/src/renderer/hooks/chat/useSendBoxDraft.ts)。
- **队列已满或拒绝加入**：仅在入队成功后清理输入与附件，入队失败保留当前草稿。见[ACP 输入区](../AionUi/packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx)、[Aionrs 输入区](../AionUi/packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx)。
- **异步保存**：保存期间继续输入的新文本保持未保存状态，不能被较早请求的成功结果误标为已保存；保存失败不显示采纳成功，撤回也不会自动写回文件。见[预览状态与保存](../AionUi/packages/desktop/src/renderer/pages/conversation/Preview/context/PreviewContext.tsx)及[改写对照](../AionUi/packages/desktop/src/renderer/pages/conversation/Preview/components/RevisionReview/index.tsx)。

相关回归用例包括[动效生命周期](../AionUi/tests/unit/renderer/motion/)、[发送与会话切换](../AionUi/tests/unit/renderer/conversation/sendBoxActiveFocus.dom.test.tsx)、[ACP 队列拒绝](../AionUi/tests/unit/renderer/conversation/AcpSendBox.dom.test.tsx)、[Aionrs 队列拒绝](../AionUi/tests/unit/renderer/conversation/AionrsSendBox.dom.test.tsx)、[保存失败契约](../AionUi/tests/unit/renderer/saveContentRefusalContract.dom.test.tsx)。这些范围不代表对所有外部模型和所有平台的完整验收。

---

## 前代产品经理工作台：2026-09-18 原始记录

以下内容保留周承健对前代分支的修改记录；其中“当前源码”“此次发布”与文件数量均指该历史快照，不是本次 Foundry 改造的新增文件统计。原有两级上游基线与版权归属不变。

记录日期：2026-09-18。定制开发与维护：周承健。

本清单通过仓库当前源码与本机上游检出基线逐文件比对生成。“新增”指相对基线新增，不表示文件中的所有内容均独立原创。版权署名仅覆盖作者享有权利的贡献；上游版权声明保留。

此次发布新增产品 README、作者与版权说明、用户提供的产品截图。功能源码未在此次文档更新中改变。

## AionUi

上游： https://github.com/iOfficeAI/AionUi

比较基线：`6744099b279b991c17e31c243f0920477bd31cb6`。共 92 个新增或修改文件。

| 状态 | 文件 |
| --- | --- |
| 修改 | [.gitignore](../AionUi/.gitignore) |
| 新增 | [docs/guides/model-bench.zh-CN.md](../AionUi/docs/guides/model-bench.zh-CN.md) |
| 修改 | [mobile/assets/images/icon.png](../AionUi/mobile/assets/images/icon.png) |
| 修改 | [package.json](../AionUi/package.json) |
| 修改 | [packages/desktop/electron-builder.yml](../AionUi/packages/desktop/electron-builder.yml) |
| 新增 | [packages/desktop/src/common/branding.ts](../AionUi/packages/desktop/src/common/branding.ts) |
| 修改 | [packages/desktop/src/common/config/i18n-config.json](../AionUi/packages/desktop/src/common/config/i18n-config.json) |
| 修改 | [packages/desktop/src/index.ts](../AionUi/packages/desktop/src/index.ts) |
| 修改 | [packages/desktop/src/process/resources/builtinMcp/cdpBridge.ts](../AionUi/packages/desktop/src/process/resources/builtinMcp/cdpBridge.ts) |
| 修改 | [packages/desktop/src/process/resources/builtinMcp/cdpTargetProtocol.ts](../AionUi/packages/desktop/src/process/resources/builtinMcp/cdpTargetProtocol.ts) |
| 修改 | [packages/desktop/src/process/services/i18n/index.ts](../AionUi/packages/desktop/src/process/services/i18n/index.ts) |
| 修改 | [packages/desktop/src/process/utils/appMenu.ts](../AionUi/packages/desktop/src/process/utils/appMenu.ts) |
| 修改 | [packages/desktop/src/process/utils/runBackendMigrations.ts](../AionUi/packages/desktop/src/process/utils/runBackendMigrations.ts) |
| 修改 | [packages/desktop/src/process/utils/tray.ts](../AionUi/packages/desktop/src/process/utils/tray.ts) |
| 修改 | [packages/desktop/src/renderer/assets/logos/brand/app.png](../AionUi/packages/desktop/src/renderer/assets/logos/brand/app.png) |
| 修改 | [packages/desktop/src/renderer/components/agent/ChannelConflictWarning.tsx](../AionUi/packages/desktop/src/renderer/components/agent/ChannelConflictWarning.tsx) |
| 修改 | [packages/desktop/src/renderer/components/base/ButlerDiagnoseButton.tsx](../AionUi/packages/desktop/src/renderer/components/base/ButlerDiagnoseButton.tsx) |
| 修改 | [packages/desktop/src/renderer/components/chat/MobileActionSheet/useAttachEntry.tsx](../AionUi/packages/desktop/src/renderer/components/chat/MobileActionSheet/useAttachEntry.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/DocumentTitle.tsx](../AionUi/packages/desktop/src/renderer/components/layout/DocumentTitle.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/Layout.tsx](../AionUi/packages/desktop/src/renderer/components/layout/Layout.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/Router.tsx](../AionUi/packages/desktop/src/renderer/components/layout/Router.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/Sider/index.tsx](../AionUi/packages/desktop/src/renderer/components/layout/Sider/index.tsx) |
| 修改 | [packages/desktop/src/renderer/components/layout/Titlebar/index.tsx](../AionUi/packages/desktop/src/renderer/components/layout/Titlebar/index.tsx) |
| 修改 | [packages/desktop/src/renderer/components/media/FileAttachButton.tsx](../AionUi/packages/desktop/src/renderer/components/media/FileAttachButton.tsx) |
| 修改 | [packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx](../AionUi/packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx) |
| 修改 | [packages/desktop/src/renderer/components/settings/SettingsModal/contents/FeedbackReportModal.tsx](../AionUi/packages/desktop/src/renderer/components/settings/SettingsModal/contents/FeedbackReportModal.tsx) |
| 修改 | [packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx](../AionUi/packages/desktop/src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx) |
| 修改 | [packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx](../AionUi/packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelModalContent.tsx) |
| 修改 | [packages/desktop/src/renderer/hooks/assistant/useTalkToButler.ts](../AionUi/packages/desktop/src/renderer/hooks/assistant/useTalkToButler.ts) |
| 新增 | [packages/desktop/src/renderer/hooks/file/useAttachProjectFolders.ts](../AionUi/packages/desktop/src/renderer/hooks/file/useAttachProjectFolders.ts) |
| 修改 | [packages/desktop/src/renderer/hooks/file/useOpenFileSelector.ts](../AionUi/packages/desktop/src/renderer/hooks/file/useOpenFileSelector.ts) |
| 修改 | [packages/desktop/src/renderer/hooks/system/notification/useBrowserNotification.ts](../AionUi/packages/desktop/src/renderer/hooks/system/notification/useBrowserNotification.ts) |
| 修改 | [packages/desktop/src/renderer/hooks/system/notification/useDesktopTurnNotification.ts](../AionUi/packages/desktop/src/renderer/hooks/system/notification/useDesktopTurnNotification.ts) |
| 修改 | [packages/desktop/src/renderer/index.html](../AionUi/packages/desktop/src/renderer/index.html) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/ModelBench.module.css](../AionUi/packages/desktop/src/renderer/pages/ModelBench/ModelBench.module.css) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/client.ts](../AionUi/packages/desktop/src/renderer/pages/ModelBench/client.ts) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/index.tsx](../AionUi/packages/desktop/src/renderer/pages/ModelBench/index.tsx) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/stream.ts](../AionUi/packages/desktop/src/renderer/pages/ModelBench/stream.ts) |
| 新增 | [packages/desktop/src/renderer/pages/ModelBench/types.ts](../AionUi/packages/desktop/src/renderer/pages/ModelBench/types.ts) |
| 修改 | [packages/desktop/src/renderer/pages/TestShowcase.tsx](../AionUi/packages/desktop/src/renderer/pages/TestShowcase.tsx) |
| 修改 | [packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx](../AionUi/packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx) |
| 修改 | [packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx](../AionUi/packages/desktop/src/renderer/pages/conversation/platforms/aionrs/AionrsSendBox.tsx) |
| 修改 | [packages/desktop/src/renderer/pages/guid/components/AssistantSelectionArea.tsx](../AionUi/packages/desktop/src/renderer/pages/guid/components/AssistantSelectionArea.tsx) |
| 修改 | [packages/desktop/src/renderer/services/feedback/resolveFeedbackModule.ts](../AionUi/packages/desktop/src/renderer/services/feedback/resolveFeedbackModule.ts) |
| 修改 | [packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts](../AionUi/packages/desktop/src/renderer/services/i18n/i18n-keys.d.ts) |
| 修改 | [packages/desktop/src/renderer/services/i18n/index.ts](../AionUi/packages/desktop/src/renderer/services/i18n/index.ts) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/de-DE/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/de-DE/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/en-US/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/en-US/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/es-ES/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/es-ES/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/fa-IR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/fa-IR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/fr-FR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/fr-FR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/ja-JP/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/ja-JP/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/ko-KR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/ko-KR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/pt-BR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/pt-BR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/ru-RU/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/ru-RU/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/tr-TR/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/tr-TR/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/uk-UA/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/uk-UA/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/zh-CN/common.json) |
| 修改 | [packages/desktop/src/renderer/services/i18n/locales/zh-TW/common.json](../AionUi/packages/desktop/src/renderer/services/i18n/locales/zh-TW/common.json) |
| 新增 | [packages/desktop/src/renderer/services/i18n/startupLanguage.ts](../AionUi/packages/desktop/src/renderer/services/i18n/startupLanguage.ts) |
| 修改 | [packages/desktop/src/renderer/utils/file/fileSelection.ts](../AionUi/packages/desktop/src/renderer/utils/file/fileSelection.ts) |
| 修改 | [packages/shared-scripts/src/prepare-aioncore.js](../AionUi/packages/shared-scripts/src/prepare-aioncore.js) |
| 修改 | [public/manifest.webmanifest](../AionUi/public/manifest.webmanifest) |
| 修改 | [public/pwa/icon-180.png](../AionUi/public/pwa/icon-180.png) |
| 修改 | [public/pwa/icon-192.png](../AionUi/public/pwa/icon-192.png) |
| 修改 | [public/pwa/icon-512.png](../AionUi/public/pwa/icon-512.png) |
| 修改 | [resources/app.icns](../AionUi/resources/app.icns) |
| 修改 | [resources/app.ico](../AionUi/resources/app.ico) |
| 修改 | [resources/app.png](../AionUi/resources/app.png) |
| 修改 | [resources/app_dev.png](../AionUi/resources/app_dev.png) |
| 修改 | [resources/icon.png](../AionUi/resources/icon.png) |
| 修改 | [tests/unit/assets/prepareAioncoreLocalBundle.test.ts](../AionUi/tests/unit/assets/prepareAioncoreLocalBundle.test.ts) |
| 新增 | [tests/unit/common/branding.test.ts](../AionUi/tests/unit/common/branding.test.ts) |
| 修改 | [tests/unit/common/i18n.test.ts](../AionUi/tests/unit/common/i18n.test.ts) |
| 修改 | [tests/unit/cron/cronUtils.test.ts](../AionUi/tests/unit/cron/cronUtils.test.ts) |
| 修改 | [tests/unit/cron/useCronJobs.dom.test.ts](../AionUi/tests/unit/cron/useCronJobs.dom.test.ts) |
| 修改 | [tests/unit/feedback/resolveFeedbackModule.test.ts](../AionUi/tests/unit/feedback/resolveFeedbackModule.test.ts) |
| 修改 | [tests/unit/releasePackagingConfig.test.ts](../AionUi/tests/unit/releasePackagingConfig.test.ts) |
| 修改 | [tests/unit/renderer/conversation/sendBoxFolderChip.dom.test.tsx](../AionUi/tests/unit/renderer/conversation/sendBoxFolderChip.dom.test.tsx) |
| 修改 | [tests/unit/renderer/documentTitle.dom.test.tsx](../AionUi/tests/unit/renderer/documentTitle.dom.test.tsx) |
| 修改 | [tests/unit/renderer/i18nFormat.test.ts](../AionUi/tests/unit/renderer/i18nFormat.test.ts) |
| 新增 | [tests/unit/renderer/i18nStartup.test.ts](../AionUi/tests/unit/renderer/i18nStartup.test.ts) |
| 修改 | [tests/unit/renderer/layout/LayoutSiderBrandHome.dom.test.tsx](../AionUi/tests/unit/renderer/layout/LayoutSiderBrandHome.dom.test.tsx) |
| 新增 | [tests/unit/renderer/modelBench/comparison.test.ts](../AionUi/tests/unit/renderer/modelBench/comparison.test.ts) |
| 新增 | [tests/unit/renderer/modelBench/page.dom.test.tsx](../AionUi/tests/unit/renderer/modelBench/page.dom.test.tsx) |
| 新增 | [tests/unit/renderer/modelBench/stream.test.ts](../AionUi/tests/unit/renderer/modelBench/stream.test.ts) |
| 修改 | [tests/unit/renderer/updateMigrationInterception.dom.test.tsx](../AionUi/tests/unit/renderer/updateMigrationInterception.dom.test.tsx) |
| 修改 | [tests/unit/renderer/useBrowserNotification.dom.test.tsx](../AionUi/tests/unit/renderer/useBrowserNotification.dom.test.tsx) |
| 修改 | [tests/unit/renderer/useDesktopTurnNotification.dom.test.tsx](../AionUi/tests/unit/renderer/useDesktopTurnNotification.dom.test.tsx) |
| 修改 | [tests/unit/renderer/utils/fileSelection.test.ts](../AionUi/tests/unit/renderer/utils/fileSelection.test.ts) |
| 修改 | [tests/unit/settings/AboutModalContent.dom.test.tsx](../AionUi/tests/unit/settings/AboutModalContent.dom.test.tsx) |
| 修改 | [tests/unit/settings/AssistantSelectionArea.dom.test.tsx](../AionUi/tests/unit/settings/AssistantSelectionArea.dom.test.tsx) |

## AionCore

上游： https://github.com/iOfficeAI/AionCore

比较基线：`f11be9166fd235944ed8214fc18ee1ff254fa324`。共 20 个新增或修改文件。

| 状态 | 文件 |
| --- | --- |
| 修改 | [Cargo.lock](../AionCore/Cargo.lock) |
| 修改 | [crates/aionui-api-types/src/lib.rs](../AionCore/crates/aionui-api-types/src/lib.rs) |
| 修改 | [crates/aionui-api-types/src/provider.rs](../AionCore/crates/aionui-api-types/src/provider.rs) |
| 修改 | [crates/aionui-app/tests/agent_provider_health_e2e.rs](../AionCore/crates/aionui-app/tests/agent_provider_health_e2e.rs) |
| 修改 | [crates/aionui-system/Cargo.toml](../AionCore/crates/aionui-system/Cargo.toml) |
| 修改 | [crates/aionui-system/src/provider.rs](../AionCore/crates/aionui-system/src/provider.rs) |
| 新增 | [crates/aionui-system/src/provider/benchmark.rs](../AionCore/crates/aionui-system/src/provider/benchmark.rs) |
| 新增 | [crates/aionui-system/src/provider/benchmark_tests.rs](../AionCore/crates/aionui-system/src/provider/benchmark_tests.rs) |
| 修改 | [crates/aionui-system/src/routes.rs](../AionCore/crates/aionui-system/src/routes.rs) |
| 修改 | [crates/aionui-system/tests/provider_routes.rs](../AionCore/crates/aionui-system/tests/provider_routes.rs) |
| 修改 | [scripts/just/aionrs-changelog-footer.ps1](../AionCore/scripts/just/aionrs-changelog-footer.ps1) |
| 修改 | [scripts/just/aionrs-changelog-footer.test.ps1](../AionCore/scripts/just/aionrs-changelog-footer.test.ps1) |
| 修改 | [scripts/just/auto-commit-fixes.ps1](../AionCore/scripts/just/auto-commit-fixes.ps1) |
| 修改 | [scripts/just/build.ps1](../AionCore/scripts/just/build.ps1) |
| 修改 | [scripts/just/cargo.ps1](../AionCore/scripts/just/cargo.ps1) |
| 修改 | [scripts/just/cat-config.ps1](../AionCore/scripts/just/cat-config.ps1) |
| 修改 | [scripts/just/install.ps1](../AionCore/scripts/just/install.ps1) |
| 修改 | [scripts/just/update-aionrs.ps1](../AionCore/scripts/just/update-aionrs.ps1) |
| 修改 | [scripts/migration/check-immutability.ps1](../AionCore/scripts/migration/check-immutability.ps1) |
| 修改 | [scripts/migration/check-immutability.test.ps1](../AionCore/scripts/migration/check-immutability.test.ps1) |
