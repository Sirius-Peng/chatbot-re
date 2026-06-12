# 传讯全栈预设计：本地→云端数据模型映射

> 本文档定义从当前本地优先架构迁移到全栈云端架构的数据模型映射、同步策略和 API 设计。

---

## 1. 数据分类与同步策略

### 1.1 本地优先（Local-First，云端备份）

这些数据继续以本地为主，云端仅作备份/跨设备同步用途。

| 数据 | 当前存储 | 云端模型 | 同步方式 |
|------|----------|----------|----------|
| 聊天消息 | Dexie `messages` | `messages` 表 | 增量推拉，Last-Write-Wins |
| 用户设置 | Dexie `settings` | `user_settings.settings` JSONB | 全量覆盖 |
| AI 设置 | localStorage `aiSettings` | `user_settings.settings.ai` | 随设置同步 |
| 主题/外观 | localStorage `customThemes` | `user_settings.settings.theme` | 随设置同步 |
| 提示词模板 | Dexie `templates` | `templates` 表 | 增量推拉 |

### 1.2 仅云端（Cloud-Only）

这些数据需要用户系统支持，本地仅缓存。

| 数据 | 当前存储 | 云端模型 | 说明 |
|------|----------|----------|------|
| 用户账号 | 无 | `users` 表 | 新增注册/登录 |
| 角色/梦角 | localStorage | `characters` 表 | 可跨设备共享模板 |
| AI 代理 | 直连 API | 代理路由 | 隐藏 API Key |

### 1.3 会话级本地数据（Session-Scoped，可选同步）

这些数据按会话隔离，可选择性同步。

| 数据 | 当前存储 | 云端模型 | 同步方式 |
|------|----------|----------|----------|
| 朝夕心记 | localforage `diaryTodos` 等 | `diary_entries` 表 | 增量推拉 |
| 同心记账 | localforage `accountingRecords` | `accounting_records` 表 | 增量推拉 |
| 地图数据 | localforage `mapData` | `map_data` 表 | 全量覆盖 |

### 1.4 全局本地数据（Global，不同步）

这些数据是全局共享的，不需要云端同步。

| 数据 | 当前存储 | 云端模型 | 说明 |
|------|----------|----------|------|
| 商城商品/购物车 | IndexedDB `ShopDB` | 不同步 | 本地娱乐功能 |
| 萌宠屋状态 | localStorage `pixelPetGame` | 不同步 | 本地游戏 |
| 朋友圈 | localStorage `moments_data` | 不同步 | 本地模拟 |
| 摸鱼小记 | localStorage/localforage | 不同步 | 本地工具 |

### 1.5 媒体文件（File Backup）

| 数据 | 当前存储 | 云端模型 | 说明 |
|------|----------|----------|------|
| 头像 | localStorage base64 | 对象存储 URL | 上传后引用 |
| 语音 | Dexie `audioFiles` | 对象存储 URL | 上传后引用 |
| 贴纸 | localStorage base64 | 对象存储 URL | 上传后引用 |
| 聊天背景 | localStorage base64 | 对象存储 URL | 上传后引用 |
| 朋友圈图片/视频 | IndexedDB `MomentsVideoDB` | 不同步 | 本地娱乐 |

---

## 2. Prisma Schema 设计

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  username     String   @unique @db.VarChar(50)
  email        String   @unique @db.VarChar(100)
  passwordHash String   @map("password_hash") @db.VarChar(255)
  avatarUrl    String?  @map("avatar_url") @db.VarChar(500)
  role         String   @default("user") @db.VarChar(20)
  status       String   @default("active") @db.VarChar(20)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  characters    Character[]
  chatSessions  ChatSession[]
  userSettings  UserSettings?
  aiUsage       AiUsage[]
  resources     Resource[]

  @@map("users")
}

model Character {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  name       String   @db.VarChar(100)
  avatar     String?  @db.VarChar(500)
  greeting   String?
  voiceType  String?  @map("voice_type") @db.VarChar(50)
  isTemplate Boolean  @default(false) @map("is_template")
  category   String?  @db.VarChar(50)
  tags       Json?
  createdAt  DateTime @default(now()) @map("created_at")

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatSessions ChatSession[]

  @@map("characters")
}

model ChatSession {
  id          String   @id @default(uuid())
  userId      String   @map("user_id")
  characterId String?  @map("character_id")
  title       String?  @db.VarChar(200)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  character Character? @relation(fields: [characterId], references: [id], onDelete: SetNull)
  messages  Message[]

  @@map("chat_sessions")
}

model Message {
  id          String   @id @default(uuid())
  sessionId   String   @map("session_id")
  role        String   @db.VarChar(20)
  content     String
  messageType String   @default("text") @map("message_type") @db.VarChar(20)
  metadata    Json?
  createdAt   DateTime @default(now()) @map("created_at")

  session ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
  @@map("messages")
}

