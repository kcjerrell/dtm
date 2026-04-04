use crate::ffmpeg::{get_ffmpeg_path, get_ffprobe_path};
use tauri::AppHandle;
use tokio::process::Command;

#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<String, String> {
    let ffmpeg_path = get_ffmpeg_path(&app).await?;
    let ffprobe_path = get_ffprobe_path(&app).await?;

    let (cmd, args) = if ffprobe_path.exists() {
        (
            ffprobe_path,
            vec![
                "-v".to_string(),
                "quiet".to_string(),
                "-print_format".to_string(),
                "json".to_string(),
                "-show_format".to_string(),
                "-show_streams".to_string(),
                path,
            ],
        )
    } else {
        (
            ffmpeg_path,
            vec![
                "-i".to_string(),
                path,
                "-f".to_string(),
                "ffmetadata".to_string(),
                "-".to_string(),
            ],
        )
    };

    let output = Command::new(cmd)
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let stdout = match output.status.success() {
        true => String::from_utf8_lossy(&output.stdout).to_string(),
        false => {
            log::warn!(
                "video metadata: {}",
                String::from_utf8_lossy(&output.stderr).to_string()
            );
            return Ok(String::default());
        }
    };

    /*
    ";FFMETADATA1
    major_brand=isom
    minor_version=512
    compatible_brands=isomiso2avc1mp41
    comment={\"c\":\"The man grips the chain with both hands, pulling it taut, menacingly, saying \\\\\"hello chain\\\\\"\",\"model\":\"ltx_2.3_22b_distilled_q6p.ckpt\",\"profile\":{\"duration\":0,\"timings\":[]},\"sampler\":\"TCD Trailing\",\"scale\":1,\"seed\":931386102,\"seed_mode\":\"Scale Alike\",\"shift\":5,\"size\":\"512x384\",\"steps\":8,\"strength\":1,\"uc\":\"a lovely cat色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走\",\"v2\":{\"aestheticScore\":6,\"batchCount\":1,\"batchSize\":1,\"causalInference\":0,\"causalInferencePad\":0,\"cfgZeroInitSteps\":0,\"cfgZeroStar\":true,\"clipLText\":null,\"clipSkip\":2,\"clipWeight\":1,\"controls\":[],\"cropLeft\":0,\"cropTop\":0,\"decodingTileHeight\":1024,\"decodingTileOverlap\":128,\"decodingTileWidth\":1024,\"diffusionTileHeight\":1920,\"diffusionTileOverlap\":192,\"diffusionTileWidth\":1088,\"fps\":5,\"guidanceEmbed\":4.5,\"guidanceScale\":1,\"guidingFrameNoise\":0.02,\"height\":384,\"hiresFix\":false,\"hiresFixHeight\":384,\"hiresFixStrength\":0.7,\"hiresFixWidth\":640,\"id\":0,\"imageGuidanceScale\":1.5,\"imagePriorSteps\":5,\"loras\":[],\"maskBlur\":1.5,\"maskBlurOutset\":0,\"model\":\"ltx_2.3_22b_distilled_q6p.ckpt\",\"motionScale\":127,\"negativeAestheticScore\":2.5,\"negativeOriginalImageHeight\":512,\"negativeOriginalImageWidth\":512,\"negativePromptForImagePrior\":true,\"numFrames\":80,\"originalImageHeight\":512,\"originalImageWidth\":512,\"preserveOriginalAfterInpaint\":true,\"refinerStart\":0.125,\"resolutionDependentShift\":false,\"sampler\":19,\"seed\":931386102,\"seedMode\":2,\"separateClipL\":false,\"separateOpenClipG\":false,\"separateT5\":false,\"sharpness\":0,\"shift\":5,\"speedUpWithGuidanceEmbed\":true,\"stage2Guidance\":1,\"stage2Shift\":1,\"stage2Steps\":10,\"startFrameGuidance\":1,\"steps\":8,\"stochasticSamplingGamma\":0.3,\"strength\":1,\"t5TextEncoder\":true,\"targetImageHeight\":512,\"targetImageWidth\":512,\"teaCache\":false,\"teaCacheEnd\":2,\"teaCacheMaxSkipSteps\":3,\"teaCacheStart\":5,\"teaCacheThreshold\":0.2,\"tiledDecoding\":false,\"tiledDiffusion\":false,\"upscalerScaleFactor\":0,\"width\":512,\"zeroNegativePrompt\":false}}
    encoder=Lavf62.3.100
    "
    */

    Ok(stdout)
}

#[tauri::command]
pub async fn get_video_thumbnail(app: AppHandle, path: String) -> Result<Vec<u8>, String> {
    let ffmpeg_path = get_ffmpeg_path(&app).await?;

    let output = Command::new(ffmpeg_path)
        .args([
            "-ss",
            "00:00:01",
            "-i",
            &path,
            "-vframes",
            "1",
            "-c:v",
            "png",
            "-f",
            "image2pipe",
            "pipe:1",
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
