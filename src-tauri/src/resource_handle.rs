use anyhow::Result;

use crate::Tensor;

/// Resolves a resource handle into concrete bytes/tensors.
///
/// All methods return `Result<Option<T>, String>`: `Ok(None)` means the
/// resource does not exist / is not applicable for this handle, while `Err`
/// signals a resolution failure.
/// 
/// Not all methods are valid for a given resource. The caller should have an
/// idea of what kind of media it is requesting.
/// 
/// Concrete implementations are DtResourceHandle. Potentially implementations
/// could be added for local files, internet media, and other sources.
#[async_trait::async_trait]
pub trait ResourceHandle {
    /// Decompressed tensor + header.
    async fn get_tensor(&self) -> Result<Option<Tensor>>;

    /// Png/jpg bytes from the highest-quality source available.
    async fn get_image(&self, size: Option<u32>) -> Result<Option<Vec<u8>>>;

    /// Preview-quality image bytes.
    /// If half is true, half-size preview is returned if available, falling back to full-size
    async fn get_preview(&self, half: bool) -> Result<Option<Vec<u8>>>;

    /// Audio bytes.
    async fn get_audio(&self) -> Result<Option<Vec<u8>>>;

    /// Json data
    async fn get_json(&self) -> Result<Option<String>> {
        Ok(None)
    }

    /// Frames (e.g. for clip/video resources), as further resource handles.
    /// Returned handles should be directly resolvable without extra lookups
    /// Set preview to true to get fast preview frames, if available
    async fn get_frames(
        &self,
        preview: bool,
    ) -> Result<Option<Vec<Box<dyn ResourceHandle>>>>;
}

