const TARGET = "pt"
const $ = (id) => document.getElementById(id)

function show(id, text, ok) {
  $(id).textContent = text
  $(id).className = ok === undefined ? "" : ok ? "ok" : "bad"
}

async function checkTranslator() {
  const source = $("source").value
  if (source === TARGET) return show("translator", "não precisa", true)
  if (!("Translator" in self)) return show("translator", "indisponível neste Chrome", false)
  const availability = await Translator.availability({ sourceLanguage: source, targetLanguage: TARGET }).catch(() => "unavailable")
  if (availability === "available") return show("translator", "pronto", true)
  if (availability === "unavailable") return show("translator", "par sem suporte", false)
  show("translator", availability === "downloading" ? "baixando…" : "baixa no primeiro clique na janela do Teams")
}

function checkHost() {
  chrome.runtime.sendNativeMessage("ciel.legendas", { type: "ping" }, (reply) => {
    if (chrome.runtime.lastError || !reply) return show("host", "não instalado — rode ciel-legendas-install", false)
    show("host", "conectado", true)
  })
}

$("source").addEventListener("change", async () => {
  await chrome.storage.local.set({ source: $("source").value })
  checkTranslator()
})

chrome.storage.local.get({ source: "en" }).then((v) => {
  $("source").value = v.source
  checkTranslator()
})
checkHost()
