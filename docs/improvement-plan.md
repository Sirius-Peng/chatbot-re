# 传讯改进任务书

> 基于 [工程性审阅报告](engineering-review.md) 和项目经理审阅意见制定
> 创建日期：2026-06-13
> 最后更新：2026-06-13（v2 — 融入 PM 审阅反馈）
> 执行周期：8 周（1 人全职）

---

## 一、执行原则

1. **先补安全网，再修可见问题，最后做深层重构** — 测试覆盖不到的地方不改
2. **技术债和产品价值交替推进** — 每 1-2 周技术改进后穿插 1 周功能开发
3. **每步独立提交，可独立回滚** — 不混合不相关的改动
4. **接受部分问题暂不解决** — 明确 Won't Do 清单，避免范围蔓延

---

## 二、Won't Do 清单

以下问题在审阅中被标记为 CRITICAL 或 WARNING，但**本轮不处理**，原因如下：

| 问题 | 编号 | 推迟理由 |
|------|------|----------|
| API Key 明文存储 | C-2 | 需要后端代理层，是全栈迁移的一部分，单独做没有意义 |
| 状态分散（五处可变） | C-5 | 根本解决需要引入状态管理框架，与"保持无框架"的架构决策冲突 |
| 单体 HTML（4,618 行） | C-10 | 拆分需要引入模板系统或构建工具，是工程化阶段的事 |
| 零无障碍属性（ARIA） | C-11 | 当前用户群优先级极低，推迟到 Vite 迁移后统一处理 |
| 全局命名空间污染 | C-3 | 大规模重构，风险高，收益不直接可见，推迟到有充足测试覆盖后 |
| 存储层混乱 | C-4 | 与全栈迁移方案（Prisma + PostgreSQL）冲突，可能做了白做 |
| 333 个 `!important` | W-C1 | 渐进修复，不设专项任务 |
| 798 个内联样式 / 336 个 onclick | C-12 | 依赖 HTML 拆分，推迟到工程化阶段 |

**决策依据：** 这些问题的根本解决依赖全栈迁移或构建工具引入。在当前架构下做部分修复，投入产出比低，且可能与未来迁移冲突。

---

## 三、成功指标

| 指标 | 当前值 | 目标值 | 衡量方式 |
|------|--------|--------|----------|
| CI 测试覆盖 | 0（不跑测试） | 部署前必须通过 | CI 配置 |
| E2E 测试数量 | 22 | 35+ | `npm run test:web` |
| ESLint errors | 0（规则被关） | 0（规则开启后仍为 0） | `npm run lint` |
| XSS 可利用点 | 2（消息+通知） | 0 | 代码审查 |
| 暗色模式异常页面 | 3（商城/萌宠/朋友圈） | 0 | 手动检查 |
| JS 控制台错误 | 未统计 | 0（正常操作路径） | 浏览器 DevTools |

---

## 四、周度执行计划

### 第 1 周：安全基线

> 目标：消除可被利用的安全漏洞，建立部署安全网。

#### Day 1：XSS 修复

**Step 1.1 — 消息渲染 XSS 修复**

- 对应问题：C-1
- 改动文件：`js/utils.js`、`js/core.js`
- 业务价值：防止恶意备份文件通过消息渲染执行任意 JavaScript

**操作：**

1. 在 `js/utils.js` 新增 `escapeHTML` 函数：
   ```javascript
   window.escapeHTML = function(str) {
       const div = document.createElement('div');
       div.textContent = str;
       return div.innerHTML;
   };
   ```
2. 修改 `js/core.js` 消息渲染（约行 1705）：
   ```javascript
   // 修改前
   let content = msg.text ? `<div>${msg.text.replace(/\n/g, '<br>')}</div>` : '';
   // 修改后
   let content = msg.text
       ? `<div>${escapeHTML(msg.text).replace(/\n/g, '<br>')}</div>`
       : '';
   ```
3. 修改系统消息渲染（约行 1564）：
   ```javascript
   systemMsgDiv.innerHTML = escapeHTML(msg.text);
   ```
