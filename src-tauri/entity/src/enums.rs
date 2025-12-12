use num_enum::TryFromPrimitive;
use sea_orm::{DeriveActiveEnum, EnumIter};
use serde::{Deserialize, Serialize};

/// Model type enum stored as i8
#[derive(
    Copy, Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize, Hash,
)]
#[sea_orm(rs_type = "i8", db_type = "TinyInteger")]
pub enum ModelType {
    #[sea_orm(num_value = 0)]
    None,
    #[sea_orm(num_value = 1)]
    Model,
    #[sea_orm(num_value = 2)]
    Lora,
    #[sea_orm(num_value = 3)]
    Cnet,
    #[sea_orm(num_value = 4)]
    Upscaler,
}

/// Sampler enum stored as i8 in DB, serialized as string in JSON
#[derive(
    Copy,
    Clone,
    Debug,
    PartialEq,
    Eq,
    EnumIter,
    DeriveActiveEnum,
    Serialize,
    Deserialize,
    TryFromPrimitive,
)]
#[repr(i8)]
#[sea_orm(rs_type = "i8", db_type = "TinyInteger")]
pub enum Sampler {
    #[sea_orm(num_value = -1)]
    #[serde(rename = "Unknown")]
    Unknown = -1,

    #[sea_orm(num_value = 0)]
    #[serde(rename = "DPMPP2MKarras")]
    DPMPP2MKarras = 0,

    #[sea_orm(num_value = 1)]
    #[serde(rename = "EulerA")]
    EulerA = 1,

    #[sea_orm(num_value = 2)]
    #[serde(rename = "DDIM")]
    DDIM = 2,

    #[sea_orm(num_value = 3)]
    #[serde(rename = "PLMS")]
    PLMS = 3,

    #[sea_orm(num_value = 4)]
    #[serde(rename = "DPMPPSDEKarras")]
    DPMPPSDEKarras = 4,

    #[sea_orm(num_value = 5)]
    #[serde(rename = "UniPC")]
    UniPC = 5,

    #[sea_orm(num_value = 6)]
    #[serde(rename = "LCM")]
    LCM = 6,

    #[sea_orm(num_value = 7)]
    #[serde(rename = "EulerASubstep")]
    EulerASubstep = 7,

    #[sea_orm(num_value = 8)]
    #[serde(rename = "DPMPPSDESubstep")]
    DPMPPSDESubstep = 8,

    #[sea_orm(num_value = 9)]
    #[serde(rename = "TCD")]
    TCD = 9,

    #[sea_orm(num_value = 10)]
    #[serde(rename = "EulerATrailing")]
    EulerATrailing = 10,

    #[sea_orm(num_value = 11)]
    #[serde(rename = "DPMPPSDETrailing")]
    DPMPPSDETrailing = 11,

    #[sea_orm(num_value = 12)]
    #[serde(rename = "DPMPP2MAYS")]
    DPMPP2MAYS = 12,

    #[sea_orm(num_value = 13)]
    #[serde(rename = "EulerAAYS")]
    EulerAAYS = 13,

    #[sea_orm(num_value = 14)]
    #[serde(rename = "DPMPPSDEAYS")]
    DPMPPSDEAYS = 14,

    #[sea_orm(num_value = 15)]
    #[serde(rename = "DPMPP2MTrailing")]
    DPMPP2MTrailing = 15,

    #[sea_orm(num_value = 16)]
    #[serde(rename = "DDIMTrailing")]
    DDIMTrailing = 16,

    #[sea_orm(num_value = 17)]
    #[serde(rename = "UniPCTrailing")]
    UniPCTrailing = 17,

    #[sea_orm(num_value = 18)]
    #[serde(rename = "UniPCAYS")]
    UniPCAYS = 18,
}

impl TryFrom<i32> for Sampler {
    type Error = ();

    fn try_from(v: i32) -> Result<Self, Self::Error> {
        match v {
            -1 => Ok(Sampler::Unknown),
            0 => Ok(Sampler::DPMPP2MKarras),
            1 => Ok(Sampler::EulerA),
            2 => Ok(Sampler::DDIM),
            3 => Ok(Sampler::PLMS),
            4 => Ok(Sampler::DPMPPSDEKarras),
            5 => Ok(Sampler::UniPC),
            6 => Ok(Sampler::LCM),
            7 => Ok(Sampler::EulerASubstep),
            8 => Ok(Sampler::DPMPPSDESubstep),
            9 => Ok(Sampler::TCD),
            10 => Ok(Sampler::EulerATrailing),
            11 => Ok(Sampler::DPMPPSDETrailing),
            12 => Ok(Sampler::DPMPP2MAYS),
            13 => Ok(Sampler::EulerAAYS),
            14 => Ok(Sampler::DPMPPSDEAYS),
            15 => Ok(Sampler::DPMPP2MTrailing),
            16 => Ok(Sampler::DDIMTrailing),
            17 => Ok(Sampler::UniPCTrailing),
            18 => Ok(Sampler::UniPCAYS),
            _ => Err(()),
        }
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "i8", db_type = "TinyInteger")]
pub enum ItemType {
    #[sea_orm(num_value = 0)]
    None,
    #[sea_orm(num_value = 1)]
    Projects,
    #[sea_orm(num_value = 2)]
    ModelInfo,
}
