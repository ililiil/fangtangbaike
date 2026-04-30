import { searchKnowledge, chatCompletion } from './api.js'
import { StreamParser } from './stream-parser.js'

const BASE_PROMPT = `
# 任务
你是一位在线客服，你的首要任务是通过巧妙的话术回复用户的问题，你需要根据「参考资料」来回答接下来的「用户问题」，这些信息在 <context></context> XML tags 之内，你需要根据参考资料给出准确，简洁的回答。

你的回答要满足以下要求：
    1. 回答内容必须在参考资料范围内，尽可能简洁地回答问题，不能做任何参考资料以外的扩展解释。
    2. 回答中需要根据客户问题和参考资料保持与客户的友好沟通。
    3. 如果参考资料不能帮助你回答用户问题，告知客户无法回答该问题，并引导客户提供更加详细的信息。
    4. 如果用户输入了图片内容，也可以结合用户的图片内容来回答用户问题，即使与参考资料无关。
    5. 为了保密需要，委婉地拒绝回答有关参考资料的文档名称或文档作者等问题。

# 任务执行
现在请你根据提供的参考资料，遵循限制来回答用户的问题，你的回答需要准确和完整。

# 参考资料

注意：「参考资料」可以为文本、图片等多种内容
- 文本资料是一段文本
- 图片资料则是图片内容，可能会包括关于图片的描述性文本
<context>
  {}
</context>
参考资料中提到的图片按上传顺序排列，请结合图片与文本信息综合回答问题。如参考资料中没有图片，请仅根据参考资料中的文本信息回答问题。

# 引用要求
1. 当可以回答时，在句子末尾适当引用相关参考资料，每个参考资料引用格式必须使用<reference>标签对，例如: <reference data-ref="{{point_id}}"></reference>
2. 当告知客户无法回答时，不允许引用任何参考资料
3. 'data-ref' 字段表示对应参考资料的 point_id
4. 'point_id' 取值必须来源于参考资料对应的'point_id' 后的id号
5. 适当合并引用，当引用项相同可以合并引用，只在引用内容结束添加一个引用标签。

# 配图要求
1. 首先对参考资料的每个图片内容含义深入理解，然后从所有图片中筛选出与回答上下文直接关联的图片，在回答中的合适位置插入作为配图，图像内容必须支持直接的可视化说明问题的答案。若参考资料中无适配图片，或图片仅是间接性关联，则省略配图。
2. 使用 <illustration> 标签对表示插图，例如: <illustration data-ref="{{point_id}}"></illustration>，其中 'point_id' 字段表示对应图片的 point_id，每个配图标签对必须另起一行，相同的图片（以'point_id'区分）只允许使用一次。
3. 'point_id' 取值必须来源于参考资料，形如"_sys_auto_gen_doc_id-1005563729285435073--1"，请注意务必不要虚构，'point_id'值必须与参考资料完全一致

下面是「用户问题」，可以为文本和图片内容，你需要根据上面的「参考资料」来回答接下来的「用户问题」
`

const MODEL_NAME = 'Doubao-seed-1-8'
const MODEL_VERSION = '251228'

function isVisionModel(modelName, modelVersion) {
  const MIX_MODEL = ['Doubao-1-5-thinking-pro']
  if (!modelName) return false
  const lower = modelName.toLowerCase()
  return (
    lower.includes('vision') ||
    lower.includes('seed') ||
    (MIX_MODEL.includes(modelName) && modelVersion && modelVersion.startsWith('m'))
  )
}

function getContentForPrompt(point) {
  const content = point.content
  const originalQuestion = point.original_question
  if (originalQuestion) {
    return `当询问到相似问题时，请参考对应答案进行回答：问题："${originalQuestion}"。答案："${content}"`
  }
  return content
}

function generatePrompt(searchResult) {
  if (!searchResult || searchResult.code !== 0) {
    return ''
  }

  const points = searchResult.data?.result_list || []
  const usingVlm = isVisionModel(MODEL_NAME, MODEL_VERSION)
  const content = []

  for (const point of points) {
    let docTextPart = ''
    const docInfo = point.doc_info || {}

    for (const field of ['point_id', 'doc_name', 'title', 'chunk_title', 'content']) {
      if (field === 'doc_name' || field === 'title') {
        if (field in docInfo) {
          docTextPart += `${field}: ${docInfo[field]}\n`
        }
      } else {
        if (field in point) {
          if (field === 'content') {
            docTextPart += `content: ${getContentForPrompt(point)}\n`
          } else if (field === 'point_id') {
            docTextPart += `point_id: "${point.point_id}"`
          } else {
            docTextPart += `${field}: ${point[field]}\n`
          }
        }
      }
    }

    let imageLink = null
    if (usingVlm && point.chunk_attachment) {
      imageLink = point.chunk_attachment[0]?.link || null
    }

    content.push({ type: 'text', text: docTextPart })

    if (imageLink) {
      content.push({
        type: 'image_url',
        image_url: { url: imageLink }
      })
    }
  }

  if (usingVlm) {
    const [pre, sub] = BASE_PROMPT.split('{}')
    return [
      { type: 'text', text: pre },
      ...content,
      { type: 'text', text: sub }
    ]
  }

  const textContent = content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n')

  return BASE_PROMPT.replace('{}', textContent)
}

export class ChatManager {
  constructor() {
    this.messages = []
  }

  async sendMessage(query, imageQuery, callbacks) {
    const { onThinking, onContent, onSources, onError, onDone } = callbacks

    try {
      const searchResult = await searchKnowledge(query, imageQuery)
      const prompt = generatePrompt(searchResult)

      if (!prompt) {
        onError && onError('知识库检索失败，请稍后重试')
        return
      }

      const points = searchResult.data?.result_list || []
      onSources && onSources(points)

      const usingVlm = isVisionModel(MODEL_NAME, MODEL_VERSION)
      let userContent
      if (imageQuery) {
        const parts = [{ type: 'image_url', image_url: { url: imageQuery } }]
        if (query) parts.push({ type: 'text', text: query })
        userContent = parts
      } else {
        userContent = query
      }

      const apiMessages = [
        { role: 'system', content: prompt },
        ...this.messages,
        { role: 'user', content: userContent }
      ]

      const parser = new StreamParser({
        onThinking: (text) => onThinking && onThinking(text),
        onContent: (text) => onContent && onContent(text),
        onDone: () => {}
      })

      let fullContent = ''
      let fullThinking = ''

      await chatCompletion(
        apiMessages,
        (chunk) => {
          parser.processChunk(chunk)
          if (chunk.code === 0 && chunk.data) {
            if (chunk.data.reasoning_content) {
              fullThinking += chunk.data.reasoning_content
            }
            if (chunk.data.generated_answer) {
              fullContent += chunk.data.generated_answer
            }
          }
        },
        () => {
          this.messages.push({ role: 'user', content: userContent })
          this.messages.push({ role: 'assistant', content: fullContent })
          onDone && onDone(fullContent)
        }
      )
    } catch (err) {
      console.error('sendMessage error:', err)
      onError && onError(err.message || '请求失败，请稍后重试')
    }
  }

  clearHistory() {
    this.messages = []
  }
}