4. 全局搜索 `innerHTML = msg` 和 `innerHTML =.*msg\.text`，逐一修复
- 回滚方案：单次 git revert，无数据迁移
- 验证：发送 `<img src=x onerror=alert(1)>` 确认不弹窗；`npm run test:web` 通过
- 提交：`fix(security): escape HTML in message rendering to prevent XSS`

**Step 1.2 — showNotification XSS 修复**

- 对应问题：W-S1 相关
- 改动文件：`js/utils.js`
- 业务价值：防止通过通知消息注入 HTML

**操作：**

修改 `showNotification`（约行 109）：
```javascript
// 修改前
notification.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}"></i><span>${message}</span>`;
// 修改后
const msgSpan = document.createElement('span');
msgSpan.textContent = message;
notification.innerHTML = `<i class="fas ${iconMap[type] || 'fa-info-circle'}"></i>`;
notification.appendChild(msgSpan);
```
- 回滚方案：单次 git revert
- 验证：`showNotification('<img src=x onerror=alert(1)>', 'info')` 不弹窗
- 提交：`fix(security): use textContent in showNotification to prevent XSS`

#### Day 2：CSS 修复 + CI 加测试

**Step 1.3 — diary.css 语法错误修复**

- 对应问题：W-C5
- 改动文件：`css/diary.css`
- 业务价值：修复日记/记账区域潜在的样式丢失

**操作：**

定位 `diary.css:1901` 附近多余的 `}` 闭合括号，删除。
- 回滚方案：单次 git revert
- 验证：日记功能样式正常
- 提交：`fix(css): remove extra closing brace in diary.css keyframes`

**Step 1.4 — CI 加入测试步骤**

- 对应问题：C-8
- 改动文件：`.github/workflows/deploy.yml`
- 业务价值：防止破坏性变更通过 CI 部署到生产环境

**操作：**

在 lint 和 build 之间添加：
```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
- name: Run E2E tests
  run: npm run test:web
```
添加浏览器缓存：
```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
```
- 回滚方案：移除添加的 step
- 验证：推送后 Actions 成功执行测试；故意破坏测试确认 CI 能失败
- 提交：`ci: add Playwright E2E tests to deployment pipeline`

#### Day 3：构建修复 + viewport

**Step 1.5 — 修复 Android 构建脚本**

- 对应问题：C-9
- 改动文件：`package.json`
- 业务价值：消除开发者的困惑（运行不存在的脚本报错）

**操作：**

移除 `package.json` 中引用不存在文件的 `test:android` 脚本。检查 `android:sync` 和 `android:build`，添加前置目录检查或注释说明需先运行 `npx cap add android`。
- 回滚方案：恢复 package.json
- 验证：`npm run android:sync` 给出明确提示而非崩溃
- 提交：`fix(build): repair or remove broken Android build scripts`

**Step 1.6 — 移除 viewport 缩放限制**

- 对应问题：C-11（无障碍）
- 改动文件：`index.html`
- 业务价值：允许视力不佳的用户放大页面，WCAG 2.1 AA 合规

**操作：**

```html
<!-- 修改前 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<!-- 修改后 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
- 回滚方案：单次 git revert
- 验证：手机双指缩放可用；页面布局缩放后不崩溃
- 提交：`fix(a11y): allow user zoom by removing viewport scale restrictions`

**第 1 周检查点：** `npm run test:web` 22 通过 + CI 包含测试 + XSS 已修复

---

### 第 2 周：测试安全网

> 目标：补充测试覆盖，为后续重构建立安全网。收紧 ESLint 防止新问题引入。

#### Day 1-2：ESLint 收紧

**Step 2.1 — ESLint 规则收紧**

- 对应问题：C-3 相关
- 改动文件：`.eslintrc.json` + 全项目
- 业务价值：捕获变量拼写错误和重复声明，防止新 bug 引入

**操作：**

