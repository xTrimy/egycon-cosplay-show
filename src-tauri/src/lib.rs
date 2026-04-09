use serde::Serialize;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::Manager;

// ── Custom media protocol helpers ─────────────────────────────────────────────

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut result = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                result.push(b);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&result).into_owned()
}

fn media_mime_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

fn parse_range_header(range: &str, file_size: u64) -> Option<(u64, u64)> {
    let stripped = range.strip_prefix("bytes=")?;
    let mut parts = stripped.splitn(2, '-');
    let start: u64 = parts.next()?.trim().parse().ok()?;
    let end: u64 = parts
        .next()
        .filter(|s| !s.trim().is_empty())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(file_size.saturating_sub(1));
    if start <= end && end < file_size {
        Some((start, end))
    } else {
        None
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CosplayerInfo {
    pub number: u32,
    pub name: String,
    pub media_path: Option<String>,
    pub media_type: String, // "video" | "audio" | "none"
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve AppData dir")
}

/// Creates the full AppData folder structure and seeds default config files
/// on first run. Safe to call on every startup — all operations are no-ops if
/// the file/folder already exists.
fn bootstrap_data_dir(base: &PathBuf) -> std::io::Result<()> {
    // Folders
    for folder in &["media", "idle", "music"] {
        std::fs::create_dir_all(base.join(folder))?;
    }

    // config.json — app settings
    let config_path = base.join("config.json");
    if !config_path.exists() {
        let default_config = serde_json::json!({
            "stageMonitorIndex": 0
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&default_config).unwrap(),
        )?;
    }

    // cosplayers.json — number → name mapping
    let cosplayers_path = base.join("cosplayers.json");
    if !cosplayers_path.exists() {
        let example = serde_json::json!({
            "1": "Cosplayer Name",
            "2": "Another Name"
        });
        std::fs::write(
            &cosplayers_path,
            serde_json::to_string_pretty(&example).unwrap(),
        )?;
    }

    // README.txt — instructions for the operator
    let readme_path = base.join("README.txt");
    if !readme_path.exists() {
        std::fs::write(
            &readme_path,
            "Egycon Cosplay Show — Data Folder\r\n\
             ==================================\r\n\
             \r\n\
             FOLDER STRUCTURE\r\n\
             ----------------\r\n\
             frame.png         Place your decorative full-screen border overlay here.\r\n\
                               Must be a PNG with a transparent center.\r\n\
                               Create it at the exact pixel dimensions shown in\r\n\
                               the app's operator bar (e.g. 1080x1920 for a 4:6 screen).\r\n\
             \r\n\
             cosplayers.json   Maps cosplayer numbers to names.\r\n\
                               Example: { \"1\": \"Ahmed Mohamed\", \"2\": \"Sara Ali\" }\r\n\
             \r\n\
             config.json       App settings.\r\n\
                               stageMonitorIndex: 0 = primary, 1 = second monitor, etc.\r\n\
             \r\n\
             media\\            Place cosplayer media files here.\r\n\
                               Naming: {number}.mp4 for video, {number}.mp3 for audio.\r\n\
                               Example: 1.mp4, 2.mp3, 3.mp4\r\n\
             \r\n\
             idle\\             Place idle/ambient videos here (any name, any count).\r\n\
                               These play randomly when no cosplayer is selected.\r\n\
                               Supported formats: mp4, webm, mov, avi\r\n",
        )?;
    }

    Ok(())
}

/// Reads `stageMonitorIndex` from `config.json` in AppData.
/// Falls back to 0 (primary monitor) if the file or key is missing.
fn read_stage_monitor_index(base: &PathBuf) -> usize {
    let config_path = base.join("config.json");
    if !config_path.exists() {
        return 0;
    }
    let raw = std::fs::read_to_string(&config_path).unwrap_or_default();
    serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|v| v.get("stageMonitorIndex")?.as_u64())
        .map(|n| n as usize)
        .unwrap_or(0)
}

#[tauri::command]
fn get_cosplayer_info(number: u32, app: tauri::AppHandle) -> Result<CosplayerInfo, String> {
    let base = app_data_dir(&app);

    let config_path = base.join("cosplayers.json");
    let name = if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read cosplayers.json: {e}"))?;
        let map: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("Invalid cosplayers.json: {e}"))?;
        map.get(number.to_string())
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string()
    } else {
        "Unknown".to_string()
    };

    let media_dir = base.join("media");
    let video_path = media_dir.join(format!("{number}.mp4"));
    let audio_path = media_dir.join(format!("{number}.mp3"));

    if video_path.exists() {
        Ok(CosplayerInfo {
            number,
            name,
            media_path: Some(video_path.to_string_lossy().replace('\\', "/")),
            media_type: "video".to_string(),
        })
    } else if audio_path.exists() {
        Ok(CosplayerInfo {
            number,
            name,
            media_path: Some(audio_path.to_string_lossy().replace('\\', "/")),
            media_type: "audio".to_string(),
        })
    } else {
        Ok(CosplayerInfo {
            number,
            name,
            media_path: None,
            media_type: "none".to_string(),
        })
    }
}

