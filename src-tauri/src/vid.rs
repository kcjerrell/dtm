use regex::Regex;
use sea_orm::{EntityTrait, JoinType, QuerySelect, RelationTrait};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::{fs, path::PathBuf};
use tauri::{Emitter, Manager};

use crate::projects_db::{decode_tensor, DTProject, ProjectsDb};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FramesExportOpts {
    pub image_id: i64,
    pub output_dir: String,
    pub use_tensor: bool,
    pub filename_pattern: String,
    pub clip_number: Option<u32>,
    pub start_frame: Option<u32>,
}

#[tauri::command]
pub async fn save_all_clip_frames(
    app: tauri::AppHandle,
    opts: FramesExportOpts,
) -> Result<(usize, String), String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;

    let result: Option<(String, i64, i64)> = entity::images::Entity::find_by_id(opts.image_id)
        .join(
            JoinType::InnerJoin,
            entity::images::Relation::Projects.def(),
        )
        .select_only()
        .column(entity::projects::Column::Path)
        .column(entity::images::Column::NodeId)
        .column(entity::images::Column::ProjectId)
        .into_tuple()
        .one(&projects_db.db)
        .await
        .map_err(|e| e.to_string())?;

    let (project_path, node_id, _project_db_id) = result.ok_or("Image or Project not found")?;

    // 2. Fetch Clip Frames
    let dt_project = DTProject::get(&project_path)
        .await
        .map_err(|e| e.to_string())?;
    let frames = dt_project
        .get_histories_from_clip(node_id)
        .await
        .map_err(|e| e.to_string())?;

    if frames.is_empty() {
        return Err("No frames found for this clip".to_string());
    }

    let output_dir = PathBuf::from(&opts.output_dir);
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let mut name_gen = NameGen::new(NameOpts {
        pattern: opts.filename_pattern,
        clip_number: opts.clip_number,
        first: opts.start_frame,
        count: frames.len() as u32,
    });

    let total = frames.len();
    match opts.use_tensor {
        true => {
            for (i, frame) in frames.iter().enumerate() {
                let name = name_gen.next().unwrap();
                let tensor = dt_project
                    .get_tensor_raw(&frame.tensor_id)
                    .await
                    .map_err(|e| e.to_string())?;
                let png = decode_tensor(tensor, true, None, None).map_err(|e| e.to_string())?;
                let file_path = output_dir.join(name);
                fs::write(&file_path, png).map_err(|e| e.to_string())?;

                let _ = app.emit(
                    "export_frames_progress",
                    ExportProgress {
                        current: i + 1,
                        total,
                        msg: "Extracting frames...".to_string(),
                    },
                );
            }
        }
        false => {
            for (i, frame) in frames.iter().enumerate() {
                let name = name_gen.next().unwrap();
                let thumb_data = dt_project
                    .get_thumb(frame.preview_id)
                    .await
                    .map_err(|e| e.to_string())?;

                let thumb_data = crate::projects_db::extract_jpeg_slice(&thumb_data)
                    .ok_or("Failed to extract JPEG slice".to_string())?;

                let file_path = output_dir.join(name);
                fs::write(&file_path, thumb_data).map_err(|e| e.to_string())?;

                let _ = app.emit(
                    "export_frames_progress",
                    ExportProgress {
                        current: i + 1,
                        total,
                        msg: "Extracting frames...".to_string(),
                    },
                );
            }
        }
    }

    let _ = app.emit(
        "export_frames_progress",
        ExportProgress {
            current: total,
            total,
            msg: "Done".to_string(),
        },
    );

    Ok((total, output_dir.to_str().unwrap().to_string()))
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    current: usize,
    total: usize,
    msg: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoExportOpts {
    image_id: i64,
    output_file: String,
    use_tensor: bool,
    fps: u8,
    out_fps: Option<u8>,
    width: Option<u32>,
    height: Option<u32>,
}

