use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Derlemeye gömülü Better xCloud userscript'i (redphx/better-xcloud resmi sürümü).
/// GitHub'dan güncelleme yok: her zaman bu sabit sürüm kullanılır.
const BX_EMBEDDED: &str = include_str!("../script/better-xcloud.user.js");
/// xCloud penceresinin içindeki Casper ayar paneli
const PANEL_SCRIPT: &str = include_str!("../script/panel.js");
const PLAY_PREFIX: &str = "play-";
/// Better xCloud MIT lisansı: telif bildirimi exe'deki kopyada kalmalı (görünmez yorum olarak eklenir).
const BX_LICENSE: &str = include_str!("../script/LICENSE-better-xcloud.txt");

/// Script'ten önce çalışır: GitHub'dan inen ve tarayıcıda önbelleklenen çevirilerdeki
/// "Better xCloud" adını "Casper xCloud" yapar (Türkçe vb. diller ayrı dosyadan gelir).
const BRAND_PRELUDE: &str = r#"const __casperBrand = (t) => String(t).split('Better xCloud').join('Casper xCloud');
try {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('BetterXcloud')) {
      const v = localStorage.getItem(k);
      if (v && v.includes('Better xCloud')) localStorage.setItem(k, __casperBrand(v));
    }
  }
} catch (e) {}
const __casperFetch = window.fetch;
window.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  const p = __casperFetch.apply(this, arguments);
  if (url.includes('/redphx/better-xcloud/') && url.includes('/translations/')) {
    return p.then((r) => r.text().then((t) => new Response(__casperBrand(t), { status: r.status, statusText: r.statusText, headers: r.headers })));
  }
  return p;
};
try {
  const st = document.createElement('style');
  st.textContent = '.bx-donation-link{display:none!important}';
  document.documentElement.appendChild(st);
} catch (e) {}"#;
/// Destek / iletişim: Casper Technology web sitesi
const SUPPORT_URL: &str = "https://casper-technology.vercel.app/";
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_NAME: &str = "CasperXcloud";

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
struct Settings {
    /// Better xCloud açık/kapalı (güç butonu)
    enabled: bool,
    /// xbox.com dil/bölge yolu, ör. tr-TR
    locale: String,
    /// Windows açılınca başlat
    autostart: bool,
    /// Uygulama açılınca xCloud penceresini de aç
    auto_play: bool,
    /// Pencere kapatılınca tepsiye küçült
    close_to_tray: bool,
    /// Better xCloud bayrakları (custom-flags.user.js karşılığı)
    webgpu: bool,
    debug: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: true,
            locale: "tr-TR".into(),
            autostart: false,
            auto_play: false,
            close_to_tray: true,
            webgpu: false,
            debug: false,
        }
    }
}

#[derive(Serialize, Clone)]
struct AppStateDto {
    settings: Settings,
    playing: bool,
    script_version: String,
}

struct AppState {
    settings: Mutex<Settings>,
    play_label: Mutex<Option<String>>,
    counter: AtomicU32,
    tray_toggle: Mutex<Option<MenuItem<tauri::Wry>>>,
}

// ---------- dosyalar ----------

fn app_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("CasperXcloud")
}

