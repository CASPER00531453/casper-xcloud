fn main() {
    // Uygulama komutlarını tek tek izne bağla: ana pencere hepsini, xCloud penceresi
    // (uzak site) yalnızca capabilities/xcloud-panel.json'da izin verilenleri çağırabilir.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "get_state",
        "set_enabled",
        "set_settings",
        "open_play",
        "close_play",
        "open_bx_settings",
        "apply_recommended",
        "open_support",
    ])))
    .expect("tauri build betiği başarısız");
}
