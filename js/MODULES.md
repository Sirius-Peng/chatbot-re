# 传讯 (ChuanXun) JavaScript 模块结构

> 本文档记录脚本加载顺序和模块依赖关系，供重构参考。

## 脚本加载顺序

加载顺序在 `index.html` 中通过 `<script>` 标签定义，必须严格遵守依赖关系。

### Phase 1 — 第三方库
| 序号 | 文件 | 说明 |
|------|------|------|
| 1 | `assets/vendor/localforage/localforage.min.js` | IndexedDB 抽象层 |
| 2 | `assets/vendor/jszip/jszip.min.js` | ZIP 压缩（备份导出） |
| 3 | `assets/vendor/dexie/dexie.min.js` | IndexedDB ORM（消息存储） |

### Phase 2 — 核心基础设施
| 序号 | 文件 | 依赖 | 全局暴露 |
|------|------|------|----------|
| 4 | `js/config.js` | 无 | `APP_PREFIX`, `API_URL`, 常量 |
| 5 | `js/db.js` | config | Dexie 数据库实例 |
| 6 | `js/utils.js` | config | 工具函数 |
| 7 | `js/backup-engine.js` | utils | 备份/恢复引擎 |
| 8 | `js/state.js` | 无 | `SESSION_ID`, `messages`, `settings`, `DOMElements` 等全局状态 |
| 9 | `js/core.js` | state, config | `showModal`, `hideModal`, `homeShowModal`, `sendMessage`, `renderMessages`, `loadData`, `saveData` 等 |
| 10 | `js/home.js` | core, state | `showHomePage`, `hideHomePage`, `openApp`, `switchNav`, `showPetPage`, `showMomentsPage` 等 |

### Phase 3 — 功能模块
| 序号 | 文件 | 说明 |
|------|------|------|
| 11 | `js/features/mood.js` | 心晴手帐 |
| 12 | `js/features/envelope.js` | 信封投递 |
| 13 | `js/features/red-packet.js` | 红包 |
| 14 | `js/features/reply-library.js` | 字卡库 |
| 15 | `js/features/theme-editor.js` | 主题编辑器 |
| 16 | `js/features/group-chat.js` | 群聊 |
| 17 | `js/features/call.js` | 通话模拟 |
| 18 | `js/features/todo.js` | 待办清单 |
| 19 | `js/features/menstrual.js` | 经期记录 |
| 20 | `js/features/music.js` | 音乐播放器 |
| 21 | `js/features/chat-search.js` | 聊天搜索 |
| 22 | `js/features/prompt-manager.js` | 提示词管理 |
| 23 | `js/features/ai-engine.js` | AI 引擎 |
| 24 | `js/features/companion.js` | 陪伴模式 |
| 25 | `js/features/desktop.js` | 桌面模式 |

### Phase 4 — 独立功能模块
| 序号 | 文件 | 说明 |
|------|------|------|
| 26 | `js/diary.js` | 朝夕心记 |
| 27 | `js/accounting.js` | 同心记账 |
| 28 | `js/moyu.js` | 摸鱼小记 |
| 29 | `js/features/map.js` | Zmilk 地图 |

### Phase 5 — 应用胶水层 & 启动
| 序号 | 文件 | 说明 |
|------|------|------|
| 30 | `js/games.js` | 小游戏 |
| 31 | `js/features.js` | 功能聚合 |
| 32 | `js/data.js` | 数据管理弹窗 |
| 33 | `js/onboarding.js` | 引导流程 |
| 34 | `js/listeners-chat-actions.js` | **[P3 提取]** 聊天消息操作事件 |
| 35 | `js/listeners.js` | 主事件绑定入口 |
| 36 | `js/listeners-step2.js` | 补充事件绑定 |
| 37 | `js/listeners-voice.js` | 语音消息事件 |
| 38 | `js/listeners-sticker.js` | 贴纸事件 |
| 39 | `js/app.js` | **入口** — DOMContentLoaded 启动序列 |
| 40 | `js/pet-game.js` | 萌宠屋（动态加载） |
| 41 | `js/ta-phone.js` | TA 的手机（动态加载） |
| 42 | `js/shop.js` | 商城（动态加载） |
| 43 | `js/gift-cabinet.js` | 礼物柜 |
| 44 | `js/moments.js` | 朋友圈 |
| 45 | `js/tarot.js` | 塔罗牌 |

## 模块依赖图

```
config.js ──→ db.js ──→ utils.js ──→ backup-engine.js
                                          │
state.js ←────────────────────────────────┘
  │
  ├──→ core.js (showModal, hideModal, homeShowModal, loadData, saveData, renderMessages)
  │      │
  │      └──→ home.js (showHomePage, hideHomePage, openApp, switchNav)
  │
  ├──→ features/*.js (各自独立，通过 window 全局暴露)
  │
  ├──→ listeners-chat-actions.js (initChatActionListeners — 聊天操作事件)
  ├──→ listeners.js (setupEventListeners — 调用所有子初始化器)
  │
  └──→ app.js (DOMContentLoaded → setupEventListeners → initializeSession → loadData → showHomePage)
```

## 存储架构

| 存储层 | 用途 | 使用者 |
|--------|------|--------|
| **Dexie (ChuanXunDB)** | 消息、设置、模板、音频 | core.js, data.js |
| **localforage** | 会话级数据（日记、记账、地图） | diary.js, accounting.js, map.js |
| **localStorage** | 全局配置（商城余额、宠物状态、朋友圈） | shop.js, pet-game.js, moments.js |
| **IndexedDB (原始)** | 商城商品、朋友圈媒体 | shop.js (ShopDB), moments.js (MomentsVideoDB) |

## 存储键前缀规则

- **会话级**: `getStorageKey(key)` → `CHAT_APP_V3_{sessionId}_{key}`（diary, accounting, map）
- **全局级**: 直接使用裸键（shop, pet, moments）

## P3 模块拆分记录

### 已完成
- `listeners-chat-actions.js`: 从 `listeners.js` 提取 `initChatActionListeners`（聊天消息删除/撤回/@/回复/收藏/批量操作）
- 使用 IIFE + `window.initChatActionListeners` 模式
- `listeners.js` 中改为调用 `window.initChatActionListeners()`