model UserSettings {
  userId    String   @id @map("user_id")
  settings  Json     @default("{}")
  updatedAt DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}

model AiUsage {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  model      String?  @db.VarChar(50)
  tokensUsed Int?     @map("tokens_used")
  createdAt  DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@map("ai_usage")
}

model Resource {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  type      String?  @db.VarChar(20)
  url       String   @db.VarChar(500)
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("resources")
}

// ===== 会话级同步数据 =====

model DiaryEntry {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  sessionId String   @map("session_id")
  type      String   @db.VarChar(20) // 'todo' | 'habit' | 'anniversary'
  data      Json
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([userId, sessionId])
  @@map("diary_entries")
}

model AccountingRecord {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  sessionId String   @map("session_id")
  type      String   @db.VarChar(20) // 'expense' | 'income'
  amount    Float
  label     String?
  note      String?
  date      String   @db.VarChar(10)
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, sessionId, date])
  @@map("accounting_records")
}

model Template {
  id   String @id @default(uuid())
  name String @db.VarChar(100)
  data Json

  @@map("templates")
}
```

---

## 3. 离线队列设计

### 3.1 离线操作队列

```javascript
// 离线操作队列结构（存储在 IndexedDB）
{
  id: auto-increment,
  type: 'CREATE' | 'UPDATE' | 'DELETE',
  entity: 'message' | 'settings' | 'diary' | 'accounting',
  entityId: string,
  payload: object,
  timestamp: number,
  retries: number,
  status: 'pending' | 'syncing' | 'failed'
}
```

### 3.2 同步流程

```
用户操作 → 写入本地 (IndexedDB/localforage)
           → 入队离线操作
           → 如果在线: 立即推送到云端
           → 如果离线: 等待网络恢复后批量推送

网络恢复 → 读取队列 → 按时间顺序推送 → 解决冲突 → 更新本地
```

### 3.3 冲突解决策略

| 场景 | 策略 |
|------|------|
| 消息 | Last-Write-Wins（按 timestamp） |
| 设置 | 云端覆盖（用户主动同步时） |
| 日记/记账 | 字段级合并（新增条目追加，修改条目取最新） |
| 媒体文件 | 上传成功后替换本地引用 |

---

## 4. API 设计（保留离线支持）

### 4.1 认证 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（username, email, password） |
| POST | `/api/auth/login` | 登录（返回 accessToken + refreshToken） |
| POST | `/api/auth/refresh` | 刷新 accessToken |
| POST | `/api/auth/logout` | 登出（黑名单 refreshToken） |

### 4.2 同步 API（核心）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sync/pull?since={timestamp}` | 拉取变更（返回 `{messages, settings, templates, timestamp}`） |
| POST | `/api/sync/push` | 推送变更（body: `{operations: [{entity, type, id, data, timestamp}]}`） |
| GET | `/api/sync/full` | 全量同步（首次登录时使用） |

### 4.3 AI 代理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/chat` | 代理 AI 请求（流式 SSE，隐藏 API Key） |
| GET | `/api/ai/models` | 获取可用模型列表 |

### 4.4 文件上传 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload/avatar` | 上传头像 |
| POST | `/api/upload/voice` | 上传语音 |
| POST | `/api/upload/resource` | 上传通用资源 |

---

## 5. 迁移路径

### 阶段 1: 后端基础（不改前端）
1. 搭建 Fastify + Prisma + PostgreSQL
2. 实现认证 API
3. 实现同步 API（接受前端格式的 JSON）
4. Docker Compose 本地开发环境

### 阶段 2: 前端适配层（最小改动）
1. 新增 `js/api.js` — fetch 封装 + 离线队列
2. 新增 `js/auth.js` — 登录/注册/令牌管理
3. 修改 `js/app.js` — 启动时检查登录状态
4. 保留所有现有 localStorage/IndexedDB 操作不变

### 阶段 3: 渐进式同步
1. 设置同步（最容易，单键值）
2. 消息同步（核心功能）
3. 日记/记账同步
4. 媒体文件上传

### 阶段 4: 管理后台
1. 用户管理
2. 内容审核
3. 数据统计

---

## 6. 技术决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 后端框架 | Fastify | 高性能，TypeScript 友好 |
| ORM | Prisma | 类型安全，迁移管理 |
| 认证 | JWT + Refresh Token | 无状态，适合 SPA |
| 缓存 | Redis | 会话存储 + 限流 |
| 对象存储 | MinIO (开发) / COS (生产) | 兼容 S3 API |
| 离线策略 | IndexedDB 队列 | 与现有 localforage 架构一致 |
| 冲突解决 | Last-Write-Wins | 简单可靠，适合单用户场景 |
