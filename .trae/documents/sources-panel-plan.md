# 检索结果面板重构计划

## 需求

将当前 AI 回复气泡底部的 `sources` 标签列表改为：

1. **收起状态**：气泡底部显示一行可点击摘要，如 `📎 10 个知识分片`
2. **展开右侧面板**：点击后从右侧滑出面板，列出所有知识分片
3. **分片列表**：每项为1个知识分片（文档名 + chunk 标题 + 类型图标）
4. **分片详情**：点击知识分片后查看完整详情（调用 `/api/knowledge/point/list` 接口获取完整信息）

## 涉及的文件

| 文件 | 修改内容 |
|------|---------|
| `index.html` | 新增右侧面板 HTML 结构 |
| `css/style.css` | 新增面板样式、修改 sources 样式 |
| `js/message-renderer.js` | 重写 `setSources` 为摘要行 + 绑定面板打开事件 |
| `js/chat.js` | 传递完整 point 原始数据到 sources 回调 |
| `js/api.js` | 新增 `getPointList(pointIds)` 方法 |
| `server/index.js` | 新增 `/api/knowledge/point/list` 代理路由 |

## 关键 API：分片详情查询

**接口**：`POST /api/knowledge/point/list`

**请求参数**：
```json
{
  "collection_name": "fangxiaotang",
  "project": "default",
  "point_ids": ["point_id_1", "point_id_2"],
  "get_attachment_link": true
}
```

**响应字段**（每个 point 完整信息）：
- `point_id` — 切片 ID
- `content` — 切片内容（全文）
- `chunk_title` — 切片章节标题
- `chunk_id` — 切片所在章节 ID
- `original_question` — FAQ 类型对应问题
- `process_time` — 处理时间
- `doc_info` — 所属文档信息：
  - `doc_id`、`doc_name`、`doc_type`、`description`、`source`、`title`
  - `original_coordinate` — 原始位置坐标（PDF/PPT）
  - `create_time` — 创建时间
- `md_content` — Markdown 解析结果（table 类型切片）
- `html_content` — HTML 解析结果（table 类型切片）
- `chunk_attachment` — 图片附件列表（含临时下载链接）
- `score` / `rerank_score` — 检索得分 / 重排得分
- `video_start_time` / `video_end_time` — 视频切片时间
- `audio_start_time` / `audio_end_time` — 音频切片时间

## 详细步骤

### 步骤 1：server/index.js — 新增 point/list 代理路由

```javascript
app.post('/api/knowledge/point/list', async (req, res) => {
  const { url, headers, body } = buildSignedRequest('POST', '/api/knowledge/point/list', req.body)
  const response = await fetch(url, { method: 'POST', headers, body })
  const data = await response.text()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(response.status).send(data)
})
```

### 步骤 2：js/api.js — 新增 getPointList 方法

```javascript
export async function getPointList(pointIds) {
  const body = {
    collection_name: 'fangxiaotang',
    project: 'default',
    point_ids: pointIds,
    get_attachment_link: true
  }
  const res = await fetch('/api/knowledge/point/list', { ... })
  return res.json()
}
```

### 步骤 3：index.html — 新增右侧面板

在 `#app` 同级添加：

```html
<div class="sources-panel" id="sourcesPanel">
  <div class="sources-panel-overlay" id="sourcesPanelOverlay"></div>
  <div class="sources-panel-content">
    <div class="sources-panel-header">
      <span class="sources-panel-title">检索结果</span>
      <button class="sources-panel-close" id="sourcesPanelClose">✕</button>
    </div>
    <!-- 列表视图 -->
    <div class="sources-panel-list" id="sourcesPanelList"></div>
    <!-- 详情视图 -->
    <div class="sources-panel-detail" id="sourcesPanelDetail" style="display:none;">
      <button class="sources-detail-back" id="sourcesDetailBack">← 返回列表</button>
      <div class="sources-detail-body" id="sourcesDetailBody"></div>
    </div>
  </div>
</div>
```

### 步骤 4：chat.js — 传递完整 point 原始数据

修改 `onSources` 回调，直接传递 `points` 原始数组（包含 point_id、content、doc_info 等所有字段），而非精简对象。

### 步骤 5：message-renderer.js — 重写 setSources

1. 气泡底部不再显示标签列表，改为 `.sources-summary`：
   ```
   📎 10 个知识分片  >
   ```
