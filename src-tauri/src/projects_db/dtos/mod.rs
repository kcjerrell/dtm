/// I will gradually be re-working many of these DTOs into api models
/// They will still serialize the same, for sending to the front end
/// But will have useful methods for working with the entities
/// instead of having jump through several layers just to get the image from an image

/// they will follow the pattern of...
/// struct EmbeddingModels {
///     pdb: ProjectsDB
/// }
/// impl EmbeddingModels {
///     list() -> Vec<EmbeddingModel>
///     delete(embedding_model)
///     create(embedding_model)
///     etc
/// }

pub mod clip;
pub mod image;
pub mod model;
pub mod project;
pub mod tensor;
pub mod text;
pub mod watch_folder;
pub mod embedding_model;
pub mod embedding;