use serde::Serialize;
use sqlx::{query, AssertSqlSafe, QueryBuilder, Row, Sqlite};

use crate::projects_db::fbs::root_as_tensor_data;
use crate::projects_db::TensorHistoryTensorData;

use super::data::tensor_data::TensorData;
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

    pub fn build_where_clause(&self) -> String {
        let mut conditions = Vec::new();
        if let Some(v) = self.lineage {
            conditions.push(format!("__pk0 = {}", v));
        }
        if let Some(v) = self.logical_time {
            conditions.push(format!("__pk1 = {}", v));
        }
        if let Some(v) = self.idx {
            conditions.push(format!("__pk2 = {}", v));
        }
        if let Some(v) = self.first {
            conditions.push(format!("rowid >= {}", v));
        }
        if let Some(v) = self.last {
            conditions.push(format!("rowid <= {}", v));
        }

        if conditions.is_empty() {
            "".to_string()
        } else {
            format!("where {}", conditions.join(" and "))
        }
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
    ) -> Result<Vec<TensorData>, String> {
        // as long as the only variables are numbers, this is fine.
        let where_clause = query_params.build_where_clause();
        let text = format!("select * from tensordata {}", where_clause);

        let q = query(AssertSqlSafe(text));

        let rows = q.fetch_all(&*self.dt_project.pool).await.unwrap();

        rows.into_iter()
            .map(|row| {
                let p: Vec<u8> = row.get("p");
                let data = root_as_tensor_data(&p).map_err(|e| e.to_string())?;
                Ok(TensorData {
                    rowid: row.get("rowid"),
                    lineage: row.get("__pk0"),
                    logical_time: row.get("__pk1"),
                    index: row.get("__pk2"),
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


#[tauri::command]
pub async fn dt_project_tensordata(
    project_path: String,
    lineage: Option<i64>,
    logical_time: Option<i64>,
    idx: Option<i64>,
    first: Option<i64>,
    last: Option<i64>,
) -> Result<Vec<TensorData>, String> {
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

impl From<TensorHistoryTensorData> for TensorData {
    fn from(value: TensorHistoryTensorData) -> Self {
        let data = root_as_tensor_data(&value.tensor_data).unwrap();
        Self {
            rowid: value.node_id,
            lineage: value.lineage,
            logical_time: value.logical_time,
            index: value.td_index,
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