/// Returns the absolute path to frame.png if it exists, so the frontend
/// can load it via the mediafile:// protocol (same as other media files).
#[tauri::command]
fn get_frame_path(app: tauri::AppHandle) -> Option<String> {
    let path = app_data_dir(&app).join("frame.png");
    if path.exists() {
        Some(path.to_string_lossy().replace('\\', "/"))
    } else {
        None
    }
}

#[tauri::command]
fn get_idle_videos(app: tauri::AppHandle) -> Vec<String> {
    let idle_dir = app_data_dir(&app).join("idle");
    if !idle_dir.exists() {
        return vec![];
    }
    let video_exts = ["mp4", "webm", "mov", "avi"];
    match std::fs::read_dir(&idle_dir) {
        Err(_) => vec![],
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|ext| video_exts.contains(&ext.to_lowercase().as_str()))
                    .unwrap_or(false)
            })
            .map(|e| e.path().to_string_lossy().replace('\\', "/"))
            .collect(),
    }
}

#[tauri::command]
fn get_idle_music(app: tauri::AppHandle) -> Vec<String> {
    let music_dir = app_data_dir(&app).join("music");
    if !music_dir.exists() {
        return vec![];
    }
    let audio_exts = ["mp3", "wav", "ogg", "flac", "m4a", "aac"];
    match std::fs::read_dir(&music_dir) {
        Err(_) => vec![],
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|ext| audio_exts.contains(&ext.to_lowercase().as_str()))
                    .unwrap_or(false)
            })
            .map(|e| e.path().to_string_lossy().replace('\\', "/"))
            .collect(),
    }
}