1. 将以下规则改为 `error`：
   ```json
   "no-redeclare": "error",
   "no-undef": "error",
   "no-unused-vars": ["error", { "args": "none", "varsIgnorePattern": "^_" }],
   "no-useless-escape": "error"
   ```
2. 运行 `npm run lint` 查看新增 error
3. 逐一修复（预计主要是未声明变量和重复声明）
4. 确实需要的全局变量添加到 `globals` 配置
- 回滚方案：恢复 .eslintrc.json
- 风险：可能发现大量 error，工作量超出预期 → 应急方案：先只收紧 `no-redeclare`，其余下个迭代
- 验证：`npm run lint` 0 errors
- 提交：`lint: tighten ESLint rules for no-redeclare and no-undef`

#### Day 3-4：补充冒烟测试

**Step 2.2 — 补充缺失功能的冒烟测试**

- 对应问题：W-T2、C-7
- 改动文件：`tests/feature-regression.spec.js`
- 业务价值：为后续重构提供回归保障，覆盖 22 个未测试的功能模块

**操作：**

为以下功能添加打开/关闭冒烟测试：塔罗牌、小游戏、礼物柜、通话模拟、群聊、待办、经期记录、主题编辑器、红包。每个测试仅验证：按钮可点击、弹窗/页面打开、无 JS 错误。
- 回滚方案：移除新增测试
- 验证：`npm run test:web` 通过数从 22 增加到 31+
- 提交：`test: add smoke tests for uncovered features`

#### Day 5：Playwright 优化

**Step 2.3 — Playwright 配置优化**

- 对应问题：W-T4、W-T6
- 改动文件：`playwright.config.js`、`tests/*.spec.js`
- 业务价值：消除测试 flaky，提升 CI 可靠性

**操作：**

1. 将 `waitForLoadState('networkidle')` 替换为确定性等待：
   ```javascript
   await page.waitForLoadState('domcontentloaded');
   await page.waitForSelector('#home-container', { state: 'visible', timeout: 15000 });
   ```
2. 添加 HTML 报告器：
   ```javascript
   reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
   ```
- 回滚方案：恢复配置文件
- 验证：连续运行 3 次 `npm run test:web` 无 flaky
- 提交：`test: replace networkidle with deterministic wait strategy`

**第 2 周检查点：** `npm run lint` 0 errors + 测试 31+ 通过 + 连续 3 次无 flaky

---

### 第 3 周：用户可见的 CSS 修复

> 目标：修复用户可感知的 UI 一致性问题（暗色模式、弹窗层级）。

#### Day 1-2：暗色模式统一

**Step 3.1 — 统一暗色模式选择器**

- 对应问题：W-C2、W-C6
- 改动文件：`css/home.css`、`css/moments.css`、`css/shop.css`、`css/pet-style.css`
- 业务价值：暗色模式下不再出现亮色块，提升用户体验一致性

**操作：**

1. 统一为 `html[data-theme="dark"]` 选择器
2. `css/home.css`：`body.dark-mode` → `html[data-theme="dark"]`
3. `css/moments.css`：`.moments-container.dark-mode` → `html[data-theme="dark"] .moments-container`
4. 为 `css/shop.css` 和 `css/pet-style.css` 添加基础暗色模式变量
- 回滚方案：各文件独立提交，可单独 revert
- 风险：moments.css 约 800 行暗色模式样式需逐一修改 → 分两天完成
- 验证：切换暗色模式，逐页检查主页、聊天、朋友圈、商城、萌宠，无亮色块
- 提交：`fix(css): unify dark mode selectors to html[data-theme="dark"]`

#### Day 3-4：z-index 层级策略

**Step 3.2 — z-index 层级策略**

- 对应问题：W-C4
- 改动文件：`css/styles.css`、各 feature CSS
- 业务价值：消除弹窗叠加时的层级错乱问题

**操作：**

1. 在 `:root` 定义层级变量：
   ```css
   :root {
       --z-base: 1;
       --z-sticky: 100;
       --z-overlay: 1000;
       --z-modal: 5000;
       --z-elevated: 10000;
       --z-toast: 50000;
       --z-max: 99999;
   }
   ```
