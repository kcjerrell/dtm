#![allow(dead_code)]
#![allow(non_snake_case)]
#![allow(non_camel_case_types)]
#![allow(unused_imports)]
#![allow(unused_variables)]
#![allow(mismatched_lifetime_syntaxes)]


mod dt_project;
pub use dt_project::{close_folder, get_last_row, DTProject, ProjectRef, dt_project_tensordata, maintenance};
pub mod projects_db;
pub use projects_db::ProjectsDb;

mod tensor_history;
pub mod tensor_history_generated;

mod dtm_dtproject;
pub use dtm_dtproject::{extract_jpeg_slice, DtmProtocol};

mod tensor_history_mod;

mod tensors;
pub use tensors::{decode_tensor, build_description};

mod audio;
pub use audio::decode_audio;

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
