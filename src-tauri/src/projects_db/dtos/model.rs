pub use entity::enums::ModelType;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ModelExtra {
    pub id: i64,
    pub model_type: ModelType,
    pub filename: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub count: i64,
}
