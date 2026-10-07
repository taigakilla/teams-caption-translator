const HOST = "ciel.legendas"
const RETRY_MS = 10000

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "legendas") return
  let start = null
  let native = null
  let openedAt = 0
  let retryAt = 0

  const open = () => {
    openedAt = Date.now()
    native = chrome.runtime.connectNative(HOST)
    native.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message
      native = null
      if (Date.now() - openedAt < 2000) retryAt = Date.now() + RETRY_MS
      if (error) console.warn(`ciel.legendas: ${error}`)
    })
    if (start) native.postMessage(start)
  }

  port.onMessage.addListener((msg) => {
    if (msg.type === "start") start = msg
    if (!native) {
      if (Date.now() < retryAt) return
      open()
      if (msg.type === "start") return
    }
    try {
      native?.postMessage(msg)
    } catch {
      native = null
    }
  })

  port.onDisconnect.addListener(() => {
    native?.disconnect()
    native = null
  })
})
