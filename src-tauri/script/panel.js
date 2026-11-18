// Casper xCloud — xCloud penceresi içindeki ayar paneli.
// Sağ altta ⚙ butonu (oyun sırasında gizlenir) ve Ctrl+Shift+X kısayolu.
// Uygulamayla yalnızca izin verilen komutlar üzerinden konuşur (capabilities/xcloud-panel.json).
(function () {
  if (window.top !== window) return
  if (location.hostname !== 'www.xbox.com' && location.hostname !== 'play.xbox.com') return
  if (location.pathname.startsWith('/migration')) return
  if (window.__casperPanel) return
  window.__casperPanel = true

  const LOCALES = [
    ['tr-TR', 'Türkçe (tr-TR)'], ['en-US', 'English US (en-US)'], ['en-GB', 'English UK (en-GB)'],
    ['de-DE', 'Deutsch (de-DE)'], ['fr-FR', 'Français (fr-FR)'], ['es-ES', 'Español (es-ES)'],
    ['it-IT', 'Italiano (it-IT)'], ['nl-NL', 'Nederlands (nl-NL)'], ['pl-PL', 'Polski (pl-PL)'],
    ['pt-BR', 'Português BR (pt-BR)'], ['ja-JP', '日本語 (ja-JP)'],
  ]

  const invoke = (cmd, args) => {
    const t = window.__TAURI_INTERNALS__
    if (!t) return Promise.reject(new Error('Uygulama bağlantısı yok'))
    return t.invoke(cmd, args || {})
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
    .fab { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; width: 44px; height: 44px; border-radius: 50%;
      border: 2px solid #30363d; background: #161b22e6; color: #e6edf3; font-size: 20px; cursor: pointer;
      box-shadow: 0 4px 16px #0008; transition: transform .15s, border-color .15s; }
    .fab:hover { transform: scale(1.08); border-color: #107c10; }
    .fab.hidden { display: none; }
    .wrap { position: fixed; inset: 0; z-index: 2147483647; background: #0009; display: flex; justify-content: flex-end; }
    .wrap.hidden { display: none; }
    .panel { width: 360px; max-width: 100vw; height: 100%; overflow-y: auto; background: #0d1117; color: #e6edf3;
      border-left: 1px solid #30363d; padding: 18px; display: flex; flex-direction: column; gap: 12px; font-size: 14px; line-height: 1.45; }
    .bar { display: flex; align-items: center; justify-content: space-between; }
    .bar h2 { margin: 0; font-size: 18px; }
    .x { background: none; border: 0; color: #8b949e; font-size: 22px; cursor: pointer; }
    .x:hover { color: #e6edf3; }
    h3 { margin: 6px 0 0; font-size: 12px; letter-spacing: .6px; text-transform: uppercase; color: #8b949e; }
    .power { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 10px; background: #161b22; border: 1px solid #30363d; cursor: pointer; color: inherit; font-size: 15px; font-weight: 600; text-align: left; }
    .power .dot { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #30363d; display: grid; place-items: center; color: #8b949e; }
    .power.on .dot { border-color: #107c10; color: #107c10; box-shadow: 0 0 18px -4px #107c10; }
    label.check { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
    label.check input { margin-top: 3px; }
    small, .muted { color: #8b949e; font-size: 12px; }
    select { width: 100%; background: #161b22; color: #e6edf3; border: 1px solid #30363d; border-radius: 8px; padding: 8px; font-size: 14px; }
    .btn { width: 100%; padding: 10px; border: 0; border-radius: 10px; font-weight: 600; cursor: pointer; color: #fff; background: #30363d; font-size: 14px; }
    .btn.primary { background: #107c10; }
    .btn:disabled { opacity: .55; cursor: default; }
    .msg { min-height: 18px; text-align: center; }
    .quick { padding: 13px; font-size: 15px; }
    .quick-list { color: #8b949e; font-size: 12px; margin-top: -4px; }
    .quick-list summary { cursor: pointer; }
    .quick-list ul { margin: 6px 0; padding-left: 18px; }
    .note { background: #3a2f0b; color: #f0b429; padding: 8px 10px; border-radius: 8px; font-size: 12px; }
  `

  let state = null
  let msg = ''
  let host, root, fab, wrap

  function mount() {
    host = document.createElement('div')
    host.id = 'casper-xcloud-panel'
    root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = `<style>${CSS}</style><button class="fab" title="Casper xCloud ayarları (Ctrl+Shift+X)">⚙</button><div class="wrap hidden"><div class="panel"></div></div>`
    fab = root.querySelector('.fab')
    wrap = root.querySelector('.wrap')
    fab.addEventListener('click', open)
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close() })
    // Tuş olayları xCloud'a (oyuna) sızmasın
    wrap.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close() })
    document.documentElement.appendChild(host)

    // Oyun akışı sırasında butonu gizle (kısayol çalışmaya devam eder)
    setInterval(() => {
      const streaming = !!document.querySelector('#game-stream video, #game-stream canvas') || !!document.fullscreenElement
      fab.classList.toggle('hidden', streaming)
      if (!host.isConnected) document.documentElement.appendChild(host)
    }, 1000)
  }

  async function open() {
    msg = ''
    wrap.classList.remove('hidden')
    try {
      state = await invoke('get_state')
    } catch (e) {
      state = null
      msg = String(e && e.message || e)
    }
    render()
  }

  function close() {
    wrap.classList.add('hidden')
  }

  // "xCloud'u hızlı aç": xCloud'un desteklenmeyen bölgede (ör. Türkiye) açılması için en kısa yol.
  // Grafik ayarı yok; yalnızca erişim ve açılış hızı. [depolama anahtarı, ayar, değer, açıklama]
  const RECOMMENDED = [
    // Kullanıcı isteğiyle: xCloud girişine Polonya IP'si ekler (Better xCloud'un kendi özelliği).
    // Microsoft kullanım koşullarına aykırıdır; hesap riski kullanıcıya aittir.
    ['BetterXcloud', 'server.bypassRestriction', 'pl', '⚠️ Bölge kısıtını atla: Polonya (Microsoft kurallarına aykırı, hesap riski sende)'],
    ['BetterXcloud', 'ui.splashVideo.skip', true, 'Xbox açılış videosunu atla'],
    ['BetterXcloud', 'ui.reduceAnimations', true, 'Arayüz animasyonlarını azalt (daha hızlı)'],
    ['BetterXcloud', 'block.tracking', true, 'xCloud analitiğini kapat (daha az istek)'],
  ]

  // Ayarları Better xCloud'un deposuna yazar ve sayfayı yeniler (yalnızca www.xbox.com'da).
  window.__casperApplyRecommended = function () {
    if (location.hostname !== 'www.xbox.com') return false
    const stores = {}
    for (const [key, pref, value] of RECOMMENDED) {
      if (!stores[key]) {
        try { stores[key] = JSON.parse(localStorage.getItem(key) || '{}') } catch (e) { stores[key] = {} }
      }
      stores[key][pref] = value
    }
    for (const key in stores) localStorage.setItem(key, JSON.stringify(stores[key]))
    location.reload()
    return true
  }

  const check = (key, label, hint) =>
    `<label class="check"><input type="checkbox" data-key="${key}" ${state.settings[key] ? 'checked' : ''}><span>${label}${hint ? `<br><small>${hint}</small>` : ''}</span></label>`

  function render() {
    const panel = root.querySelector('.panel')
    if (!state) {
      panel.innerHTML = `<div class="bar"><h2>Casper xCloud</h2><button class="x">✕</button></div><p class="msg">${esc(msg)}</p>`
      panel.querySelector('.x').addEventListener('click', close)
      return
    }
    const s = state.settings
    panel.innerHTML = `
      <div class="bar"><h2>Casper xCloud</h2><button class="x" title="Kapat (Esc)">✕</button></div>
      <button class="btn primary quick" id="quick">⚡ xCloud'u hızlı aç (bölge otomatik)</button>
      <details class="quick-list"><summary>Neler değişir?</summary><ul>${RECOMMENDED.map((r) => `<li>${r[3]}</li>`).join('')}</ul><small>Sayfa yenilenir. Oyundaysan oturum kapanır.</small></details>
      <button class="power ${s.enabled ? 'on' : ''}" id="power"><span class="dot">⏻</span>Casper xCloud ${s.enabled ? 'Açık' : 'Kapalı'}</button>
      <button class="btn" id="bx" ${s.enabled && window.__casperBx ? '' : 'disabled'}>Casper xCloud ayar penceresini aç</button>
      <p class="note">Değiştirdiğin ayarların çoğu xCloud penceresini yeniden açar; oyundaysan oturum kapanır.</p>

      <h3>Uygulama</h3>
      ${check('autostart', 'Windows açılınca başlat')}
      ${check('close_to_tray', 'Kapatınca tepsiye küçült')}
      ${check('auto_play', "Açılışta xCloud'u otomatik başlat")}
      <label>xCloud dili / bölgesi
        <select id="locale">${LOCALES.map(([v, n]) => `<option value="${v}" ${v === s.locale ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </label>

      <h3>Casper xCloud</h3>
      ${check('webgpu', 'WebGPU görüntü işleyici', 'Deneysel; bazı ekran kartlarında daha akıcı')}
      ${check('debug', 'Hata ayıklama günlüğü (konsol)')}

      <p class="msg muted">${esc(msg)}</p>
      <button class="btn" id="support">Destek: Casper Technology web sitesi</button>
      <p class="muted">© 2026 Casper Technology · Kısayol: Ctrl+Shift+X</p>`

    panel.querySelector('.x').addEventListener('click', close)
    panel.querySelector('#power').addEventListener('click', () => call('set_enabled', { on: !s.enabled }))
    panel.querySelector('#bx').addEventListener('click', () => { close(); window.__casperBx && window.__casperBx.openSettings() })
    panel.querySelectorAll('input[data-key]').forEach((el) =>
      el.addEventListener('change', () => save({ [el.dataset.key]: el.checked })))
    panel.querySelector('#locale').addEventListener('change', (e) => save({ locale: e.target.value }))
    panel.querySelector('#support').addEventListener('click', () => invoke('open_support').catch((e) => { msg = String(e && e.message || e); render() }))
    panel.querySelector('#quick').addEventListener('click', async (e) => {
      e.target.disabled = true
      e.target.textContent = 'Açılıyor…'
      // Uygulama tarafı: Casper xCloud kapalıysa açar, www.xbox.com hazır olunca ayarları yazıp yeniler
      await call('apply_recommended', {}, () => 'xCloud bölge ayarıyla açılıyor…')
    })
  }

  async function call(cmd, args, okMsg) {
    try {
      const next = await invoke(cmd, args)
      // Pencere yeniden açıldıysa bu sayfa zaten kapanıyor; değilse paneli güncelle
      state = next
      msg = okMsg ? okMsg(next) : 'Kaydedildi'
    } catch (e) {
      msg = String(e && e.message || e)
    }
    render()
  }

  const save = (patch) => call('set_settings', { settings: Object.assign({}, state.settings, patch) })

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
      e.preventDefault()
      e.stopPropagation()
      wrap.classList.contains('hidden') ? open() : close()
    }
  }, true)

  if (document.documentElement) mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })
})()
