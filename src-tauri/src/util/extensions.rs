pub enum ImageBufferType {
    Unknown,
    Png,
    Jpg,
}

impl ImageBufferType {
    /// returns the file extension without the leading dot for the image buffer type
    pub fn extension(&self) -> &'static str {
        match self {
            ImageBufferType::Png => "png",
            ImageBufferType::Jpg => "jpg",
            ImageBufferType::Unknown => "",
        }
    }
}

pub trait BytesExt {
    fn get_image_type(&self) -> ImageBufferType;
}

impl BytesExt for [u8] {
    fn get_image_type(&self) -> ImageBufferType {
        if self.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
            ImageBufferType::Png
        } else if self.starts_with(&[0xFF, 0xD8, 0xFF]) {
            ImageBufferType::Jpg
        } else {
            ImageBufferType::Unknown
        }
    }
}