#[tauri::command]
pub async fn create_video_from_frames(
    app: tauri::AppHandle,
    opts: VideoExportOpts,
) -> Result<String, String> {
    // -------------------------------------------------
    // Prepare temp dir
    // -------------------------------------------------
    let app_data_dir = app.path().app_data_dir().unwrap();
    let temp_dir = app_data_dir.join("temp_video_frames");

    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    // -------------------------------------------------
    // Ensure output directory exists
    // -------------------------------------------------
    let output_file = PathBuf::from(&opts.output_file);

    if let Some(parent) = output_file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let extension = if opts.use_tensor { "png" } else { "jpg" };

    // -------------------------------------------------
    // Export frames first
    // -------------------------------------------------
    let (frame_count, _) = save_all_clip_frames(
        app.clone(),
        FramesExportOpts {
            image_id: opts.image_id,
            output_dir: temp_dir.to_str().unwrap().to_string(),
            use_tensor: opts.use_tensor,
            filename_pattern: format!("frame_####.{}", extension),
            clip_number: None,
            start_frame: None,
        },
    )
    .await?;

    let out_fps = opts.out_fps.unwrap_or(opts.fps);
    let interpolate = out_fps != opts.fps;

    let total_frames = match interpolate {
        true => frame_count as f64 / opts.fps as f64 * out_fps as f64,
        false => frame_count as f64,
    };

    let _ = app.emit(
        "export_video_progress",
        ExportProgress {
            current: 0,
            total: 100,
            msg: "Encoding video…".to_string(),
        },
    );

    // -------------------------------------------------
    // Optional scale filter
    // -------------------------------------------------
    let interp = if interpolate {
        format!(",minterpolate=fps={out_fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    } else {
        "".to_string()
    };

    let vf_arg = if let (Some(w), Some(h)) = (opts.width, opts.height) {
        if w > 0 && h > 0 {
            Some(format!(
                "scale={w}:{h}:force_original_aspect_ratio=decrease:force_divisible_by=2,\
                 pad={w}:{h}:(ow-iw)/2:(oh-ih)/2{interp}"
            ))
        } else {
            None
        }
    } else {
        None
    };

    // -------------------------------------------------
    // Build ffmpeg command
    // -------------------------------------------------
    let mut cmd = Command::new("ffmpeg");

    cmd.args([
        "-y",
        "-framerate",
        &opts.fps.to_string(),
        "-i",
        temp_dir
            .join(format!("frame_%04d.{}", extension))
            .to_str()
            .unwrap(),
        "-progress",
        "pipe:1",
        "-nostats",
        "-stats_period",
        "0.2",
    ]);

    if let Some(vf) = &vf_arg {
        cmd.args(["-vf", vf]);
    }

    cmd.args([
        "-color_range",
        "pc",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
    ]);

    cmd.args([
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        "18",
        output_file.to_str().unwrap(),
    ]);

    cmd.stdout(Stdio::piped());

    // -------------------------------------------------
    // Spawn and read progress
    // -------------------------------------------------
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);

    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;

        // frame=###
        if let Some(f) = line.strip_prefix("frame=") {
            if let Ok(frame) = f.trim().parse::<f64>() {
                let pct = (frame / total_frames).clamp(0.0, 1.0);
                let percent = (pct * 100.0).round() as usize;

                let _ = app.emit(
                    "export_video_progress",
                    ExportProgress {
                        current: percent,
                        total: 100,
                        msg: format!("Encoding… {}%", percent),
                    },
                );
            }
        }
    }

    // -------------------------------------------------
    // Wait for finish
    // -------------------------------------------------
    let status = child.wait().map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("FFmpeg failed to generate video".to_string());
    }

    let _ = app.emit(
        "export_video_progress",
        ExportProgress {
            current: 100,
            total: 100,
            msg: "Done".to_string(),
        },
    );

    Ok(output_file.to_string_lossy().to_string())
}

