# 纯前端对话网页 - 实施计划

## 项目概述

基于 `api调用文档` 中的火山引擎知识库 API，构建一个纯前端对话聊天网页。由于 API 需要 V4 签名认证且存在跨域限制，需要搭配一个极轻量的 Node.js 签名代理服务；前端部分为纯 HTML + CSS + Vanilla JS，不依赖任何前端框架。

## API 调用流程

```
用户输入 → search_knowledge（检索知识库）→ generate_prompt（拼接系统提示词）→ chat/completions（流式对话补全）→ 流式渲染回复
```

1. **search_knowledge** — `POST /api/knowledge/collection/search_knowledge`：检索知识库，返回相关文档片段（point_id、content、doc_info、chunk_attachment 图片等）
2. **generate_prompt** — 前端根据搜索结果按文档规范拼接系统提示词
3. **chat/completions** — `POST /api/knowledge/chat/completions`：流式对话补全（model: Doubao-seed-1-8，支持 thinking 模式）

**核心约束**：API 采用火山引擎 V4 签名认证（需 AK/SK），且存在浏览器跨域问题。因此需要一个轻量签名代理。

---

## 技术方案

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端页面 | HTML + CSS + Vanilla JS | 无框架，纯原生 |
| 开发/代理服务 | Vite dev server | 提供 HMR + API 代理转发到签名服务 |
| 签名代理 |Express（~30行）| 处理 V4 签名 + 请求转发，AK/SK 仅存于服务端 |
| 流式传输 | Fetch + ReadableStream | 前端原生 SSE 流式读取 |
| 样式 | CSS Custom Properties + Flexbox | 现代CSS，响应式 |

---

## 文件结构

```
d:\方塘百科\
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式
├── js/
│   ├── main.js             # 入口：初始化、事件绑定、全局状态
│   ├── api.js              # API 封装：search + chat 流式调用
│   ├── chat.js             # 对话管理：消息历史、发送流程、generatePrompt
│   ├── stream-parser.js    # SSE 流解析器
│   └── message-renderer.js # 消息渲染：气泡、引用、图片、thinking
├── server/
│   ├── index.js            # Express 签名代理服务
│   └── signer.js           # V4 签名实现（移植自 Python）
├── package.json
├── vite.config.js
└── api调用文档              # 原始参考文档
```

---

## 详细实施步骤

### 步骤 1：项目初始化

- 创建 `package.json`（dependencies: express, cors, @volcengine/openapi 或 crypto 手动签名）
- 创建 `vite.config.js`，配置代理：`/api/knowledge` → `http://localhost:3001`
- 创建目录结构 `css/`、`js/`、`server/`

### 步骤 2：签名代理服务 (server/)

**server/signer.js**：
- 将 Python `prepare_request` 逻辑移植为 JS
- 使用 Node.js `crypto` 模块实现 HMAC-SHA256 V4 签名（或用 `@volcengine/openapi` SDK）
- 导出 `signRequest(method, path, body)` 函数

**server/index.js**：
- Express 服务，监听 3001 端口
- `POST /api/knowledge/collection/search_knowledge`：签名 → 转发到火山引擎 → 返回 JSON
- `POST /api/knowledge/chat/completions`：签名 → 转发 → 流式返回 SSE
- AK/SK 从环境变量或配置文件读取，不暴露给前端

### 步骤 3：主页面 (index.html)

布局：
```
┌─────────────────────────────────┐
│  顶部标题栏                      │
├─────────────────────────────────┤
│                                 │
│  聊天消息区域（可滚动）           │
│  - 用户消息（右侧蓝色）          │
│  - AI回复（左侧灰白色）          │
│    - 流式逐字显示                │
│    - 引用标签 / 图片渲染         │
│    - thinking 可折叠区域         │
│                                 │
├─────────────────────────────────┤
│  输入区域                        │
│  [📎] [文本输入框] [发送➤]      │
└─────────────────────────────────┘
```

