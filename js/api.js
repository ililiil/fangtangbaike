export async function searchKnowledge(query, imageQuery = null) {
  const body = {
    project: 'default',
    name: 'fangxiaotang',
    query,
    image_query: imageQuery || '',
    limit: 10,
    pre_processing: {
      need_instruction: true,
      return_token_usage: true,
      messages: [
        { role: 'system', content: '' },
        { role: 'user', content: '' }
      ],
      rewrite: true
    },
    post_processing: {
      get_attachment_link: true,
      rerank_only_chunk: false,
      rerank_switch: true,
      chunk_group: true,
      retrieve_count: 25,
      rerank_model: 'doubao-seed-rerank',
      enable_rerank_threshold: false,
      chunk_diffusion_count: 1
    },
    dense_weight: 0.5
  }

  const res = await fetch('/api/knowledge/collection/search_knowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`知识库检索失败 (${res.status})`)
  }

  return res.json()
}

export async function chatCompletion(messages, onChunk, onDone) {
  const body = {
    messages,
    stream: true,
    return_token_usage: true,
    model: 'Doubao-seed-1-8',
    max_tokens: 4096,
    temperature: 1,
    model_version: '251228',
    thinking: {
      type: 'enabled'
    }
  }

  const controller = new AbortController()
  let res
  try {
    res = await fetch('/api/knowledge/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (err) {
    if (err.name === 'AbortError') return
    throw new Error('对话请求发送失败，请检查网络连接后重试')
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`对话请求失败 (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let doneCalled = false

  const finish = () => {
    if (doneCalled) return
    doneCalled = true
    controller.abort()
    onDone && onDone()
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          finish()
          return
        }

        try {
          const parsed = JSON.parse(data)
          onChunk && onChunk(parsed)
        } catch (e) {
          // skip malformed chunks
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      finish()
      return
    }
    if (!doneCalled) {
      throw new Error('对话流读取失败，请重试')
    }
    return
  }

  finish()
}

export async function getPointList(pointIds) {
  const body = {
    collection_name: 'fangxiaotang',
    project: 'default',
    point_ids: pointIds,
    get_attachment_link: true
  }

  const res = await fetch('/api/knowledge/point/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`分片详情获取失败 (${res.status})`)
  }

  return res.json()
}
