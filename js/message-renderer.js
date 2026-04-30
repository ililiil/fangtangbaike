import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { getPointList } from './api.js'

const messagesEl = document.getElementById('messages')
const chatArea = document.getElementById('chatArea')
const sourcesPanel = document.getElementById('sourcesPanel')
const sourcesPanelOverlay = document.getElementById('sourcesPanelOverlay')
const sourcesPanelList = document.getElementById('sourcesPanelList')
const sourcesPanelDetail = document.getElementById('sourcesPanelDetail')
const sourcesDetailBody = document.getElementById('sourcesDetailBody')

let cachedPoints = []

export function hideWelcome() {
  const el = document.getElementById('welcomeMessage')
  if (el) el.style.display = 'none'
}

export function renderUserMessage(text, imageUrl) {
  const msgEl = document.createElement('div')
  msgEl.className = 'message user'

  const avatar = document.createElement('div')
  avatar.className = 'message-avatar'
  avatar.textContent = '我'

  const bubble = document.createElement('div')
  bubble.className = 'message-bubble'

  if (imageUrl) {
    const img = document.createElement('img')
    img.src = imageUrl
    img.className = 'user-image'
    img.onclick = () => showImageOverlay(imageUrl)
    bubble.appendChild(img)
  }

  if (text) {
    const textNode = document.createElement('div')
    textNode.textContent = text
    bubble.appendChild(textNode)
  }

  msgEl.appendChild(avatar)
  msgEl.appendChild(bubble)
  messagesEl.appendChild(msgEl)
  scrollToBottom()
}

export function renderAssistantMessage() {
  const msgEl = document.createElement('div')
  msgEl.className = 'message assistant'

  const avatar = document.createElement('div')
  avatar.className = 'message-avatar'
  avatar.textContent = '🤖'

  const bubble = document.createElement('div')
  bubble.className = 'message-bubble'

  const loading = document.createElement('div')
  loading.className = 'loading-indicator'
  loading.innerHTML = '<span></span><span></span><span></span>'
  bubble.appendChild(loading)

  msgEl.appendChild(avatar)
  msgEl.appendChild(bubble)
  messagesEl.appendChild(msgEl)
  scrollToBottom()

  return {
    el: msgEl,
    bubble,
    thinkingEl: null,
    contentEl: null,
    cursorEl: null,
    fullContent: '',
    fullThinking: '',
    sources: [],

    startContent() {
      const loadingEl = bubble.querySelector('.loading-indicator')
      if (loadingEl) loadingEl.remove()

      this.contentEl = document.createElement('div')
      this.contentEl.className = 'content-text'

      this.cursorEl = document.createElement('span')
      this.cursorEl.className = 'typing-cursor'
      this.contentEl.appendChild(this.cursorEl)
      bubble.appendChild(this.contentEl)
    },

    appendThinking(text) {
      this.fullThinking += text
      if (!this.thinkingEl) {
        this.thinkingEl = document.createElement('div')
        this.thinkingEl.className = 'thinking-section open'
        this.thinkingEl.innerHTML = `<div class="thinking-header">思考过程</div><div class="thinking-body"></div>`
        this.thinkingEl.querySelector('.thinking-header').addEventListener('click', () => {
          this.thinkingEl.classList.toggle('open')
        })
        bubble.insertBefore(this.thinkingEl, bubble.firstChild)
      }
      this.thinkingEl.querySelector('.thinking-body').textContent = this.fullThinking
    },

    appendContent(text) {
      if (!this.contentEl) this.startContent()
      this.fullContent += text
      this.renderStreamContent()
      scrollToBottom()
    },

    renderStreamContent() {
      const html = formatStreamContent(this.fullContent)
      this.contentEl.innerHTML = html
      this.contentEl.appendChild(this.cursorEl)
    },

    finish() {
      if (this.cursorEl) this.cursorEl.remove()
      if (this.thinkingEl) {
        this.thinkingEl.classList.remove('open')
      }
      if (this.fullContent) {
        this.renderFinalContent()
      }
    },

    renderFinalContent() {
      const imageMap = buildImageMap(this.sources)
      const html = renderMarkdownWithRefs(this.fullContent, imageMap)
      this.contentEl.innerHTML = html
      this.contentEl.classList.add('content-markdown')

      this.contentEl.querySelectorAll('.illustration-img').forEach(img => {
        img.onclick = () => showImageOverlay(img.src)
      })
    },

    setSources(points) {
      this.sources = points
      if (!points || points.length === 0) return

      const summaryEl = document.createElement('div')
      summaryEl.className = 'sources-summary'
      summaryEl.innerHTML = `<span class="sources-summary-icon">📎</span> <span>${points.length} 个知识分片</span> <span class="sources-summary-arrow">›</span>`
      summaryEl.onclick = () => openSourcesPanel(points)
      bubble.appendChild(summaryEl)
    },

    showError(msg) {
      const loadingEl = bubble.querySelector('.loading-indicator')
      if (loadingEl) loadingEl.remove()
      bubble.innerHTML = `<div class="error-message">${msg}</div>`
    }
  }
}

function buildImageMap(sources) {
  const map = {}
  if (!sources) return map
  for (const point of sources) {
    if (point.chunk_attachment && point.chunk_attachment.length > 0) {
      for (const att of point.chunk_attachment) {
        if (att.link) {
          map[point.point_id] = att.link
          break
        }
      }
    }
  }
  return map
}

function formatStreamContent(text) {
  let html = escapeHtml(text)

  html = html.replace(/&lt;reference\s+data-ref=&quot;([^&]*)&quot;&gt;&lt;\/reference&gt;/g,
    () => `<span class="reference-tag">📋</span>`)

  html = html.replace(/&lt;illustration\s+data-ref=&quot;([^&]*)&quot;&gt;&lt;\/illustration&gt;/g,
    () => `<span class="reference-tag">🖼️</span>`)

  html = html.replace(/\n/g, '<br>')
  return html
}

