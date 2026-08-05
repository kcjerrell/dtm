// #![allow(dead_code)]
// #![allow(non_snake_case)]
// #![allow(non_camel_case_types)]
// #![allow(unused_imports)]
// #![allow(unused_variables)]
// #![allow(mismatched_lifetime_syntaxes)]

pub mod archive;
pub mod dt_project;
#[cfg(feature = "tensor_bench")]
pub use archive::print_tensor_benchmarks;
pub use archive::{create_dt_archive, create_dt_archive_plan};
pub use dt_project::{close_folder, get_last_row, DTProject};
mod projects_db;
pub use projects_db::*;

pub mod dt_resource_handle;
pub use dt_resource_handle::DtResourceHandle;

mod dtm_dtproject;
pub use dtm_dtproject::{extract_jpeg_slice, DTPResource, DtmProtocol};

mod tensor_history_mod;

mod tensors;
pub use tensors::*;

mod audio;
pub use audio::{decode_audio, get_audio};

mod metadata;
pub use metadata::DrawThingsMetadata;

mod text_history;
pub use text_history::TextHistory;

pub mod filters;
mod search;

pub mod dtos;

mod tensor_history_tensor_data;
pub use tensor_history_tensor_data::TensorHistoryTensorData;

pub mod folder_cache;

mod enums;
pub use enums::{DtProjectRef, DtResourceRef, TdRef, ThnRef, ThnResource};
