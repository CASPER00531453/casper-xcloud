import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { relaunch } from "@tauri-apps/plugin-process"
import { check as checkUpdate } from "@tauri-apps/plugin-updater"
import "./styles.css"

type Settings = {
  enabled: boolean
  locale: string
  autostart: boolean
  auto_play: boolean
  close_to_tray: boolean
  webgpu: boolean
  debug: boolean
}

type AppState = {
  settings: Settings
  playing: boolean
  script_version: string
}

const LOCALES: [string, string][] = [
  ["tr-TR", "Türkçe (tr-TR)"],
  ["en-US", "English US (en-US)"],
  ["en-GB", "English UK (en-GB)"],
  ["de-DE", "Deutsch (de-DE)"],
  ["fr-FR", "Français (fr-FR)"],
  ["es-ES", "Español (es-ES)"],
  ["it-IT", "Italiano (it-IT)"],
  ["nl-NL", "Nederlands (nl-NL)"],
  ["pl-PL", "Polski (pl-PL)"],
  ["pt-BR", "Português BR (pt-BR)"],
  ["ja-JP", "日本語 (ja-JP)"],
]

const root = document.querySelector<HTMLDivElement>("#app")!
let current: AppState
let showSettings = false
let message = ""

function render(s: AppState): void {
  current = s
  if (showSettings) renderSettings(s)
  else renderHome(s)
}

function renderHome(s: AppState): void {
  const on = s.settings.enabled
  const cls = on ? "on" : "off"
  root.innerHTML = `
    <div class="screen home">
      <button id="gear" class="gear" title="Ayarlar">⚙</button>
      <div class="logo">Casper xCloud</div>
      <button id="quick" class="primary quick">⚡ xCloud'u hızlı aç (bölge otomatik)</button>
      <p id="msg" class="muted center msg">${message}</p>
      <button id="power" class="power ${cls}" title="Casper xCloud aç/kapat">
        <span class="power-ico">⏻</span>
      </button>
      <p class="status ${cls}">Casper xCloud ${on ? "Açık" : "Kapalı"}</p>
      <p class="strategy">${on ? "Eklentili xCloud" : "Düz xCloud (eklentisiz)"}</p>
      <div class="spacer"></div>
      <button id="play" class="${s.playing ? "secondary" : "primary"}">
        ${s.playing ? "xCloud penceresini kapat" : "xCloud'u başlat"}
      </button>
      <button id="bx" class="secondary" ${on ? "" : "disabled"}>Casper xCloud ayarları</button>
      <p class="muted center">Casper xCloud v${APP_VERSION}${s.playing ? " · xCloud açık" : ""} · <button class="link inline" id="support">Destek: Casper Technology</button></p>
    </div>`

  root.querySelector<HTMLButtonElement>("#gear")!.addEventListener("click", () => {
    showSettings = true
    message = ""
    render(current)
  })
  root.querySelector<HTMLButtonElement>("#power")!.addEventListener("click", async () => {
    render(await invoke<AppState>("set_enabled", { on: !on }))
  })
  root.querySelector<HTMLButtonElement>("#play")!.addEventListener("click", async () => {
    try {
      render(await invoke<AppState>(s.playing ? "close_play" : "open_play"))
    } catch (e) {
      alert(String(e))
    }
  })
  root.querySelector<HTMLButtonElement>("#bx")!.addEventListener("click", async () => {
    try {
      await invoke("open_bx_settings")
    } catch (e) {
      alert(String(e))
    }
  })
  root.querySelector<HTMLButtonElement>("#quick")!.addEventListener("click", quickOpen)
  root.querySelector<HTMLButtonElement>("#support")!.addEventListener("click", openSupport)
}

function openSupport(): void {
  invoke("open_support").catch((e) => alert(String(e)))
}

/// Tek tık: Casper xCloud'u açar, bölge atlamayı (Polonya) ve hızlı açılış ayarlarını yazar, xCloud'u yeniler.
async function quickOpen(e: Event): Promise<void> {
  const btn = e.target as HTMLButtonElement
  btn.disabled = true
  btn.textContent = "Açılıyor…"
  try {
    const next = await invoke<AppState>("apply_recommended")
    message = "xCloud bölge ayarıyla açılıyor…"
    render(next)
  } catch (err) {
    message = String(err)
    render(current)
  }
}

function check(id: keyof Settings, label: string, hint = ""): string {
  const v = current.settings[id] as boolean
  return `<label class="check"><input type="checkbox" data-key="${id}" ${v ? "checked" : ""}/> <span>${label}${hint ? `<br><small class="muted">${hint}</small>` : ""}</span></label>`
}

