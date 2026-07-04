use anyhow::Result;

use crate::Tensor;

/// Resolves a resource handle into concrete bytes/tensors.
///
/// All methods return `Result<Option<T>, String>`: `Ok(None)` means the
/// resource does not exist / is not applicable for this handle, while `Err`
/// signals a resolution failure. `String` is used as the error type to keep
/// DB-specific error types (e.g. `sqlx::Error`) out of the trait surface so
/// non-DB backends can implement it too.
#[async_trait::async_trait]
pub trait ResourceHandle {
    /// Decompressed tensor + header.
    async fn get_tensor(&self) -> Result<Option<Tensor>>;

    /// PNG bytes from the highest-quality source available.
    async fn get_lossless(&self, scale: Option<i32>) -> Result<Option<Vec<u8>>>;

    /// Preview-quality image bytes.
    /// If half is true, half-size preview is returned if available, falling back to full-size
    async fn get_preview(&self, half: bool) -> Result<Option<Vec<u8>>>;

    /// Audio bytes.
    async fn get_audio(&self) -> Result<Option<Vec<u8>>>;

    /// Frames (e.g. for clip/video resources), as further resource handles.
    /// Returned handles should be directly resolvable without extra lookups
    /// Set preview to true to get fast preview frames, if available
    async fn get_frames(
        &self,
        preview: bool,
    ) -> Result<Option<Vec<Box<dyn ResourceHandle>>>>;
}

