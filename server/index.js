import express from 'express'
import cors from 'cors'
import { buildSignedRequest } from './signer.js'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use(express.static('dist'))
app.use(express.static('.'))

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/api/knowledge/collection/search_knowledge', async (req, res) => {
  try {
    console.log('[search_knowledge] request received, query:', req.body?.query)
    const { url, headers, body } = buildSignedRequest(
      'POST',
      '/api/knowledge/collection/search_knowledge',
      req.body
    )
    const response = await fetch(url, { method: 'POST', headers, body })
    console.log('[search_knowledge] upstream status:', response.status)
    const data = await response.text()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(response.status).send(data)
  } catch (err) {
    console.error('search_knowledge error:', err)
    res.status(500).json({ code: -1, message: err.message })
  }
})

app.post('/api/knowledge/chat/completions', async (req, res) => {
  try {
    console.log('[chat_completion] request received, messages count:', req.body?.messages?.length)
    const { url, headers, body } = buildSignedRequest(
      'POST',
      '/api/knowledge/chat/completions',
      req.body
    )
    const response = await fetch(url, { method: 'POST', headers, body })
    console.log('[chat_completion] upstream status:', response.status, 'Content-Type:', response.headers.get('content-type'))

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[chat_completion] upstream error:', errorText.substring(0, 500))
      res.status(response.status).setHeader('Content-Type', 'application/json; charset=utf-8').send(errorText)
      return
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        res.write(chunk)
      }
      res.end()
    }
    req.on('close', () => {
      console.log('[chat_completion] client disconnected')
      reader.cancel().catch(() => {})
    })
    pump().catch(err => {
      console.error('stream pump error:', err)
      res.end()
    })
  } catch (err) {
    console.error('chat_completion error:', err)
    res.status(500).json({ code: -1, message: err.message })
  }
})

app.post('/api/knowledge/point/list', async (req, res) => {
  try {
    console.log('[point_list] request received, point_ids count:', req.body?.point_ids?.length)
    const { url, headers, body } = buildSignedRequest(
      'POST',
      '/api/knowledge/point/list',
      req.body
    )
    const response = await fetch(url, { method: 'POST', headers, body })
    console.log('[point_list] upstream status:', response.status)
    const data = await response.text()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.status(response.status).send(data)
  } catch (err) {
    console.error('point_list error:', err)
    res.status(500).json({ code: -1, message: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Signer proxy server running on http://localhost:${PORT}`)
})