function renderSettings(s: AppState): void {
  const st = s.settings
  root.innerHTML = `
    <div class="screen settings">
      <div class="bar"><button id="back" class="gear back" title="Geri">←</button><h2>Ayarlar</h2></div>

      <button id="quick" class="primary">⚡ xCloud'u hızlı aç (bölge otomatik)</button>
      <p class="muted">Tek tıkla: Casper xCloud açılır, ⚠️ bölge kısıtı atlanır (Polonya; Microsoft kurallarına aykırı, hesap riski sende), açılış videosu ve animasyonlar kısalır, xCloud yenilenir.</p>
      <p id="msg" class="muted center">${message}</p>

      <h3>Uygulama</h3>
      ${check("autostart", "Windows açılınca başlat")}
      ${check("close_to_tray", "Kapatınca tepsiye küçült")}
      ${check("auto_play", "Açılışta xCloud'u otomatik başlat")}
      <label class="field">xCloud dili / bölgesi
        <select id="locale">${LOCALES.map(([v, n]) => `<option value="${v}" ${v === st.locale ? "selected" : ""}>${n}</option>`).join("")}</select>
      </label>

      <h3>Casper xCloud</h3>
      <button id="bx" class="secondary" ${st.enabled ? "" : "disabled"}>Casper xCloud ayar penceresini aç</button>
      <p class="muted">Görüntü, ses, kontrolcü, fare-klavye, kısayollar, istatistikler gibi tüm ayarlar buradadır. Tam liste için xCloud'da oturum açmış olmalısın.</p>
      ${check("webgpu", "WebGPU görüntü işleyici", "Deneysel; bazı ekran kartlarında daha akıcı")}
      ${check("debug", "Hata ayıklama günlüğü (konsol)")}

      <h3>Güncelleme ve destek</h3>
      <button id="update" class="secondary">Güncellemeleri denetle</button>
      <button id="support2" class="secondary">Destek: Casper Technology web sitesi</button>
      <p class="muted center">Casper xCloud v${APP_VERSION} · Eklenti v${s.script_version}<br>© 2026 Casper Technology</p>
    </div>`

  root.querySelector<HTMLButtonElement>("#back")!.addEventListener("click", () => {
    showSettings = false
    render(current)
  })
  root.querySelectorAll<HTMLInputElement>("input[data-key]").forEach((el) =>
    el.addEventListener("change", () => save({ [el.dataset.key!]: el.checked } as Partial<Settings>)),
  )
  root.querySelector<HTMLSelectElement>("#locale")!.addEventListener("change", (e) =>
    save({ locale: (e.target as HTMLSelectElement).value }),
  )
  root.querySelector<HTMLButtonElement>("#bx")!.addEventListener("click", async () => {
    try {
      await invoke("open_bx_settings")
    } catch (e) {
      alert(String(e))
    }
  })
  root.querySelector<HTMLButtonElement>("#quick")!.addEventListener("click", quickOpen)
  root.querySelector<HTMLButtonElement>("#support2")!.addEventListener("click", openSupport)
  root.querySelector<HTMLButtonElement>("#update")!.addEventListener("click", async (e) => {
    const btn = e.target as HTMLButtonElement
    btn.disabled = true
    btn.textContent = "Denetleniyor…"
    const started = await runUpdate()
    if (!started) {
      message = lastUpdateError ? `Güncelleme denetlenemedi: ${lastUpdateError}` : `En son sürümü kullanıyorsun (v${APP_VERSION}).`
      render(current)
    }
  })
}

// ---------- otomatik güncelleme (GitHub Releases) ----------

const APP_VERSION = __APP_VERSION__
let lastUpdateError = ""

/// Yeni sürüm varsa indirir, kurar ve uygulamayı yeniden başlatır. true: güncelleme başladı.
async function runUpdate(): Promise<boolean> {
  lastUpdateError = ""
  try {
    const update = await checkUpdate()
    if (!update) return false
    root.innerHTML = `
      <div class="screen code">
        <div class="logo">Casper xCloud</div>
        <p class="sub">Yeni sürüm (v${update.version}) indiriliyor…<br>Lütfen bekle, uygulama otomatik yeniden başlayacak.</p>
        <p id="upd-progress" class="status connecting">%0</p>
      </div>`
    let total = 0
    let got = 0
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0
      else if (e.event === "Progress") {
        got += e.data.chunkLength
        const el = document.getElementById("upd-progress")
        if (el) el.textContent = `%${total ? Math.round((got / total) * 100) : 0}`
      }
    })
    await relaunch()
    return true
  } catch (e) {
    // İnternet yoksa veya GitHub'a ulaşılamazsa uygulamayı kilitleme
    lastUpdateError = String(e)
    return false
  }
}

async function save(patch: Partial<Settings>): Promise<void> {
  try {
    message = ""
    render(await invoke<AppState>("set_settings", { settings: { ...current.settings, ...patch } }))
  } catch (e) {
    message = String(e)
    render(current)
  }
}

async function init(): Promise<void> {
  // Açılışta yeni sürüm varsa önce güncelle (CasperGuard'daki gibi)
  if (await runUpdate()) return
  try {
    render(await invoke<AppState>("get_state"))
  } catch {
    root.innerHTML = `<div class="screen"><p class="err">Uygulama çekirdeği yüklenemedi.</p></div>`
    return
  }
  await listen<AppState>("state-changed", (e) => render(e.payload))
}

init()
