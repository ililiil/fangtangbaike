export class StreamParser {
  constructor({ onContent, onThinking, onDone }) {
    this.onContent = onContent || (() => {})
    this.onThinking = onThinking || (() => {})
    this.onDone = onDone || (() => {})
  }

  processChunk(chunk) {
    if (chunk.code !== 0) return
    const data = chunk.data
    if (!data) return

    if (data.reasoning_content) {
      this.onThinking(data.reasoning_content)
    }
    if (data.generated_answer) {
      this.onContent(data.generated_answer)
    }
    if (data.end) {
      this.onDone()
    }
  }
}
