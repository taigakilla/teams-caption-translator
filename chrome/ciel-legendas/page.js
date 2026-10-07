let pair = null
let armed = false

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(`ciel-legendas:${name}`, { detail }))
}

function arm() {
  if (armed) return
  armed = true
  window.addEventListener("pointerdown", download, true)
  window.addEventListener("keydown", download, true)
}

function disarm() {
  armed = false
  window.removeEventListener("pointerdown", download, true)
  window.removeEventListener("keydown", download, true)
}

function download() {
  disarm()
  const wanted = pair
  Translator.create({
    ...wanted,
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => emit("progress", String(e.loaded)))
    },
  }).then(
    (t) => {
      t.destroy?.()
      emit("ready", JSON.stringify(wanted))
    },
    (e) => {
      if (e?.name === "NotAllowedError") arm()
      else emit("failed", String(e?.message || e))
    },
  )
}

window.addEventListener("ciel-legendas:download", (e) => {
  try {
    pair = JSON.parse(e.detail)
  } catch {
    return
  }
  if ("Translator" in window) arm()
  else emit("failed", "Translator API ausente")
})
