// Release'te ek konsol penceresi açılmasın
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    casper_xcloud_lib::run()
}