2. 点击摘要行 → 调用 `openSourcesPanel(points)` 打开右侧面板
3. 面板列表项动态生成，每项显示：
   - 左侧图标：📄 文本 / 🖼️ 图片（有 chunk_attachment 时）
   - 第一行：`doc_name`（加粗）
   - 第二行：`chunk_title` 或 `content` 前 50 字（小字灰色）
4. 点击列表项 → 调用 `getPointList([pointId])` 获取完整信息 → 展示详情
5. 详情页展示完整分片信息：
   - 文档名、文档类型、文档标题
   - 切片 ID、切片标题
   - 切片完整内容（content）
   - 如果有 `md_content` / `html_content`，显示 Markdown/HTML 版本
   - 附件图片（如有，缩略图可点击放大）
   - 检索得分 / 重排得分
   - 原始位置坐标（PDF/PPT）
6. 点击返回 → 回到列表视图

### 步骤 6：css/style.css — 新增面板样式

**面板结构**：
- `sources-panel`：fixed 定位，覆盖整个视口
- `sources-panel-overlay`：半透明黑色遮罩
- `sources-panel-content`：右侧滑出，宽度 380px，白色背景
- 滑入动画：`transform: translateX(100%)` → `translateX(0)`，0.3s ease

**摘要行样式**：
- 替代原 `.sources`，显示为单行可点击按钮
- 蓝色文字 + 右箭头图标，hover 背景变浅蓝

**列表项样式**：
- 卡片式，padding 12px，border-bottom 分隔
- 左边图标 24px，右边文字区
- 文档名 font-weight: 600，chunk_title font-size: 13px 灰色
- hover 背景浅蓝

**详情页样式**：
- 字段 label 小字灰色 + value 深色上下排列
- content 区域：等宽字体，浅灰背景圆角，padding 12px，white-space: pre-wrap
- md/html 内容：正常渲染
- 附件图片：max-width 100%，圆角，可点击放大
- 得分：数字高亮

**响应式**：
- 手机 < 640px：面板全宽
- 桌面：面板固定 380px

### 步骤 7：main.js — 绑定面板全局事件

- `#sourcesPanelClose` 点击 → 关闭面板
- `#sourcesPanelOverlay` 点击 → 关闭面板
- `#sourcesDetailBack` 点击 → 返回列表
- `Escape` 键 → 关闭面板

## 交互流程

```
AI 回复气泡底部:
  ┌────────────────────────────────┐
  │ 📎 10 个知识分片            > │  ← 点击
  └────────────────────────────────┘
                  ↓
  ┌──────────┬──────────────────────────────────┐
  │          │ 检索结果                    ✕ │
  │  遮罩    │──────────────────────────────────│
  │          │ 📄 四柱八字.xlsx                   │ ← 列表项，点击
  │          │    日元强弱取喜忌用神               │
  │          │──────────────────────────────────│
  │          │ 🖼️ 【确定版2】四柱八字.pptx        │
  │          │    子平学                           │
  │          │──────────────────────────────────│
  │          │ ...                                │
  └──────────┴──────────────────────────────────┘
                  ↓ 点击某项 (调用 point/list 接口获取完整信息)
  ┌──────────┬──────────────────────────────────┐
  │          │ ← 返回列表                 ✕ │
  │  遮罩    │──────────────────────────────────│
  │          │ 文档：四柱八字.xlsx                  │
  │          │ 类型：xlsx                           │
  │          │ 标题：四柱八字                        │
  │          │ 切片标题：日元强弱取喜忌用神          │
  │          │ 得分：0.89                           │
  │          │──────────────────────────────────│
  │          │ 这里是完整的分片内容文本...           │
  │          │                                    │
  │          │ [附件图片缩略图]                     │
  └──────────┴──────────────────────────────────┘
```

## 数据流

```
search_knowledge 返回 result_list (含基本分片信息)
  → setSources(points) 渲染摘要行 → 缓存 points
  → 用户点击摘要行 → openSourcesPanel(points) → 渲染列表
  → 用户点击列表项 → getPointList([pointId]) → 获取完整分片信息
  → 渲染详情页
```

注意：`search_knowledge` 返回的 `result_list` 中已包含 `content`、`point_id`、`doc_info` 等基本字段，列表展示可直接使用。只有点击查看详情时才需要调用 `point/list` 接口获取更完整的信息（如 `md_content`、`html_content`、`score`、`chunk_attachment` 完整链接等）。