2. 逐步替换各文件硬编码 z-index
3. 删除所有超过 `--z-max` 的值
- 回滚方案：恢复各 CSS 文件
- 验证：弹窗叠加场景（设置 → 编辑 → 确认）层级正确
- 提交：`refactor(css): establish z-index scale with CSS custom properties`

#### Day 5：CSS 工具类提取

**Step 3.3 — 提取公共 CSS 工具类**

- 对应问题：W-C8
- 改动文件：`css/styles.css`
- 业务价值：新功能开发时减少重复代码，统一毛玻璃视觉效果

**操作：**

在 `styles.css` 末尾添加 `.glass` 工具类，含暗色模式适配。新功能使用此类，现有代码逐步替换（不强制一次性完成）。
- 验证：毛玻璃效果视觉不变
- 提交：`refactor(css): extract glass effect utility class`

**第 3 周检查点：** 暗色模式全页面正常 + z-index 无冲突 + 测试全部通过

---

### 第 4 周：产品功能周

> 目标：穿插用户可感知的新功能，保持产品活力和团队动力。

**可选方向（选择 1-2 个）：**

| 方向 | 工作量 | 用户价值 |
|------|--------|----------|
| 新增 2-3 个主题配色 | 小 | 个性化选择更丰富 |
| 消息搜索体验改善（高亮、历史跳转） | 中 | 提升聊天记录查找效率 |
| 表情包/贴纸库扩充 | 小 | 聊天趣味性 |
| 导出备份增加"最近 7 天"快捷选项 | 小 | 降低备份操作门槛 |
| AI 回复加载动画优化 | 小 | 等待体验改善 |

- 验证：新功能通过 E2E 测试
- 提交：`feat: [具体功能描述]`

**第 4 周检查点：** 1-2 个用户可见功能上线

---

### 第 5-6 周：性能优化

> 目标：解决用户可感知的性能问题（长对话卡顿、频繁存储写入）。

#### Day 1-3：增量渲染

**Step 5.1 — renderMessages 增量更新**

- 对应问题：W-J2、W-P1
- 改动文件：`js/core.js`
- 业务价值：长对话（100+ 消息）时滚动更流畅，主题切换不卡顿

**操作：**

1. 引入消息 diff 机制，用 `Set` 跟踪已渲染消息 ID
2. 仅追加新消息 DOM，仅移除已删除消息 DOM
3. 给每个消息元素添加 `data-msg-id` 属性
4. 保留 `forceRender()` 用于设置变更等需要全量重渲染的场景
- 回滚方案：恢复原 `renderMessages` 函数
- 风险：涉及 40+ 调用点，需逐一确认行为正确 → 充分测试
- 验证：发送 100 条消息滚动流畅；修改主题后样式正确；`npm run test:web` 通过
- 提交：`perf: implement incremental DOM updates for message rendering`

#### Day 4-5：存储写入优化

**Step 5.2 — saveData 批量写入优化**

- 对应问题：W-P3
- 改动文件：`js/core.js`
- 业务价值：减少 IndexedDB 写入压力，操作更跟手

**操作：**

1. 将 `saveData()` 中的 30 个并行 `setItem` 按批次执行（每批 5 个）
2. 或引入写入合并：短时间内的多次 saveData 调用合并为一次实际写入
- 回滚方案：恢复原 `saveData` 函数
- 验证：连续操作后 IndexedDB 数据完整；DevTools 确认写入次数减少
- 提交：`perf: batch localforage writes in saveData`

#### 备选：图片引用优化

**Step 5.3 — 消息图片引用优化（如时间允许）**

- 对应问题：W-P2
- 改动文件：`js/core.js`、`js/db.js`、`js/backup-engine.js`
- 业务价值：减少内存占用和存储序列化开销

**操作：**

