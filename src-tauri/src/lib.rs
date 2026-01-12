#![recursion_limit = "256"]

use tauri::{http, Manager, TitleBarStyle};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_http::reqwest;
use tauri_plugin_log::log::LevelFilter;
use tauri_plugin_window_state::StateFlags;

mod clipboard;

mod projects_db;

use once_cell::sync::Lazy;
use tokio::runtime::Runtime;

pub static TOKIO_RT: Lazy<Runtime> =
    Lazy::new(|| Runtime::new().expect("Failed to create Tokio runtime"));

// #[tauri::command]
// fn get_tensor(project_file: String, name: String) -> Result<dt_project::TensorResult, String> {
//     let project = dt_project::DTProject::new(&project_file).unwrap();
//     Ok(project.get_tensor(name).unwrap())
// }

#[tauri::command]
fn read_clipboard_types(pasteboard: Option<String>) -> Result<Vec<String>, String> {
    clipboard::read_clipboard_types(pasteboard)
}

#[tauri::command]
fn read_clipboard_strings(
    types: Vec<String>,
    pasteboard: Option<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    clipboard::read_clipboard_strings(types, pasteboard)
}

#[tauri::command]
fn read_clipboard_binary(ty: String, pasteboard: Option<String>) -> Result<Vec<u8>, String> {
    clipboard::read_clipboard_binary(ty, pasteboard)
}

#[tauri::command]
fn write_clipboard_binary(ty: String, data: Vec<u8>) -> Result<(), String> {
    clipboard::write_clipboard_binary(ty, data)
}

#[tauri::command]
async fn fetch_image_file(url: String) -> Result<Vec<u8>, String> {
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

// #[tauri::command]
// async fn load_metadata(filepath: String) -> Result<Option<HashMap<String, String>>, Box<dyn std::error::Error + 'static>> {
//     // let path = std::path::Path::new(&filepath);
//     // let pb = path.to_path_buf();
//     let _metadata = metadata::load_metadata(&filepath);

//     _metadata
// }

// #[tauri::command]
// fn init_panel(app: tauri::AppHandle) -> Result<(), String> {
//     let _panel = app.get_webview_window("panel").unwrap();
//     _panel.to_popover(ToPopoverOptions {
//         is_fullsize_content: true,
//     });
//     Ok(())
// }

#[tauri::command]
fn show_dev_window(app: tauri::AppHandle) -> Result<(), String> {
    match app.get_webview_window("dev") {
        Some(dev_window) => {
            dev_window.close().unwrap();
        }
        None => {
            let dev_window = WebviewWindowBuilder::new(&app, "dev", WebviewUrl::App("#dev".into()))
                .title("DTM-dev")
                .inner_size(600.0, 400.0)
                .min_inner_size(600.0, 400.0)
                .visible(true)
                .disable_drag_drop_handler()
                .build()
                .unwrap();

            dev_window.show().unwrap();
            dev_window.set_focus().unwrap();
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use projects_db::commands::*;
    use projects_db::dtm_dtproject_protocol;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_valtio::Builder::new().build())
        .plugin(tauri_plugin_nspopover::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .filter(|metadata| {
                    !metadata.target().starts_with("sea_orm")
                        && !metadata.target().starts_with("sqlx")
                })
                .level(LevelFilter::Debug)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            show_dev_window,
            read_clipboard_types,
            read_clipboard_binary,
            write_clipboard_binary,
            read_clipboard_strings,
            fetch_image_file,
            // get_tensor_history,
            // get_tensor,
            // get_thumb_half,
            projects_db_project_list,
            projects_db_project_add,
            projects_db_project_remove,
            projects_db_project_scan,
            projects_db_project_update_exclude,
            projects_db_image_count, // #unused
            projects_db_image_list,
            projects_db_image_rebuild_fts,
            projects_db_watch_folder_list,
            projects_db_watch_folder_add,
            projects_db_watch_folder_remove,
            projects_db_watch_folder_update,
            projects_db_scan_model_info,
            projects_db_list_models,
            dt_project_get_tensor_history, // #unused
            dt_project_get_thumb_half,     // #unused
            dt_project_get_history_full,
            dt_project_get_text_history,
            dt_project_find_predecessor_candidates,
            dt_project_get_tensor_raw, // #unused
            dt_project_get_tensor_size,
            dt_project_decode_tensor
        ])
        .register_asynchronous_uri_scheme_protocol("dtm", |_ctx, request, responder| {
            std::thread::spawn(move || {
                TOKIO_RT.block_on(async move {
                    if request.uri().host().unwrap() == "dtproject" {
                        dtm_dtproject_protocol(request, responder).await;
                    } else {
                        responder.respond(
                            http::Response::builder()
                                .status(http::StatusCode::BAD_REQUEST)
                                .header(http::header::CONTENT_TYPE, mime::TEXT_PLAIN.essence_str())
                                .body("failed to read file".as_bytes().to_vec())
                                .unwrap(),
                        );
                    }
                });
            });
        })
        // .manage(AppState {
        //     project_db: Mutex::new(None)
        // })
        .setup(|app| {
            let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("DTM")
                .inner_size(800.0, 600.0)
                .min_inner_size(600.0, 400.0)
                .visible(false)
                .disable_drag_drop_handler();

            // set transparent title bar only when building for macOS
            #[cfg(target_os = "macos")]
            let win_builder = win_builder
                .hidden_title(true)
                .title_bar_style(TitleBarStyle::Overlay);

            let _window = win_builder.build().unwrap();

            // let _panel_builder =
            //     WebviewWindowBuilder::new(app, "panel", WebviewUrl::App(PathBuf::from("#mini")))
            //         .title("DT Metadata Mini")
            //         .inner_size(400.0, 400.0)
            //         .disable_drag_drop_handler()
            //         .visible(false);

            // let _panel = _panel_builder.build().unwrap();
            // std::env::set_var("RUST_LOG", "sea_orm=debug,sqlx=debug");
            // tracing_subscriber::fmt()
            //     .with_max_level(tracing::Level::DEBUG)
            //     .with_test_writer()
            //     .init();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