/// Returns resolution and name of the configured stage monitor.
/// The designer must create frame.png at exactly `width × height` pixels.
#[tauri::command]
fn get_stage_monitor_info(app: tauri::AppHandle) -> Option<MonitorInfo> {
    let base = app_data_dir(&app);
    let index = read_stage_monitor_index(&base);
    let window = app.get_webview_window("main")?;
    let monitors = window.available_monitors().ok()?;
    let (resolved_index, monitor) = monitors
        .iter()
        .enumerate()
        .nth(index)
        .or_else(|| monitors.iter().enumerate().next())?;
    let name = monitor
        .name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Unknown".to_string());
    Some(MonitorInfo {
        index: resolved_index,
        name,
        width: monitor.size().width,
        height: monitor.size().height,
        scale_factor: monitor.scale_factor(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        // Custom protocol that serves AppData media files with byte-range support.
        // Bypasses the asset protocol scope entirely — no 403 issues.
        // convertFileSrc(path, 'mediafile') in the frontend maps to this handler.
        .register_uri_scheme_protocol("mediafile", |app, request| {
            let uri = request.uri().to_string();

            // Respond to CORS preflight (range requests may trigger a preflight
            // in some WebView / browser configurations).
            if request.method() == "OPTIONS" {
                return tauri::http::Response::builder()
                    .status(204)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                    .header("Access-Control-Allow-Headers", "Range")
                    .body(vec![])
                    .unwrap();
            }

            // Strip the scheme+host prefix.
            // WebView2 rewrites the custom scheme in different ways depending on
            // the app origin (dev vs production) and the WebView2 version:
            //   http://mediafile.localhost/path   — dev, HTTP origin
            //   https://mediafile.localhost/path  — production, HTTPS origin
            //   mediafile://localhost/path        — some WebView2 builds
            //   mediafile:///path                 — some platforms (three slashes)
            //   mediafile://path                  — fallback
            let path_encoded: &str = if let Some(p) = uri.strip_prefix("https://mediafile.localhost/") {
                p
            } else if let Some(p) = uri.strip_prefix("http://mediafile.localhost/") {
                p
            } else if let Some(p) = uri.strip_prefix("mediafile://localhost/") {
                p
            } else if let Some(p) = uri.strip_prefix("mediafile:///") {
                p
            } else if let Some(p) = uri.strip_prefix("mediafile://") {
                p
            } else {
                ""
            };

            let path_decoded = url_decode(path_encoded);
            // Normalise to forward slashes so comparisons work on all formats.
            let path_norm = path_decoded.replace('\\', "/");

            // Security: reject anything not under our AppData directory.
            // Use lower-case comparison — Windows paths are case-insensitive.
            let base = app.app_handle().path().app_data_dir().expect("AppData unavailable");
            let base_norm = base.to_string_lossy().replace('\\', "/");
            if path_norm.is_empty()
                || !path_norm
                    .to_lowercase()
                    .starts_with(&base_norm.to_lowercase())
            {
                return tauri::http::Response::builder()
                    .status(403)
                    .body(vec![])
                    .unwrap();
            }

            // PathBuf accepts forward-slash paths on Windows just fine
            let file_path = std::path::PathBuf::from(&path_norm);

            let file_size = match std::fs::metadata(&file_path) {
                Ok(m) => m.len(),
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(404)
                        .body(vec![])
                        .unwrap();
                }
            };

            let ext = file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            let content_type = media_mime_type(ext);

            // Range request support — required for video seek / progressive load
            let range_value = request
                .headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            if let Some(ref range_str) = range_value {
                if let Some((start, end)) = parse_range_header(range_str, file_size) {
                    let length = end - start + 1;
                    let mut buf = vec![0u8; length as usize];
                    if let Ok(mut file) = std::fs::File::open(&file_path) {
                        if file.seek(SeekFrom::Start(start)).is_ok() {
                            let _ = file.read_exact(&mut buf);
                        }
                    }
                    return tauri::http::Response::builder()
                        .status(206)
                        .header("Content-Type", content_type)
                        .header("Content-Length", length.to_string())
                        .header("Content-Range", format!("bytes {start}-{end}/{file_size}"))
                        .header("Accept-Ranges", "bytes")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(buf)
                        .unwrap();
                }
            }

            // Full-file response
            match std::fs::read(&file_path) {
                Ok(bytes) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", content_type)
                    .header("Content-Length", file_size.to_string())
                    .header("Accept-Ranges", "bytes")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap(),
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(vec![])
                    .unwrap(),
            }
        })
        .setup(|app| {
            let base = app.path().app_data_dir().expect("AppData unavailable");

            // Create folders and seed default configs on first run
            bootstrap_data_dir(&base).expect("Failed to initialize data directory");

            let monitor_index = read_stage_monitor_index(&base);

            let window = app
                .get_webview_window("main")
                .expect("main window not found");

            // Position the window on the target monitor BEFORE fullscreen so
            // the OS activates fullscreen on the correct display.
            let monitors = window.available_monitors().unwrap_or_default();
            let target = monitors.get(monitor_index).or_else(|| monitors.first());

            if let Some(monitor) = target {
                let pos = monitor.position();
                window
                    .set_position(tauri::PhysicalPosition::new(pos.x, pos.y))
                    .ok();
            }

            window.set_fullscreen(true).ok();
            window.show().ok();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_cosplayer_info,
            get_frame_path,
            get_idle_videos,
            get_idle_music,
            get_stage_monitor_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