function renderMarkdownWithRefs(text, imageMap) {
  let processed = text

  processed = processed.replace(/<illustration\s+data-ref="([^"]*)"><\/illustration>/g,
    (match, refId) => {
      const imgUrl = imageMap[refId]
      if (imgUrl) {
        return `\n\n![参考图片](${imgUrl})\n\n`
      }
      return ''
    })

  processed = processed.replace(/<reference\s+data-ref="([^"]*)"><\/reference>/g,
    () => ` 📋 `)

  processed = processed.replace(/<\/?thinking>/g, '')
  processed = processed.replace(/<\/?think>/g, '')

  const rawHtml = marked.parse(processed, {
    breaks: true,
    gfm: true,
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value
        } catch (e) {}
      }
      return hljs.highlightAuto(code).value
    }
  })

  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['img'],
    ADD_ATTR: ['data-ref', 'onclick']
  })

  return cleanHtml
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight
  })
}

export function showImageOverlay(src) {
  const overlay = document.getElementById('imageOverlay')
  const img = document.getElementById('overlayImage')
  img.src = src
  overlay.classList.add('active')
}

export function openSourcesPanel(points) {
  cachedPoints = points

  sourcesPanelList.innerHTML = ''
  points.forEach((point, index) => {
    const item = document.createElement('div')
    item.className = 'sources-list-item'

    const hasAttachment = point.chunk_attachment && point.chunk_attachment.length > 0
    const icon = hasAttachment ? '🖼️' : '📄'
    const docName = point.doc_info?.doc_name || '未知文档'
    const subTitle = point.chunk_title || (point.content ? point.content.substring(0, 50) + '...' : '')

    item.innerHTML = `
      <div class="sources-list-icon">${icon}</div>
      <div class="sources-list-text">
        <div class="sources-list-name">${escapeHtml(docName)}</div>
        <div class="sources-list-sub">${escapeHtml(subTitle)}</div>
      </div>
    `

    item.onclick = () => showPointDetail(point.point_id)
    sourcesPanelList.appendChild(item)
  })

  sourcesPanelDetail.style.display = 'none'
  sourcesPanelList.style.display = ''

  sourcesPanel.classList.add('active')
}

async function showPointDetail(pointId) {
  sourcesPanelList.style.display = 'none'
  sourcesPanelDetail.style.display = ''
  sourcesDetailBody.innerHTML = '<div class="sources-detail-loading">加载中...</div>'

  try {
    const result = await getPointList([pointId])

    if (result.code !== 0 || !result.data?.point_list?.length) {
      sourcesDetailBody.innerHTML = '<div class="error-message">获取分片详情失败</div>'
      return
    }

    const point = result.data.point_list[0]
    renderPointDetail(point)
  } catch (err) {
    sourcesDetailBody.innerHTML = `<div class="error-message">请求失败: ${err.message}</div>`
  }
}

function renderPointDetail(point) {
  const docInfo = point.doc_info || {}
  const fields = []

  if (docInfo.doc_name) fields.push({ label: '文档名称', value: docInfo.doc_name })
  if (docInfo.doc_type) fields.push({ label: '文档类型', value: docInfo.doc_type })
  if (docInfo.title) fields.push({ label: '文档标题', value: docInfo.title })
  if (point.chunk_title) fields.push({ label: '切片标题', value: point.chunk_title })
  if (point.point_id) fields.push({ label: '切片ID', value: point.point_id })
  if (point.score != null) fields.push({ label: '检索得分', value: point.score.toFixed?.(4) || point.score })
  if (point.rerank_score != null) fields.push({ label: '重排得分', value: point.rerank_score.toFixed?.(4) || point.rerank_score })
  if (docInfo.original_coordinate) fields.push({ label: '原始位置', value: JSON.stringify(docInfo.original_coordinate) })
  if (docInfo.source) fields.push({ label: '知识来源', value: docInfo.source })

  let fieldsHtml = fields.map(f =>
    `<div class="detail-field"><span class="detail-label">${f.label}</span><span class="detail-value">${escapeHtml(String(f.value))}</span></div>`
  ).join('')

  let contentHtml = ''
  if (point.html_content) {
    contentHtml = `<div class="detail-content-label">内容（HTML）</div><div class="detail-content-html">${point.html_content}</div>`
  } else if (point.md_content) {
    contentHtml = `<div class="detail-content-label">内容（Markdown）</div><div class="detail-content-pre">${escapeHtml(point.md_content)}</div>`
  } else if (point.content) {
    contentHtml = `<div class="detail-content-label">内容</div><div class="detail-content-pre">${escapeHtml(point.content)}</div>`
  }

  let attachmentHtml = ''
  if (point.chunk_attachment && point.chunk_attachment.length > 0) {
    const imgs = point.chunk_attachment.map(att => {
      const link = att.link || ''
      const caption = att.caption || ''
      if (link) {
        return `<img class="detail-attachment-img" src="${link}" alt="${escapeHtml(caption)}" onclick="document.getElementById('overlayImage').src='${link}';document.getElementById('imageOverlay').classList.add('active')">`
      }
      return ''
    }).join('')
    attachmentHtml = `<div class="detail-attachment-section">${imgs}</div>`
  }

  sourcesDetailBody.innerHTML = fieldsHtml + contentHtml + attachmentHtml
}

export function closeSourcesPanel() {
  sourcesPanel.classList.remove('active')
}

export function backToList() {
  sourcesPanelDetail.style.display = 'none'
  sourcesPanelList.style.display = ''
}
