use serde::Serialize;
use sqlx::{QueryBuilder, Row, Sqlite};

use crate::projects_db::fbs::{root_as_tensor_data, TensorData};
use crate::projects_db::TensorHistoryTensorData;

use super::DTProject;

pub struct TensorDataQuery {
    lineage: Option<i64>,
    logical_time: Option<i64>,
    idx: Option<i64>,
    first: Option<i64>,
    last: Option<i64>,
}

impl TensorDataQuery {
    pub fn new() -> Self {
        Self {
            lineage: None,
            logical_time: None,
            idx: None,
            first: None,
            last: None,
        }
    }

    pub fn lineage(&mut self, lineage: i64) -> &mut Self {
        self.lineage = Some(lineage);
        self
    }

    pub fn logical_time(&mut self, logical_time: i64) -> &mut Self {
        self.logical_time = Some(logical_time);
        self
    }

    pub fn idx(&mut self, idx: i64) -> &mut Self {
        self.idx = Some(idx);
        self
    }

    pub fn first(&mut self, first: i64) -> &mut Self {
        self.first = Some(first);
        self
    }

    pub fn last(&mut self, last: i64) -> &mut Self {
        self.last = Some(last);
        self
    }

    fn has_conditions(&self) -> bool {
        self.lineage.is_some()
            || self.logical_time.is_some()
            || self.idx.is_some()
            || self.first.is_some()
            || self.last.is_some()
    }
}

pub struct DTProjectRaw<'a> {
    dt_project: &'a DTProject,
}

impl<'a> DTProjectRaw<'a> {
    pub fn new(dt_project: &'a DTProject) -> Self {
        Self { dt_project }
    }

    pub async fn tensor_data(
        &self,
        query_params: TensorDataQuery,
    ) -> Result<Vec<TensorDataRow>, String> {
        let mut query = QueryBuilder::<Sqlite>::new("select * from tensordata");

        if query_params.has_conditions() {
            query.push(" where ");
            let mut conditions = query.separated(" and ");
            if let Some(lineage) = query_params.lineage {
                conditions.push("__pk0 = ").push_bind(lineage);
            }
            if let Some(logical_time) = query_params.logical_time {
                conditions.push("__pk1 = ").push_bind(logical_time);
            }
            if let Some(idx) = query_params.idx {
                conditions.push("__pk2 = ").push_bind(idx);
            }
            if let Some(first) = query_params.first {
                conditions.push("rowid >= ").push_bind(first);
            }
            if let Some(last) = query_params.last {
                conditions.push("rowid <= ").push_bind(last);
            }
        }

        let rows = query
            .build()
            .fetch_all(&*self.dt_project.pool)
            .await
            .map_err(|e| e.to_string())?;

        rows.into_iter()
            .map(|row| {
                let raw = RawTensorDataRow {
                    rowid: row.get("rowid"),
                    __pk0: row.get("__pk0"),
                    __pk1: row.get("__pk1"),
                    __pk2: row.get("__pk2"),
                    p: row.get("p"),
                };
                let data = root_as_tensor_data(&raw.p).map_err(|e| e.to_string())?;
                Ok(TensorDataRow {
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
                })
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TensorDataRow {
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
pub async fn dt_project_tensordata(
    project_path: String,
    lineage: Option<i64>,
    logical_time: Option<i64>,
    idx: Option<i64>,
    first: Option<i64>,
    last: Option<i64>,
) -> Result<Vec<TensorDataRow>, String> {
    let dt_project = DTProject::get(&project_path)
        .await
        .map_err(|e| e.to_string())?;
    let raw = DTProjectRaw::new(&dt_project);

    let mut query = TensorDataQuery::new();
    if let Some(l) = lineage {
        query.lineage(l);
    }
    if let Some(t) = logical_time {
        query.logical_time(t);
    }
    if let Some(i) = idx {
        query.idx(i);
    }
    if let Some(f) = first {
        query.first(f);
    }
    if let Some(l) = last {
        query.last(l);
    }

    raw.tensor_data(query).await
}

impl From<TensorHistoryTensorData> for TensorDataRow {
    fn from(value: TensorHistoryTensorData) -> Self {
        let data = root_as_tensor_data(&value.tensor_data).unwrap();
        Self {
            rowid: value.node_id,
            lineage: value.lineage,
            logical_time: value.logical_time,
            idx: value.td_index,
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
    }
}