fn load_settings() -> Settings {
    std::fs::read_to_string(app_dir().join("settings.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_settings(s: &Settings) {
    let _ = std::fs::create_dir_all(app_dir());
    if let Ok(json) = serde_json::to_string_pretty(s) {
        let _ = std::fs::write(app_dir().join("settings.json"), json);
    }
}

fn version_of(script: &str) -> String {
    script
        .lines()
        .take(30)
        .find_map(|l| l.trim().strip_prefix("// @version").map(|v| v.trim().to_string()))
        .unwrap_or_else(|| "?".into())
}

/// Pencere oluşturulurken sayfaya enjekte edilen kod:
/// - play.xbox.com (Better xCloud'un desteklemediği yeni site) → eski xbox.com/play'e döndürür
///   (upstream'in resmi "Opt-out play.xbox.com" script'iyle aynı yöntem)
/// - Better xCloud'u yalnızca www.xbox.com'da çalıştırır
/// - BX_FLAGS ayarlarını uygular
/// - Better xCloud ayar penceresini launcher'dan açabilmek için köprü ekler
/// - Script'i <html> öğesi oluşunca çalıştırır: WebView2 enjeksiyonu document.documentElement
///   henüz yokken çalışır (Tampermonkey'de vardır); Better xCloud CSS'i ve arayüzü oraya ekler.
///   MutationObserver geri çağrısı sayfanın ilk script'inden önce çalıştığı için yamalar gecikmez.
fn init_script(s: &Settings) -> String {
    // Ekranda görünen ad: "Better xCloud" → "Casper xCloud".
    // Sanal kontrolcü kimliği de değişir ama tanımı ve kontrolü aynı dosyada olduğu için tutarlı kalır.
    let script = BX_EMBEDDED.replace("Better xCloud", "Casper xCloud");
    let flags = serde_json::json!({
        "EnableWebGPURenderer": s.webgpu,
        "Debug": s.debug,
        // GitHub'dan sürüm denetimi kapalı
        "CheckForUpdate": false,
    });
    let return_url = format!("https://www.xbox.com/{}/play", s.locale);
    format!(
        "/* Casper xCloud, Better xCloud (https://github.com/redphx/better-xcloud) tabanlıdır.\n{BX_LICENSE}\n*/\n(function(){{\nif (location.hostname === 'play.xbox.com' && !location.pathname.startsWith('/migration')) {{ window.stop(); location.replace('https://play.xbox.com/migration/clear?=returnUrl={return_url}'); return; }}\nif (location.hostname !== 'www.xbox.com') return;\nconst __casperRun = function() {{\n{BRAND_PRELUDE}\nwindow.BX_FLAGS = {flags};\nwindow.__casperBx = {{ openSettings: () => SettingsDialog.getInstance().show() }};\n{script}\n}};\nif (document.documentElement) {{ __casperRun(); }} else {{ const mo = new MutationObserver(() => {{ if (document.documentElement) {{ mo.disconnect(); __casperRun(); }} }}); mo.observe(document, {{ childList: true }}); }}\n}})();"
    )
}

fn dto(state: &AppState) -> AppStateDto {
    AppStateDto {
        playing: state.play_label.lock().unwrap().is_some(),
        script_version: version_of(BX_EMBEDDED),
        settings: state.settings.lock().unwrap().clone(),
    }
}

fn notify(app: &AppHandle) {
    let state = app.state::<AppState>();
    let d = dto(&state);
    if let Some(item) = state.tray_toggle.lock().unwrap().as_ref() {
        let _ = item.set_text(if d.settings.enabled { "Casper xCloud: Açık" } else { "Casper xCloud: Kapalı" });
    }
    let _ = app.emit("state-changed", d);
}

// ---------- otomatik başlatma ----------

#[cfg(windows)]
fn apply_autostart(on: bool) -> Result<(), String> {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(RUN_KEY).map_err(|e| e.to_string())?;
    if on {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value(RUN_NAME, &format!("\"{}\" --autostart", exe.display())).map_err(|e| e.to_string())
    } else {
        match key.delete_value(RUN_NAME) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(not(windows))]
fn apply_autostart(_on: bool) -> Result<(), String> {
    Ok(())
}

// ---------- xCloud penceresi ----------

fn current_play_window(app: &AppHandle, state: &AppState) -> Option<tauri::WebviewWindow> {
    let label = state.play_label.lock().unwrap().clone()?;
    app.get_webview_window(&label)
}

fn open_play_window(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(w) = current_play_window(app, &state) {
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(());
    }
    let s = state.settings.lock().unwrap().clone();
    let n = state.counter.fetch_add(1, Ordering::SeqCst);
    let label = format!("{PLAY_PREFIX}{n}");
    let url = format!("https://www.xbox.com/{}/play", s.locale).parse().map_err(|e| format!("{e}"))?;
    let title = if s.enabled { "xCloud — Casper xCloud açık" } else { "xCloud — Casper xCloud kapalı" };

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        .title(title)
        .inner_size(1280.0, 760.0)
        .min_inner_size(800.0, 480.0)
        .maximized(true)
        .center();
    if s.enabled {
        builder = builder.initialization_script(init_script(&s));
    }
    // Casper ayar paneli her zaman (Better xCloud kapalıyken de) yüklenir
    builder = builder.initialization_script(PANEL_SCRIPT);
    let window = builder.build().map_err(|e| format!("xCloud penceresi açılamadı: {e}"))?;
    #[cfg(windows)]
    fullscreen::attach(&window);
    *state.play_label.lock().unwrap() = Some(label);
    Ok(())
}

fn close_play_window(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Some(w) = current_play_window(app, &state) {
        let _ = w.destroy();
    }
    *state.play_label.lock().unwrap() = None;
}

/// xCloud açıksa yeni ayarlarla yeniden açar (init script pencere oluşturulurken eklenir).
fn reopen_if_playing(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if current_play_window(app, &state).is_some() {
        close_play_window(app);
        open_play_window(app)?;
    }
    Ok(())
}

fn set_enabled_inner(app: &AppHandle, on: bool) -> Result<(), String> {
    {
        let state = app.state::<AppState>();
        let mut s = state.settings.lock().unwrap();
        s.enabled = on;
        save_settings(&s);
    }
    reopen_if_playing(app)?;
    notify(app);
    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ---------- komutlar (pencere açanlar async: Windows'ta senkron komutta pencere oluşturmak kilitlenir) ----------

#[tauri::command]
fn get_state(state: State<AppState>) -> AppStateDto {
    dto(&state)
}

#[tauri::command]
async fn set_enabled(app: AppHandle, on: bool) -> Result<AppStateDto, String> {
    set_enabled_inner(&app, on)?;
    Ok(dto(&app.state::<AppState>()))
}

#[tauri::command]
async fn set_settings(app: AppHandle, settings: Settings) -> Result<AppStateDto, String> {
    let state = app.state::<AppState>();
    let old = state.settings.lock().unwrap().clone();
    if old.autostart != settings.autostart {
        apply_autostart(settings.autostart)?;
    }
    *state.settings.lock().unwrap() = settings.clone();
    save_settings(&settings);
    // Sayfayı etkileyen bir ayar değiştiyse xCloud'u yeniden aç
    let page_changed = old.enabled != settings.enabled
        || old.locale != settings.locale
        || old.webgpu != settings.webgpu
        || old.debug != settings.debug;
    if page_changed {
        reopen_if_playing(&app)?;
    }
    notify(&app);
    Ok(dto(&state))
}

#[tauri::command]
async fn open_play(app: AppHandle) -> Result<AppStateDto, String> {
    open_play_window(&app)?;
    Ok(dto(&app.state::<AppState>()))
}

#[tauri::command]
async fn close_play(app: AppHandle) -> Result<AppStateDto, String> {
    close_play_window(&app);
    Ok(dto(&app.state::<AppState>()))
}

/// Better xCloud'un kendi ayar penceresini xCloud penceresinde açar (gerekirse önce xCloud'u açar).
#[tauri::command]
async fn open_bx_settings(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if !state.settings.lock().unwrap().enabled {
        return Err("Önce Casper xCloud'u aç (güç butonu).".into());
    }
    run_in_xcloud(&app, "if (window.__casperBx && document.body) { window.__casperBx.openSettings(); return true; } return false;")
}

/// Bulut oyun için önerilen ayarları tek tıkla uygular (xCloud'u açar, ayarları yazar, sayfayı yeniler).
/// Ayar listesi panel.js içindeki __casperApplyRecommended fonksiyonundadır.
#[tauri::command]
async fn apply_recommended(app: AppHandle) -> Result<AppStateDto, String> {
    if !app.state::<AppState>().settings.lock().unwrap().enabled {
        set_enabled_inner(&app, true)?;
    }
    run_in_xcloud(&app, "if (window.__casperApplyRecommended) { window.__casperApplyRecommended(); return true; } return false;")?;
    Ok(dto(&app.state::<AppState>()))
}

/// xCloud penceresini açar (gerekirse), play.xbox.com → www.xbox.com yönlendirmesi bitene kadar
/// bekler, sonra `body` true dönene kadar (en fazla ~30 sn) sayfada yeniden dener.
fn run_in_xcloud(app: &AppHandle, body: &str) -> Result<(), String> {
    open_play_window(app)?;
    let state = app.state::<AppState>();
    let w = current_play_window(app, &state).ok_or("xCloud penceresi bulunamadı")?;
    let _ = w.set_focus();
    let js = format!("(function t(n){{ const ok = (function(){{ {body} }})(); if (!ok && n > 0) setTimeout(function(){{ t(n-1); }}, 500); }})(60);");
    tauri::async_runtime::spawn(async move {
        for _ in 0..60 {
            let ready = w.url().map(|u| u.host_str() == Some("www.xbox.com")).unwrap_or(false);
            if ready {
                let _ = w.eval(&js);
                return;
            }
            sleep_ms(500).await;
        }
    });
    Ok(())
}

/// Casper Technology destek sitesini varsayılan tarayıcıda açar (sabit adres; parametre almaz).
#[tauri::command]
fn open_support() -> Result<(), String> {
    std::process::Command::new("explorer").arg(SUPPORT_URL).spawn().map(|_| ()).map_err(|e| e.to_string())
}

async fn sleep_ms(ms: u64) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_millis(ms))).await;
}

// ---------- tepsi ----------

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let enabled = app.state::<AppState>().settings.lock().unwrap().enabled;
    let show = MenuItem::with_id(app, "show", "Göster", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", if enabled { "Casper xCloud: Açık" } else { "Casper xCloud: Kapalı" }, true, None::<&str>)?;
    let play = MenuItem::with_id(app, "play", "xCloud'u başlat", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &play, &quit])?;
    *app.state::<AppState>().tray_toggle.lock().unwrap() = Some(toggle);

    let mut tray = TrayIconBuilder::with_id("main").tooltip("Casper xCloud").menu(&menu).show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| {
        let app = app.clone();
        match event.id().as_ref() {
            "show" => show_main(&app),
            "toggle" => {
                // Pencere oluşturma ana iş parçacığını bloklamasın
                tauri::async_runtime::spawn(async move {
                    let on = !app.state::<AppState>().settings.lock().unwrap().enabled;
                    let _ = set_enabled_inner(&app, on);
                });
            }
            "play" => {
                tauri::async_runtime::spawn(async move {
                    let _ = open_play_window(&app);
                    notify(&app);
                });
            }
            "quit" => app.exit(0),
            _ => {}
        }
    })
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            show_main(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

/// xCloud oyunu tam ekrana geçince (Fullscreen API) pencereyi de tam ekran yap.
/// WebView2 bunu kendiliğinden yapmaz; olayı dinleyip pencereye aktarıyoruz.
#[cfg(windows)]
mod fullscreen {
    use webview2_com::ContainsFullScreenElementChangedEventHandler;
    use windows::core::BOOL;

    pub fn attach(window: &tauri::WebviewWindow) {
        let w = window.clone();
        let _ = window.with_webview(move |wv| unsafe {
            let Ok(core) = wv.controller().CoreWebView2() else { return };
            let w2 = w.clone();
            let handler = ContainsFullScreenElementChangedEventHandler::create(Box::new(move |sender, _| {
                if let Some(sender) = sender {
                    let mut fs = BOOL::default();
                    if sender.ContainsFullScreenElement(&mut fs).is_ok() {
                        let _ = w2.set_fullscreen(fs.as_bool());
                    }
                }
                Ok(())
            }));
            let mut token = Default::default();
            let _ = core.add_ContainsFullScreenElementChanged(&handler, &mut token);
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let from_autostart = std::env::args().any(|a| a == "--autostart");
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        // GitHub Releases'tan otomatik güncelleme (imzalı; tauri.conf.json > plugins.updater)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            settings: Mutex::new(load_settings()),
            play_label: Mutex::new(None),
            counter: AtomicU32::new(0),
            tray_toggle: Mutex::new(None),
        })
        .setup(move |app| {
            build_tray(app)?;
            let s = app.state::<AppState>().settings.lock().unwrap().clone();
            // Windows açılışında tepsiden sessiz başla
            if from_autostart && s.close_to_tray {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            if s.auto_play {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = open_play_window(&h);
                    notify(&h);
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label().to_string();
            match event {
                WindowEvent::CloseRequested { api, .. } if label == "main" => {
                    let app = window.app_handle();
                    if app.state::<AppState>().settings.lock().unwrap().close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        app.exit(0);
                    }
                }
                WindowEvent::Destroyed if label.starts_with(PLAY_PREFIX) => {
                    let app = window.app_handle();
                    let state = app.state::<AppState>();
                    let mut cur = state.play_label.lock().unwrap();
                    if cur.as_deref() == Some(label.as_str()) {
                        *cur = None;
                        drop(cur);
                        notify(app);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_enabled,
            set_settings,
            open_play,
            close_play,
            open_bx_settings,
            apply_recommended,
            open_support,
        ])
        .run(tauri::generate_context!())
        .expect("Casper xCloud başlatılamadı");
}