将 base64 图片存入 Dexie 独立 `media` 表，消息中仅保留引用 ID。渲染时懒加载。备份引擎适配新引用结构。
- 风险：涉及备份引擎适配，工作量较大 → 仅在前两步完成后有余力时执行
- 验证：图片消息发送/接收/备份/恢复全流程正常
- 提交：`perf: store message images in separate Dexie table with references`

**第 5-6 周检查点：** 长对话滚动流畅 + IndexedDB 写入次数减少

---

### 第 7 周：安全加固 + 工程化决策

> 目标：加固上传服务安全，评估是否启动构建工具迁移。

#### Day 1-2：上传服务安全

**Step 7.1 — 上传服务安全加固**

- 对应问题：W-S4、W-S5、W-S6、W-S7
- 改动文件：`server/upload-server.js`
- 业务价值：防止未授权文件上传，保护 COS 存储桶安全

**操作：**

1. CORS 白名单：仅允许开发和生产域名
2. API Key 认证中间件
3. multer 文件类型白名单：仅允许图片和音频格式
4. 健康端点移除 bucket/region 信息
- 回滚方案：恢复原 upload-server.js
- 验证：无 Key 返回 401；上传 .exe 被拒绝；健康端点仅返回 `{ "ok": true }`
- 提交：`fix(security): add auth, file type whitelist, and restrict CORS on upload server`

#### Day 3-5：工程化决策

**Step 7.2 — Vite 迁移评估与 ADR**

- 对应问题：P3-1
- 改动文件：`docs/decisions/`（新增）
- 业务价值：为下一阶段的工程化升级做技术决策准备

**操作：**

1. 编写 ADR（Architecture Decision Record）：
   - 为什么选 Vite 而不是 esbuild / Rollup / Webpack
   - 迁移策略：渐进式（Vite 支持混合 `<script>` 和 `<script type="module">`）
   - 预期收益：minification、tree-shaking、HMR
   - 预期风险：隐式全局依赖暴露
2. 在独立分支尝试 Vite 最小接入（不合并），评估工作量
3. 根据评估结果决定：立即启动 / 推迟到下季度 / 放弃
- 验证：ADR 文档完成；独立分支 Vite 能跑通基本流程
- 提交：`docs: add ADR for Vite migration decision`

**第 7 周检查点：** 上传服务安全加固完成 + Vite 迁移决策文档完成

---

### 第 8 周：收尾 + 产品功能

> 目标：收尾零散改进，穿插产品功能，为下一阶段做准备。

#### Day 1-2：收尾

**Step 8.1 — 空 catch 块添加日志**

- 对应问题：W-J1
- 改动文件：全项目（重点 `home.js`、`reply-library.js`、`prompt-manager.js`）
- 业务价值：线上问题可追溯，减少"静默失败"排查时间

**操作：**

全局搜索 `catch(e) {}`，根据上下文替换为 `console.warn` 或 `console.error`。不改变业务逻辑。
- 验证：`npm run test:web` 通过
- 提交：`fix(logging): add console.warn/error to empty catch blocks`

**Step 8.2 — saveData 防抖**

- 对应问题：W-J3
- 改动文件：`js/core.js`
- 业务价值：减少非关键路径的存储写入

**操作：**

搜索直接调用 `saveData()` 的位置，将非关键路径改为 `throttledSaveData()`。
- 验证：连续快速发送消息，数据不丢失
- 提交：`perf: use throttledSaveData in non-critical paths`

#### Day 3-5：产品功能

穿插第 4 周未选方向中的 1 个功能开发。

**第 8 周检查点：** 全部计划 Step 完成 + 回归测试通过

---

## 五、依赖关系图

