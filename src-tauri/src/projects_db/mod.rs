#![allow(dead_code)]
#![allow(non_snake_case)]
#![allow(non_camel_case_types)]
#![allow(unused_imports)]
#![allow(unused_variables)]
#![allow(mismatched_lifetime_syntaxes)]

mod dt_project;
pub use dt_project::{
    close_folder, dt_project_tensordata, get_last_row, maintenance, DTProject, ProjectRef,
};
pub mod projects_db;
pub use projects_db::ProjectsDb;

mod tensor_history;
pub mod tensor_history_generated;

mod dtm_dtproject;
pub use dtm_dtproject::{extract_jpeg_slice, DTPResource, DtmProtocol};

mod tensor_history_mod;

mod tensors;
pub use tensors::{build_description, decode_tensor, DecodeTensorOptions};

mod audio;
pub use audio::{decode_audio, get_audio};

mod metadata;
pub use metadata::DrawThingsMetadata;

mod text_history;
pub use text_history::TextHistory;

pub mod fbs;

pub mod filters;
mod search;

pub mod dtos;

mod tensor_history_tensor_data;
pub use tensor_history_tensor_data::TensorHistoryTensorData;

pub mod folder_cache;
