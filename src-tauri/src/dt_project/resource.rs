use anyhow::Result;
use serde::Serialize;
use strum::EnumIs;

use crate::dtp_service::archive::DTZip;
use crate::projects_db::extract_jpeg_slice;

#[derive(Debug, Serialize, Clone, EnumIs)]
pub enum DTResource {
    CompressedTensor(CompressedTensor),
    JpgInFbs(JpgWithHeader),
    DTZipRef(DTZipRef),
    Unknown(Vec<u8>),
}

impl DTResource {
    pub fn get_bytes(self) -> Option<Vec<u8>> {
        match self {
            DTResource::CompressedTensor(data) => Some(data.0),
            DTResource::JpgInFbs(data) => Some(data.0),
            DTResource::DTZipRef(_) => None,
            DTResource::Unknown(data) => Some(data),
        }
    }

    pub fn jpg_with_header(data: Vec<u8>) -> DTResource {
        DTResource::JpgInFbs(JpgWithHeader(data))
    }

    pub(crate) fn dt_zip_ref(data: Vec<u8>, dt_zip: &DTZip) -> Result<DTResource> {
        let rel_path = String::from_utf8(data)?;
        let archive_path = dt_zip.archive_path.clone();
        Ok(DTResource::DTZipRef(DTZipRef {
            rel_path,
            archive_path,
        }))
    }

    pub fn compressed_tensor(data: Vec<u8>) -> DTResource {
        DTResource::CompressedTensor(CompressedTensor(data))
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct CompressedTensor(Vec<u8>);
#[derive(Debug, Serialize, Clone)]
pub struct JpgWithHeader(Vec<u8>);
#[derive(Debug, Serialize, Clone)]
pub struct DTZipRef {
    pub rel_path: String,
    pub archive_path: String,
}

impl CompressedTensor {
    pub fn data(&self) -> &[u8] {
        &self.0
    }
}

impl JpgWithHeader {
    pub fn jpg(&self) -> Option<Vec<u8>> {
        extract_jpeg_slice(&self.0)
    }
}