```
第 1 周（安全基线）
  ├── Step 1.1 XSS 修复 ─────────┐
  ├── Step 1.2 通知 XSS ─────────┤
  ├── Step 1.3 CSS 语法 ─────────┤── 全部无依赖，可并行
  ├── Step 1.4 CI 测试 ──────────┤
  ├── Step 1.5 Android 构建 ─────┤
  └── Step 1.6 viewport ─────────┘

第 2 周（测试安全网）
  ├── Step 2.1 ESLint 收紧 ──────┐
  ├── Step 2.2 冒烟测试 ─────────┤── 2.1 先行（ESLint 能发现测试中的问题）
  └── Step 2.3 Playwright 优化 ──┘── 2.2 先行（测试数量确认后再优化配置）

第 3 周（CSS 修复）
  ├── Step 3.1 暗色模式 ─────────┐
  ├── Step 3.2 z-index ──────────┤── 3.1 先行（颜色变量依赖统一后的选择器）
  └── Step 3.3 CSS 工具类 ───────┘── 独立

第 4 周（产品功能）── 独立，无技术依赖

第 5-6 周（性能优化）
  ├── Step 5.1 增量渲染 ─────────┐── 独立
  ├── Step 5.2 批量写入 ─────────┤── 独立
  └── Step 5.3 图片引用 ─────────┘── 依赖 5.1（渲染逻辑需适配）

第 7 周（安全+决策）
  ├── Step 7.1 上传服务 ─────────┐── 独立
  └── Step 7.2 Vite ADR ─────────┘── 独立

第 8 周（收尾）
  ├── Step 8.1 空 catch ─────────┐── 独立
  ├── Step 8.2 saveData 防抖 ────┤── 独立
  └── 产品功能 ──────────────────┘── 独立
```

---

## 六、里程碑与度量

| 检查点 | 时间 | 完成条件 | 度量指标 |
|--------|------|----------|----------|
| M0 | 第 1 周末 | 安全基线建立 | XSS=0、CI 含测试、22 测试通过 |
| M1 | 第 2 周末 | 测试安全网就绪 | lint 0 errors、31+ 测试通过、无 flaky |
| M2 | 第 3 周末 | CSS 一致性修复 | 暗色模式 0 异常页面、z-index 无冲突 |
| M3 | 第 4 周末 | 产品功能上线 | 1-2 个用户可见功能 |
| M4 | 第 6 周末 | 性能优化完成 | 长对话流畅、存储写入减少 |
| M5 | 第 7 周末 | 安全加固+决策 | 上传服务安全、Vite ADR 完成 |
| M6 | 第 8 周末 | 全部收尾 | 所有 Step 完成、回归通过 |

---

## 七、风险管理

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| ESLint 收紧发现大量 error | 中 | 中 | 应急方案：先只收紧 `no-redeclare`，其余下个迭代 |
| 暗色模式 CSS 改动量超预期 | 中 | 低 | moments.css 分两天完成，其余文件可推迟 |
| 增量渲染引入回归 | 中 | 高 | Step 2.2 先补齐测试覆盖；每改动一个调用点就跑测试 |
| Vite 迁移工作量过大 | 低 | 低 | 仅做评估 ADR，不做实际迁移；决策后可独立启动 |
| 团队动力下降（连续技术债） | 中 | 中 | 第 4 周和第 8 周穿插产品功能 |

---

## 八、与全栈迁移的关系

本轮改进计划**不阻塞**全栈迁移（Fastify + Prisma + PostgreSQL），具体关系：

| 本轮 Step | 与全栈迁移的关系 |
|-----------|------------------|
| XSS 修复 | 前端逻辑，全栈迁移后仍需保留 |
| CI 测试 | 基础设施，迁移后测试范围会扩大 |
| 暗色模式/z-index | 纯 CSS，与后端无关 |
| 性能优化 | 存储层优化在迁移后由 Prisma 接管，但渲染优化仍有效 |
| Vite ADR | 如果决定全栈迁移，Vite 是前端打包的自然选择 |

**决策点：** 第 7 周 Vite ADR 时，同步评估全栈迁移时间线。如果 6 个月内启动全栈迁移，Step 5.3（图片引用优化）可跳过，直接在迁移中用 Prisma 解决。

---

## 九、技术决策记录索引

| 编号 | 决策 | 日期 | 状态 |
|------|------|------|------|
| ADR-001 | Vite 迁移评估 | 第 7 周 | 待定 |
| ADR-002 | 全栈迁移时间线 | 第 7 周 | 待定 |
