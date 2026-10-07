const SEL = {
  wrappers: ["[data-tid='closed-caption-v2-window-wrapper']", "[data-tid='closed-captions-renderer']"],
  loose: "[data-tid*='closed-caption']",
  item: ".fui-ChatMessageCompact",
  author: "[data-tid='author']",
  text: "[data-tid='closed-caption-text']",
}
const TARGET = "pt"
const LOOK_MS = 2000
const GONE_MS = 6000
const SCAN_MS = 150
const SEND_MS = 250
const TRANSLATE_MS = 700
const SETTLE_MS = 2000
const KEEP = 30

let source = "en"
let port = null
let session = null
let container = null
let observer = null
let goneSince = 0
let scanQueued = false
let seq = 0
const ids = new WeakMap()
const lines = new Map()
let last = null
const dirty = new Set()
let sendTimer = 0

let translator = null
let translatorFor = ""
let creating = null
let translatorState = "off"

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function meetingTitle() {
  return document.title.replace(/^(\S+ · )?\(\d+\)\s*/, "$1").replace(/\s*\|\s*Microsoft Teams.*$/i, "").trim()
}

function startMsg() {
  return { type: "start", session: session.id, meeting: session.meeting, started: session.started, source, target: TARGET, translator: translatorState }
}

function lineMsg(line) {
  return { type: "line", id: line.id, speaker: line.speaker, text: line.text, translation: line.translation, final: line.final, t: line.t }
}

function connect() {
  try {
    port = chrome.runtime.connect({ name: "legendas" })
  } catch {
    port = null
    return
  }
  port.onDisconnect.addListener(() => { port = null })
  port.postMessage(startMsg())
  for (const line of lines.values()) port.postMessage(lineMsg(line))
}

function post(msg) {
  if (!session) return
  if (!port) return connect()
  try {
    port.postMessage(msg)
  } catch {
    port = null
  }
}

function queueSend(line) {
  dirty.add(line)
  if (!sendTimer) sendTimer = setTimeout(flush, SEND_MS)
}

function flush() {
  clearTimeout(sendTimer)
  sendTimer = 0
  for (const line of dirty) post(lineMsg(line))
  dirty.clear()
}

function setTranslatorState(state) {
  if (translatorState === state) return
  translatorState = state
  post({ type: "status", translator: state })
}

function pair() {
  return { sourceLanguage: source, targetLanguage: TARGET }
}

async function prepareTranslator() {
  const key = `${source}>${TARGET}`
  if (translatorFor === key && (translator || creating)) return
  translator?.destroy?.()
  translator = null
  creating = null
  translatorFor = key
  if (source === TARGET) return setTranslatorState("off")
  if (!("Translator" in self)) return setTranslatorState("unavailable")
  let availability
  try {
    availability = await Translator.availability(pair())
  } catch {
    availability = "unavailable"
  }
  if (translatorFor !== key) return
  if (availability === "unavailable") return setTranslatorState("unavailable")
  if (availability === "available") return createTranslator(key)
  requestDownload()
}

function requestDownload() {
  setTranslatorState("needs-click")
  window.dispatchEvent(new CustomEvent("ciel-legendas:download", { detail: JSON.stringify(pair()) }))
}

function createTranslator(key) {
  creating = Translator.create({
    ...pair(),
    monitor(m) {
      m.addEventListener("downloadprogress", () => {
        if (translatorFor === key && !translator) setTranslatorState("downloading")
      })
    },
  })
  creating.then(
    (t) => {
      if (translatorFor !== key) return t.destroy?.()
      translator = t
      creating = null
      setTranslatorState("ready")
      for (const line of lines.values()) if (!line.translation) queueTranslate(line, true)
    },
    () => {
      if (translatorFor !== key) return
      creating = null
      setTranslatorState("unavailable")
    },
  )
}

function queueTranslate(line, now) {
  if (!translator) return
  if (now || !line.translation) {
    clearTimeout(line.trTimer)
    line.trTimer = 0
    translateLine(line)
    return
  }
  if (line.trTimer) return
  line.trTimer = setTimeout(() => {
    line.trTimer = 0
    translateLine(line)
  }, TRANSLATE_MS)
}

