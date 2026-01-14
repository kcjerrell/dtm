use sea_orm::{
    ColumnTrait, EntityTrait, JoinType, QuerySelect, RelationTrait,
};
use std::fs;
use std::process::Command;
use tauri::Manager;

use crate::projects_db::{DTProject, ProjectsDb};

#[tauri::command]
pub async fn create_video_from_frames(
    app: tauri::AppHandle,
    image_id: i64,
) -> Result<String, String> {
    let projects_db = ProjectsDb::get_or_init(&app).await?;

    // 1. Resolve Project and Node ID (similar to get_clip)
    let result: Option<(String, i64, i64)> = entity::images::Entity::find_by_id(image_id)
        .join(JoinType::InnerJoin, entity::images::Relation::Projects.def())
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

    // 3. Prepare Temp Directory
    let app_data_dir = app.path().app_data_dir().unwrap();
    let temp_dir = app_data_dir.join("temp_video_frames");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    // 4. Save Thumbnails
    for (i, frame) in frames.iter().enumerate() {
        let thumb_data = dt_project
            .get_thumb(frame.preview_id)
            .await
            .map_err(|e| e.to_string())?;

        let thumb_data = crate::projects_db::extract_jpeg_slice(&thumb_data)
            .ok_or("Failed to extract JPEG slice".to_string())?;

        let file_path = temp_dir.join(format!("frame_{:04}.jpg", i));
        fs::write(&file_path, thumb_data).map_err(|e| e.to_string())?;
    }

    // 5. Generate Video with FFmpeg
    let output_file = temp_dir.join("output.mp4");
    // Ensure output file doesn't exist
    if output_file.exists() {
        fs::remove_file(&output_file).map_err(|e| e.to_string())?;
    }

    let status = Command::new("ffmpeg")
        .args(&[
            "-framerate",
            "10", // Adjust framerate as needed, maybe make it an argument?
            "-i",
            temp_dir.join("frame_%04d.jpg").to_str().unwrap(),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            output_file.to_str().unwrap(),
        ])
        .status()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    if !status.success() {
        return Err("FFmpeg failed to generate video".to_string());
    }

    // 6. Return Path
    // For now, let's move it to a more permanent location or just return the temp path.
    // Returning temp path is fine for now, frontend can move it or display it.
    // Actually, let's ensure the path is absolute and accessible.
    Ok(output_file.to_string_lossy().to_string())
}
