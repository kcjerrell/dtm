use dtm_macros::{dtp_command, dtp_commands};

use crate::{dtp_service::DTPService, projects_db::dtos::image::ListImagesOptions};

pub struct ProjectExportOptions {
    pub output_folder: String,
    pub use_tensor: bool,
}

#[dtp_commands]
impl DTPService {
    #[dtp_command]
    pub async fn export_projects(
        &self,
        project_ids: Vec<i64>,
        options: ProjectExportOptions,
    ) -> Result<(), String> {
        // rescan all referenced projects using sync_projects_and_wait
        
        self.sync_projects_and_wait(project_ids, true).await?;

        let db = self.get_db().await?;
        
        // for each project...
        // get a reference to the dtproject
        // DTProjects exist in two forms:
        // short lived, cached reference that are used for single/burst requests. these are obtained with DTProject.get
        // long lived, persistent reference that are used for ongoing operations. these are obtained with DTProject.open
        // db.get_dt_project returns a cached reference, so it won't work for the export
        // create db.open_dt_project to obtain a persistent reference

        // create a temp directory
        // see create_video_from_frames in vid_export.rs for an exampe of this

        // get images with db.list_images, restricted to this project's id, sort by wallclock
        
        // there are two images that can be exported:
        // the preview/thumb image (which will be faster)
        // or the decoded tensor (which will be slower but full quality)

        // dtm_dtproject.rs shows how each can be obtained, and how to get metadata

        // make sure the image includes metadata. for thumbs/preview, the jpg will need to be 
        // converted to png to include metadata (write_png_with_usercomment in tensors.rs))
        // filenames should start with an incrementing number or wallclock timestamp,
        // so that the files can be sorted in the order they were originally created
        // they should lso include the start of the prompt
        // save to temp directory

        // zip all images and move to output folder

        Ok(())
    }
}