async function translateLine(line) {
  if (line.busy) {
    line.again = true
    return
  }
  line.busy = true
  try {
    do {
      line.again = false
      const t = translator
      if (!t) break
      const out = await t.translate(line.text)
      if (t === translator) {
        line.translation = out
        queueSend(line)
      }
    } while (line.again)
  } catch {
  } finally {
    line.busy = false
  }
}

function settle(line) {
  clearTimeout(line.settleTimer)
  if (line.final) return
  line.final = true
  queueTranslate(line, true)
  queueSend(line)
}

function prune() {
  while (lines.size > KEEP) {
    const [id, line] = lines.entries().next().value
    clearTimeout(line.settleTimer)
    clearTimeout(line.trTimer)
    dirty.delete(line)
    lines.delete(id)
  }
}

function lineFor(el, speaker, text) {
  let id = ids.get(el)
  if (id) return lines.get(id)
  for (const line of [...lines.values()].slice(-10)) {
    if (line.speaker === speaker && line.text === text) {
      ids.set(el, line.id)
      return line
    }
  }
  if (!session) start()
  if (last) settle(last)
  id = `c${++seq}`
  ids.set(el, id)
  const line = { id, speaker, text: "", translation: "", final: false, t: Date.now() }
  lines.set(id, line)
  last = line
  prune()
  return line
}

function scan() {
  if (!container?.isConnected) return
  for (const el of container.querySelectorAll(SEL.item)) {
    const text = el.querySelector(SEL.text)?.innerText.trim()
    if (!text) continue
    const speaker = el.querySelector(SEL.author)?.innerText.trim() || ""
    const line = lineFor(el, speaker, text)
    if (!line || line.text === text) continue
    line.text = text
    line.final = false
    clearTimeout(line.settleTimer)
    line.settleTimer = setTimeout(() => settle(line), SETTLE_MS)
    queueTranslate(line)
    queueSend(line)
  }
}

function queueScan() {
  if (scanQueued) return
  scanQueued = true
  setTimeout(() => {
    scanQueued = false
    scan()
  }, SCAN_MS)
}

function findContainer() {
  for (const s of SEL.wrappers) {
    const el = document.querySelector(s)
    if (el) return el
  }
  for (const el of document.querySelectorAll(SEL.loose)) {
    if (el.querySelector(SEL.item)) return el
  }
  return null
}

function attach(el) {
  observer?.disconnect()
  container = el
  observer = new MutationObserver(queueScan)
  observer.observe(el, { childList: true, subtree: true, characterData: true })
  queueScan()
}

function start() {
  const now = new Date()
  session = { id: stamp(now), meeting: meetingTitle(), started: now.getTime() }
  prepareTranslator()
  connect()
}

function stop() {
  if (!session) return
  for (const line of lines.values()) settle(line)
  flush()
  post({ type: "stop" })
  port?.disconnect()
  port = null
  session = null
  lines.clear()
  last = null
}

function look() {
  const el = findContainer()
  if (el) {
    goneSince = 0
    if (el !== container) attach(el)
    return
  }
  if (container) {
    observer?.disconnect()
    observer = null
    container = null
  }
  if (!session) return
  if (!goneSince) goneSince = Date.now()
  else if (Date.now() - goneSince > GONE_MS) stop()
}

window.addEventListener("ciel-legendas:progress", () => {
  if (!translator) setTranslatorState("downloading")
})

window.addEventListener("ciel-legendas:ready", () => {
  if (!translator) prepareTranslator()
})

window.addEventListener("ciel-legendas:failed", () => {
  if (!translator) setTranslatorState("unavailable")
})

chrome.storage.local.get({ source: "en" }).then((v) => {
  source = v.source
  prepareTranslator()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.source) return
  source = changes.source.newValue
  prepareTranslator()
  for (const line of lines.values()) line.translation = ""
  if (session) post(startMsg())
})

setInterval(look, LOOK_MS)
look()
