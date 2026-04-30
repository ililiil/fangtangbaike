import { ChatManager } from './chat.js'
import { hideWelcome, renderUserMessage, renderAssistantMessage, closeSourcesPanel, backToList } from './message-renderer.js'

const chatManager = new ChatManager()
let isStreaming = false
let currentAssistant = null
let uploadedImageUrl = null

const userInput = document.getElementById('userInput')
const btnSend = document.getElementById('btnSend')
const btnUpload = document.getElementById('btnUpload')
const fileInput = document.getElementById('fileInput')
const imagePreviewBar = document.getElementById('imagePreviewBar')
const imagePreviewImg = document.getElementById('imagePreviewImg')
const imagePreviewRemove = document.getElementById('imagePreviewRemove')
const imageOverlay = document.getElementById('imageOverlay')
const sourcesPanelOverlay = document.getElementById('sourcesPanelOverlay')
const sourcesPanelClose = document.getElementById('sourcesPanelClose')
const sourcesDetailBack = document.getElementById('sourcesDetailBack')

function updateSendButton() {
  const hasContent = userInput.value.trim() || uploadedImageUrl
  btnSend.disabled = !hasContent || isStreaming
  btnSend.classList.toggle('active', hasContent && !isStreaming)
}

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto'
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px'
  updateSendButton()
})

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
})

btnSend.addEventListener('click', handleSend)

btnUpload.addEventListener('click', () => fileInput.click())

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (ev) => {
    uploadedImageUrl = ev.target.result
    imagePreviewImg.src = uploadedImageUrl
    imagePreviewBar.style.display = 'block'
    updateSendButton()
  }
  reader.readAsDataURL(file)
  fileInput.value = ''
})

imagePreviewRemove.addEventListener('click', () => {
  uploadedImageUrl = null
  imagePreviewBar.style.display = 'none'
  imagePreviewImg.src = ''
  updateSendButton()
})

imageOverlay.addEventListener('click', () => {
  imageOverlay.classList.remove('active')
})

sourcesPanelOverlay.addEventListener('click', closeSourcesPanel)
sourcesPanelClose.addEventListener('click', closeSourcesPanel)
sourcesDetailBack.addEventListener('click', backToList)

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSourcesPanel()
  }
})

async function handleSend() {
  const query = userInput.value.trim()
  const imageUrl = uploadedImageUrl

  if ((!query && !imageUrl) || isStreaming) return

  isStreaming = true
  updateSendButton()

  hideWelcome()
  renderUserMessage(query, imageUrl)

  userInput.value = ''
  userInput.style.height = 'auto'
  uploadedImageUrl = null
  imagePreviewBar.style.display = 'none'
  imagePreviewImg.src = ''

  currentAssistant = renderAssistantMessage()

  await chatManager.sendMessage(query, imageUrl, {
    onThinking: (text) => {
      if (currentAssistant) currentAssistant.appendThinking(text)
    },
    onContent: (text) => {
      if (currentAssistant) currentAssistant.appendContent(text)
    },
    onSources: (sources) => {
      if (currentAssistant) currentAssistant.setSources(sources)
    },
    onError: (msg) => {
      if (currentAssistant) currentAssistant.showError(msg)
      isStreaming = false
      updateSendButton()
    },
    onDone: () => {
      if (currentAssistant) currentAssistant.finish()
      isStreaming = false
      currentAssistant = null
      updateSendButton()
    }
  })
}
