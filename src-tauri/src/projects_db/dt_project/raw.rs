use serde::Serialize;
use sqlx::{query, Row};

use crate::projects_db::fbs::{root_as_tensor_data, TensorData};

use super::DTProject;

pub struct DTProjectRaw<'a> {
    dt_project: &'a DTProject,
}

impl<'a> DTProjectRaw<'a> {
    pub fn new(dt_project: &'a DTProject) -> Self {
        Self { dt_project }
    }

    pub async fn tensor_data(&self, first: Option<i64>, last: Option<i64>) -> Vec<TensorDataRow> {
        let where_clause = match (first, last) {
            (Some(first), Some(last)) => format!("where rowid >= {} and rowid <= {}", first, last),
            (Some(first), None) => format!("where rowid >= {}", first),
            (None, Some(last)) => format!("where rowid <= {}", last),
            (None, None) => "".to_string(),
        };
        let text = format!("select * from tensordata {}", where_clause);

        let mut q = query(&text);

        if first.is_some() {
            q = q.bind(first.unwrap());
        }
        if last.is_some() {
            q = q.bind(last.unwrap());
        }

        let rows = q.fetch_all(&*self.dt_project.pool).await.unwrap();
        rows.into_iter()
            .map(|row| {
                let raw = RawTensorDataRow {
                    rowid: row.get("rowid"),
                    __pk0: row.get("__pk0"),
                    __pk1: row.get("__pk1"),
                    __pk2: row.get("__pk2"),
                    p: row.get("p"),
                };
                let data = root_as_tensor_data(&raw.p).unwrap();
                TensorDataRow {
                    raw: raw.clone(),
                    rowid: raw.rowid,
                    lineage: raw.__pk0,
                    logical_time: raw.__pk1,
                    idx: raw.__pk2,
                    x: data.x(),
                    y: data.y(),
                    width: data.width(),
                    height: data.height(),
                    scale_factor_by_120: data.scale_factor_by_120(),
                    tensor_id: data.tensor_id(),
                    mask_id: data.mask_id(),
                    depth_map_id: data.depth_map_id(),
                    scribble_id: data.scribble_id(),
                    pose_id: data.pose_id(),
                    color_palette_id: data.color_palette_id(),
                    custom_id: data.custom_id(),
                }
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TensorDataRow {
    pub raw: RawTensorDataRow,
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub idx: i64,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub scale_factor_by_120: i32,
    pub tensor_id: i64,
    pub mask_id: i64,
    pub depth_map_id: i64,
    pub scribble_id: i64,
    pub pose_id: i64,
    pub color_palette_id: i64,
    pub custom_id: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RawTensorDataRow {
    pub rowid: i64,
    pub __pk0: i64,
    pub __pk1: i64,
    pub __pk2: i64,
    pub p: Vec<u8>,
}

#[tauri::command]
pub async fn dt_project_tensordata(project_path: String) -> Result<Vec<TensorDataRow>, String> {
    let dt_project = DTProject::get(&project_path).await.map_err(|e| e.to_string())?;
    let raw = DTProjectRaw::new(&dt_project);
    Ok(raw.tensor_data(None, None).await)
}