/// returns the highest existing clip id and frame number for the given pattern
/// -1 indicates no matches
pub fn check_files(dir: &str, pattern: &str) -> Result<(i32, i32), String> {
    log::debug!("checking {} for {}", dir, pattern);
    let matcher = get_matcher(pattern);

    let mut max_clip: i32 = -1;
    let mut max_frame: i32 = -1;

    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in entries {
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().into_owned();
            let caps = matcher.captures(&name);
            if let Some(caps) = caps {
                if let Some(clip) = caps.name("clip") {
                    if let Ok(clip) = clip.as_str().parse::<i32>() {
                        if clip > max_clip {
                            max_clip = clip;
                        }
                    }
                }
                if let Some(frame) = caps.name("frame") {
                    if let Ok(frame) = frame.as_str().parse::<i32>() {
                        if frame > max_frame {
                            max_frame = frame;
                        }
                    }
                }
            }
        }
    }
    Ok((max_clip, max_frame))
}

/// takes a filename pattern and returns a regex that matches the pattern
/// ### will be replaced with capture group \d+ for frame number
/// %% will be replaced with capture group \d+ for clip number
pub fn get_matcher(filename_pattern: &str) -> Regex {
    let mut pattern = regex::escape(filename_pattern);
    pattern = format!("^{}$", pattern);
    let matcher_frame: Regex = Regex::new(r"(\\#)+").unwrap();
    let matcher_clip: Regex = Regex::new(r"%+").unwrap();
    let pattern = matcher_frame.replace_all(&pattern, "(?P<frame>\\d+)");
    let pattern = matcher_clip.replace_all(&pattern, "(?P<clip>\\d+)");
    Regex::new(&pattern).unwrap()
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckPatternResult {
    valid: bool,
    invalid_reason: Option<String>,
    output_dir_dne: bool,
    first_safe_index: u32,
    clip_id: u32,
    examples: Vec<String>,
}

#[tauri::command]
pub fn check_pattern(
    pattern: String,
    dir: String,
    num_frames: u32,
) -> Result<CheckPatternResult, String> {
    let mut result = CheckPatternResult {
        valid: false,
        clip_id: 1,
        first_safe_index: 0,
        ..Default::default()
    };

    if !is_valid_filename(&pattern) {
        result.invalid_reason = Some("Invalid characters in filename pattern".to_string());
        return Ok(result);
    }

    let matcher_frame: Regex = Regex::new(r"#+").unwrap();
    let matcher_clip: Regex = Regex::new(r"%+").unwrap();

    let mut frame_iter = matcher_frame.find_iter(&pattern);
    let mut clip_iter = matcher_clip.find_iter(&pattern);

    let frame_token = frame_iter.next();
    if frame_token.is_none() || frame_iter.next().is_some() {
        result.invalid_reason = Some(
            "Filename pattern must have one frame token (one or more #'s in a row)".to_string(),
        );
        return Ok(result);
    }

    let clip_token = clip_iter.next();
    if clip_iter.next().is_some() {
        result.invalid_reason = Some(
            "Filename pattern can only have at most one clip token (one or more %'s in a row)"
                .to_string(),
        );
        return Ok(result);
    }

    result.valid = true;

    match PathBuf::from(&dir).exists() {
        false => result.output_dir_dne = true,
        true => {
            let (max_clip, max_frame) = check_files(&dir, &pattern).unwrap();
            result.clip_id = (max_clip.max(0) + 1) as u32;
            result.first_safe_index = match clip_token.is_some() {
                true => 1,
                false => (max_frame.max(-1) + 1) as u32,
            };
        }
    }

    let mut name_gen = NameGen::new(NameOpts {
        pattern: pattern.clone(),
        clip_number: Some(result.clip_id),
        first: Some(result.first_safe_index),
        count: num_frames,
    });
    let first = name_gen.next().unwrap_or_default();
    let second = name_gen.next().unwrap_or_default();
    let last = name_gen.last().unwrap_or_default();
    result.examples = [first, second, "...".to_string(), last].to_vec();
    Ok(result)
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameOpts {
    pattern: String,
    clip_number: Option<u32>,
    first: Option<u32>,
    count: u32,
}

#[derive(Clone)]
struct NameGen {
    prefix: String,
    suffix: String,
    pad: u8,
    index: i64,
    first: i64,
    count: i64,
}

impl NameGen {
    pub fn new(opts: NameOpts) -> Self {
        let mut pattern = opts.pattern;

        // 1. Replace Clip Number if present
        if let Some(clip) = opts.clip_number {
            let matcher_clip: Regex = Regex::new(r"%+").unwrap();
            if let Some(mat) = matcher_clip.find(&pattern) {
                let pad = mat.len();
                let clip_str = format!("{:0width$}", clip, width = pad);
                pattern = matcher_clip.replace(&pattern, clip_str).to_string();
            }
        }

        // 2. Parse Frame Number Pattern
        let matcher_frame: Regex = Regex::new(r"#+").unwrap();
        let (prefix, suffix, pad) = if let Some(mat) = matcher_frame.find(&pattern) {
            let prefix = pattern[..mat.start()].to_string();
            let suffix = pattern[mat.end()..].to_string();
            let pad = mat.len() as u8;
            (prefix, suffix, pad)
        } else {
            // Fallback if no frame pattern found (though logic usually implies there should be one for iteration)
            // If no ###, we might just append numbers? Or maybe we assume prefix is everything?
            // Per requirements: "prefix should be everything before #, suffix is everything after"
            // If no #, then it's effectively a static name? But this is an iterator.
            // Let's assume valid pattern has #. If not, behave safely.
            (pattern.clone(), "".to_string(), 0)
        };

        Self {
            prefix,
            suffix,
            pad,
            index: opts.first.unwrap_or(0) as i64 - 1,
            first: opts.first.unwrap_or(0) as i64,
            count: opts.count as i64,
        }
    }

    pub fn copy(&self) -> Self {
        let mut copy = self.clone();
        copy.index = self.first as i64 - 1;
        copy
    }
}

impl Iterator for NameGen {
    type Item = String;

    fn next(&mut self) -> Option<Self::Item> {
        self.index += 1;
        if self.index >= self.first + self.count {
            return None;
        }
        Some(format!(
            "{}{:0width$}{}",
            self.prefix,
            self.index,
            self.suffix,
            width = self.pad as usize
        ))
    }
}

fn is_valid_filename(pattern: &str) -> bool {
    if pattern.is_empty() {
        return false;
    }

    if pattern.chars().any(|c| {
        c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '/' | '\\')
    }) {
        return false;
    }

    // forbid "." or ".."
    if pattern == "." || pattern == ".." {
        return false;
    }

    // forbid trailing dot or space (Windows)
    if pattern.ends_with('.') || pattern.ends_with(' ') {
        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Once;
    use std::sync::OnceLock;
    static PATH: OnceLock<PathBuf> = OnceLock::new();
    static FILES_INIT: Once = Once::new();
    fn initialize_files() {
        FILES_INIT.call_once(|| {
            // create and set the test directory
            let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            path.push("test_data");
            PATH.set(path).unwrap();
            fs::create_dir_all(&PATH.get().unwrap()).unwrap();

            // create test files
            fs::write(PATH.get().unwrap().join("clip_001_frame_0001.png"), "").unwrap();
            fs::write(PATH.get().unwrap().join("clip_001_frame_0002.png"), "").unwrap();
            fs::write(PATH.get().unwrap().join("clip_002_frame_0001.png"), "").unwrap();
            fs::write(PATH.get().unwrap().join("image_003.png"), "").unwrap();
            // this is to make sure patterns are being escaped
            fs::write(PATH.get().unwrap().join("image_004Xpng"), "").unwrap();
        });
    }

    #[test]
    fn test_is_valid_filename() {
        assert!(is_valid_filename("clip_001_frame_0001.png"));
        assert!(is_valid_filename("image-###.png"));
        assert!(is_valid_filename("test 01.png"));
        assert!(is_valid_filename("a.png"));
        assert!(is_valid_filename("###.png"));
        assert!(is_valid_filename("clip_%%%_frame_###.jpg"));

        assert!(!is_valid_filename(""));
        assert!(!is_valid_filename("dir/file.png"));
        assert!(!is_valid_filename("dir\\file.png"));
        assert!(!is_valid_filename("clip<01>.png"));
        assert!(!is_valid_filename("clip:01.png"));
        assert!(!is_valid_filename("clip\"01.png"));
        assert!(!is_valid_filename("clip|01.png"));
        assert!(!is_valid_filename("clip?01.png"));
        assert!(!is_valid_filename("clip*01.png"));
        assert!(!is_valid_filename("clip_\n.png"));
        assert!(!is_valid_filename("clip_\t.png"));
        assert!(!is_valid_filename("."));
        assert!(!is_valid_filename(".."));
        assert!(!is_valid_filename("clip.png."));
        assert!(!is_valid_filename("clip.png "));
    }

    #[test]
    fn test_check_files() {
        initialize_files();
        let path = PATH.get().unwrap();

        // this pattern should return clip = 2, frame = 2
        // because those are the highest values matching the pattern
        // clip_002_frame_0001.png and clip_001_frame_0002.png exist
        assert_eq!(
            check_files(&path.to_str().unwrap(), "clip_%%_frame_###.png").unwrap(),
            (2, 2)
        );

        // this pattern should return clip = -1, frame = 3
        // clip is -1 because there is no clip in the pattern
        // frame is 3 because image_003.png exists
        assert_eq!(
            check_files(&path.to_str().unwrap(), "image_###.png").unwrap(),
            (-1, 3)
        );
    }

    #[test]
    fn test_check_pattern() {
        initialize_files();
        let path = PATH.get().unwrap().to_str().unwrap();
        let result1 =
            check_pattern("clip_%%_frame_###.png".to_string(), path.to_string(), 1).unwrap();
        assert!(result1.valid);
        assert_eq!(result1.clip_id, 3); // next available clip number
        assert_eq!(result1.first_safe_index, 1); // frame always starts at 1 if clip is in pattern

        let result2 = check_pattern("image_###.png".to_string(), path.to_string(), 1).unwrap();
        assert!(result2.valid);
        assert_eq!(result2.clip_id, 1); // clip will always be 1 if not in pattern
        assert_eq!(result2.first_safe_index, 4); // next available frame number

        // pattern has two frames
        let result4 =
            check_pattern("clip_%%_frame_##_###.png".to_string(), path.to_string(), 1).unwrap();
        assert!(!result4.valid);
        // pattern has no frames
        let result5 = check_pattern("clip_%%.png".to_string(), path.to_string(), 1).unwrap();
        assert!(!result5.valid);

        // illegal filename
        let result6 =
            check_pattern("clip_%%\\frame_###.png".to_string(), path.to_string(), 1).unwrap();
        assert!(!result6.valid);
    }

    #[test]
    fn test_name_gen() {
        let mut name_gen = NameGen::new(NameOpts {
            pattern: "frame_####.png".to_string(),
            clip_number: Some(1),
            first: Some(1),
            count: 2,
        });
        assert_eq!(name_gen.next(), Some("frame_0001.png".to_string()));
        assert_eq!(name_gen.next(), Some("frame_0002.png".to_string()));

        let mut name_gen2 = name_gen.copy();
        assert_eq!(name_gen2.next(), Some("frame_0001.png".to_string()));

        assert_eq!(name_gen.next(), None);

        assert_eq!(name_gen2.next(), Some("frame_0002.png".to_string()));
        assert_eq!(name_gen2.next(), None);
    }

    #[test]
    fn test_name_gen_clip() {
        let mut name_gen = NameGen::new(NameOpts {
            pattern: "clip_%%%_frame_###.png".to_string(),
            clip_number: Some(5),
            first: Some(10),
            count: 2,
        });
        // clip 5 padded to 3 digits -> 005
        // frame 10 padded to 3 digits -> 010
        assert_eq!(name_gen.next(), Some("clip_005_frame_010.png".to_string()));
        assert_eq!(name_gen.next(), Some("clip_005_frame_011.png".to_string()));
        assert_eq!(name_gen.next(), None);
    }
}
