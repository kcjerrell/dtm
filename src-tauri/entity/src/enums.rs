use num_enum::TryFromPrimitive;
use sea_orm::{DeriveActiveEnum, EnumIter};
use serde::{Deserialize, Serialize};

/// Model type enum stored as i8
#[derive(Copy, Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize, Hash)]
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
#[derive(Copy, Clone, Debug, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize, TryFromPrimitive)]
#[repr(i8)]
#[sea_orm(rs_type = "i8", db_type = "TinyInteger")]
pub enum Sampler {
    #[sea_orm(num_value = -1)]
    #[serde(rename = "Unknown")]
    Unknown,

    #[sea_orm(num_value = 0)]
    #[serde(rename = "DPMPP2MKarras")]
    DPMPP2MKarras,

    #[sea_orm(num_value = 1)]
    #[serde(rename = "EulerA")]
    EulerA,

    #[sea_orm(num_value = 2)]
    #[serde(rename = "DDIM")]
    DDIM,

    #[sea_orm(num_value = 3)]
    #[serde(rename = "PLMS")]
    PLMS,

    #[sea_orm(num_value = 4)]
    #[serde(rename = "DPMPPSDEKarras")]
    DPMPPSDEKarras,

    #[sea_orm(num_value = 5)]
    #[serde(rename = "UniPC")]
    UniPC,

    #[sea_orm(num_value = 6)]
    #[serde(rename = "LCM")]
    LCM,

    #[sea_orm(num_value = 7)]
    #[serde(rename = "EulerASubstep")]
    EulerASubstep,

    #[sea_orm(num_value = 8)]
    #[serde(rename = "DPMPPSDESubstep")]
    DPMPPSDESubstep,

    #[sea_orm(num_value = 9)]
    #[serde(rename = "TCD")]
    TCD,

    #[sea_orm(num_value = 10)]
    #[serde(rename = "EulerATrailing")]
    EulerATrailing,

    #[sea_orm(num_value = 11)]
    #[serde(rename = "DPMPPSDETrailing")]
    DPMPPSDETrailing,

    #[sea_orm(num_value = 12)]
    #[serde(rename = "DPMPP2MAYS")]
    DPMPP2MAYS,

    #[sea_orm(num_value = 13)]
    #[serde(rename = "EulerAAYS")]
    EulerAAYS,

    #[sea_orm(num_value = 14)]
    #[serde(rename = "DPMPPSDEAYS")]
    DPMPPSDEAYS,

    #[sea_orm(num_value = 15)]
    #[serde(rename = "DPMPP2MTrailing")]
    DPMPP2MTrailing,

    #[sea_orm(num_value = 16)]
    #[serde(rename = "DDIMTrailing")]
    DDIMTrailing,

    #[sea_orm(num_value = 17)]
    #[serde(rename = "UniPCTrailing")]
    UniPCTrailing,

    #[sea_orm(num_value = 18)]
    #[serde(rename = "UniPCAYS")]
    UniPCAYS,
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