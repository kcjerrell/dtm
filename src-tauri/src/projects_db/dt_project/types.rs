#[derive(serde::Serialize, Debug, Clone)]
pub struct TensorSize {
    pub width: i32,
    pub height: i32,
    pub channels: i32,
}