### 步骤 4：样式 (css/style.css)

- CSS 变量定义主题色
- 用户气泡：`#4F6EF7` 蓝紫色，白字，右对齐
- AI气泡：`#F5F5F5` 浅灰，深色字，左对齐
- 聊天区域 `flex-grow` + `overflow-y: auto`，自动滚底
- 输入框 textarea 自适应高度
- 打字光标闪烁动画 `@keyframes blink`
- 响应式：手机/平板/桌面三档

### 步骤 5：API 调用层 (js/api.js)

- `searchKnowledge(query, imageQuery)` — POST 检索知识库
- `chatCompletion(messages, onChunk, onDone)` — 流式对话补全
  - 使用 `fetch` + `response.body.getReader()` 读取 SSE 流
  - 逐行解析 `data: {...}` 格式

### 步骤 6：对话管理 (js/chat.js)

- 维护 `messages` 数组（本地缓存对话历史）
- 发送流程：
  1. 用户消息加入 messages
  2. `searchKnowledge(query)` 获取搜索结果
  3. `generatePrompt(searchResult)` 拼接系统提示词（移植 Python 逻辑）
  4. 构建 messages：`[{role:"system", content: prompt}, ...历史, {role:"user", content: query}]`
  5. `chatCompletion(messages, onChunk, onDone)` 流式获取回复
  6. 完成后助手回复加入历史

**generatePrompt 逻辑移植**：
- 判断视觉模型（Doubao-seed-1-8 为视觉模型）
- 遍历 result_list，提取 point_id / doc_name / title / chunk_title / content
- 处理 FAQ 场景（original_question）
- 提取 chunk_attachment 图片链接
- 按视觉/非视觉模型构建 prompt（视觉模型用多模态 content 数组）

### 步骤 7：消息渲染 (js/message-renderer.js)

- `renderUserMessage(text, imageUrl?)` — 用户消息气泡
- `renderAssistantMessage()` — 创建空助手气泡，返回更新句柄
- `appendStreamText(text)` — 流式追加文本，解析特殊标签：
  - `<reference data-ref="xxx">` → 可点击引用标记
  - `<illustration data-ref="xxx">` → 图片预览
- `renderThinkingContent(text)` — thinking 可折叠区域
- `renderSources(sources)` — 消息底部来源标识

### 步骤 8：流式解析器 (js/stream-parser.js)

- 解析 SSE：`data: {"choices":[{"delta":{"content":"..."}}]}`
- 处理 `data: [DONE]` 结束标记
- 支持 `reasoning_content` 字段（thinking 模式）
- 提供 `onContent(text)` 和 `onThinking(text)` 回调

### 步骤 9：入口集成 (js/main.js)

- DOM 就绪后初始化各模块
- 绑定事件：发送按钮、Enter 键、图片上传按钮
- 全局状态管理（loading、streaming）
- 自动滚动到底部
- 错误友好提示

---

## UI 设计

### 配色
- 用户气泡：`#4F6EF7` / 白字
- AI气泡：`#F5F5F5` / 深色字
- 背景：`#EDEDED`
- 输入区：白色 + 顶部阴影
- 来源标签：`#E8F0FE` / `#4F6EF7`

### 交互
- 发送按钮：空内容禁用灰色，有内容高亮
- 流式回复显示打字光标
- 流式进行中禁止新消息发送
- 图片点击弹出大图
- 来源标签可展开详情

### 响应式
- 手机 < 640px：全宽
- 平板 640-1024px：最大宽 720px 居中
- 桌面 > 1024px：最大宽 860px 居中

---

## 实施优先级

1. 项目初始化 + 签名代理服务
2. 页面 HTML + CSS
3. API 调用层 + 流式解析
4. 消息渲染（气泡 + 流式文字 + 来源）
5. 对话管理（完整发送-接收流程）
6. 引用标签 + 图片 + thinking 渲染
7. 响应式适配 + 交互优化
