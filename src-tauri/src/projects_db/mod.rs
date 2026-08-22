// #![allow(dead_code)]
// #![allow(non_snake_case)]
// #![allow(non_camel_case_types)]
// #![allow(unused_imports)]
// #![allow(unused_variables)]
// #![allow(mismatched_lifetime_syntaxes)]

pub mod archive;
pub use crate::dt_project::{close_folder, get_last_row, DTProject};
#[cfg(feature = "tensor_bench")]
pub use archive::print_tensor_benchmarks;
pub use archive::{create_dt_archive, create_dt_archive_plan};
mod projects_db;
pub use projects_db::*;

pub mod dt_resource_handle;
pub use dt_resource_handle::DtResourceHandle;

mod dtm_dtproject;
pub use dtm_dtproject::{extract_jpeg_slice, DTPResource, DtmProtocol};

pub mod tensor_history_mod;

mod tensors;
pub use tensors::*;

mod audio;

mod metadata;
pub use metadata::DrawThingsMetadata;

mod text_history;
pub use text_history::{PromptPair, TextHistory};

pub mod filters;
mod search;

pub mod dtos;

pub mod folder_cache;

mod enums;
pub use enums::{DtProjectRef, DtResourceRef, TdRef, ThnRef, ThnResource};
