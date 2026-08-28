// The whole wrapper: one window on the live game. No IPC surface, no
// filesystem grants, nothing the web app cannot already do — the wrapper
// adds a frame and a Steam-shaped door, never capabilities.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("the moot never opened");
}
