#![recursion_limit = "256"]

use reqwest;
use tauri::{http, Manager, TitleBarStyle};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_log::log::LevelFilter;
use tauri_plugin_window_state::StateFlags;

mod clipboard;

pub mod bookmarks;
pub mod dtp_service;
mod ffmpeg;
mod projects_db;
use dtp_service::dtp_connect;
use projects_db::dt_project_tensordata;
mod migrations;
mod vid;
mod vid_export;
use migrations::run_migrations;

use once_cell::sync::Lazy;
use tokio::runtime::Runtime;

pub static TOKIO_RT: Lazy<Runtime> =
    Lazy::new(|| Runtime::new().expect("Failed to create Tokio runtime"));

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
async fn ffmpeg_check(app: tauri::AppHandle) -> Result<bool, String> {
    ffmpeg::check_ffmpeg(&app).await
}

#[tauri::command]
async fn ffmpeg_download(app: tauri::AppHandle) -> Result<(), String> {
    ffmpeg::download_ffmpeg(app).await
}

#[tauri::command]
async fn ffmpeg_call(app: tauri::AppHandle, args: Vec<String>) -> Result<String, String> {
    ffmpeg::call_ffmpeg(&app, args).await
}

#[tauri::command]
async fn fetch_image_file(url: String) -> Result<(Vec<u8>, String), String> {
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let content_type = resp
        .headers()
        .get("Content-Type")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok((bytes.to_vec(), content_type))
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
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    #[cfg(debug_assertions)]
    let builder = builder.plugin(tauri_plugin_webdriver::init());

    builder
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
        .plugin(tauri_plugin_valtio::Builder::new().pretty(true).build())
        // .plugin(tauri_plugin_nspopover::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .filter(|metadata| {
                    !metadata.target().starts_with("sea_orm")
                        && !metadata.target().starts_with("sqlx")
                        && !metadata.target().starts_with("tauri_plugin_updater")
                        && !metadata.target().starts_with("h2::codec")
                        && !metadata.target().starts_with("hyper_util")
                })
                .level(LevelFilter::Debug)
                .clear_targets()
                .targets(vec![
                    // tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("dtm.log".to_string()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .max_file_size(200000)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            show_dev_window,
            read_clipboard_types,
            read_clipboard_binary,
            write_clipboard_binary,
            read_clipboard_strings,
            fetch_image_file,
            vid_export::create_video_from_frames,
            vid_export::save_all_clip_frames,
            vid_export::check_pattern,
            vid::get_video_metadata,
            vid::get_video_thumbnail,
            ffmpeg_check,
            ffmpeg_download,
            ffmpeg_download,
            ffmpeg_call,
            bookmarks::pick_folder_command,
            bookmarks::resolve_bookmark,
            bookmarks::stop_accessing_bookmark,
            dtp_connect,
            dtp_service::data::dtp_pick_watch_folder,
            dtp_service::data::dtp_decode_tensor,
            dtp_service::data::dtp_find_image_from_preview_id,
            dtp_service::data::dtp_find_predecessor,
            dtp_service::data::dtp_get_clip,
            dtp_service::data::dtp_get_history_full,
            dtp_service::data::dtp_get_tensor_size,
            dtp_service::data::dtp_list_images,
            dtp_service::data::dtp_list_models,
            dtp_service::data::dtp_list_projects,
            dtp_service::data::dtp_list_watch_folders,
            dtp_service::data::dtp_remove_watch_folder,
            dtp_service::data::dtp_update_project,
            dtp_service::data::dtp_update_watch_folder,
            dtp_service::dtp_service::dtp_test,
            dtp_service::dtp_service::dtp_sync,
            dtp_service::dtp_service::dtp_lock_folder,
            dtp_service::dtp_service::dtp_sync_projects,
            dtp_service::data::dtp_get_metadata,
            dtp_service::dt_data::dtp_dt_list_tensor_history_node,
            dt_project_tensordata,
            dtp_service::dtp_service::dtp_reset_db,
        ])
        .register_asynchronous_uri_scheme_protocol("dtm", |ctx, request, responder| {
            let app_handle = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let dtp_service = app_handle.state::<dtp_service::DTPService>();
                let dtm_protocol = dtp_service.dtm_protocol().await;
                if request.uri().host().unwrap() == "dtproject" {
                    dtm_protocol
                        .dtm_dtproject_protocol(request, responder)
                        .await;
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
        })
        // .manage(AppState {
        //     project_db: Mutex::new(None)
        // })
        .setup(|app| {
            let _ = tauri::async_runtime::block_on(run_migrations(app.handle().clone()));

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

            let app_handle_wrapper = dtp_service::AppHandleWrapper::new(Some(app.handle().clone()));
            let dtp_service = dtp_service::DTPService::new(app_handle_wrapper.clone());

            app.manage(dtp_service);
            app.manage(app_handle_wrapper);
            // tauri::async_runtime::spawn(async move {
            //     if let Err(e) = dtp_service.init().await {
            //         eprintln!("Failed to init DB: {}", e);
            //     } else {
            //         println!("DB initialized");
            //     }
            // });

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
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| match event {
            tauri::RunEvent::Exit => {
                bookmarks::cleanup_bookmarks();
            }
            _ => {}
        });
}
