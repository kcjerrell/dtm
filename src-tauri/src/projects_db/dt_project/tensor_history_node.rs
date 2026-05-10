use itertools::Itertools;
use serde::Serialize;
use sqlx::{query, query_as, sqlite::SqliteRow, FromRow, Row};
use std::{collections::HashMap, path::PathBuf, sync::Arc};

use crate::projects_db::{
    dt_project::{
        data::tensor_history_node_data::TensorHistoryNodeData as ParsedTensorHistoryNodeData,
        raw::{RawTensorDataRow, TensorDataRow},
        tensor_data::TensorData,
        Clip, ClipFilter, TdFilter, TensorMoodboardData, TmdFilter,
    },
    fbs::{
        root_as_tensor_history_node, root_as_tensor_history_node_unchecked,
        root_as_tensor_moodboard_data, TensorHistoryNode as TensorHistoryNodeData,
    },
    DTProject,
};

#[derive(Debug, Clone, Copy)]
pub enum ThnFilter {
    None,
    Rowid(i64),
    Lineage(i64),
    LogicalTime(i64),
    LineageAndLogicalTime(i64, i64),
    FirstAndTake(i64, i64),
}

#[derive(Default, Debug, Clone, Copy)]
pub struct ThnData {
    pub tensordata: bool,
    pub clip: bool,
    pub moodboard: bool,
}

impl ThnData {
    pub fn tensordata() -> Self {
        Self {
            tensordata: true,
            ..Default::default()
        }
    }

    pub fn clip() -> Self {
        Self {
            clip: true,
            ..Default::default()
        }
    }

    pub fn moodboard() -> Self {
        Self {
            moodboard: true,
            ..Default::default()
        }
    }

    pub fn and_tensordata(&self) -> Self {
        Self {
            tensordata: true,
            ..*self
        }
    }

    pub fn and_clip(&self) -> Self {
        Self {
            clip: true,
            ..*self
        }
    }

    pub fn and_moodboard(&self) -> Self {
        Self {
            moodboard: true,
            ..*self
        }
    }
}

/// The definitive representation of the tensorhistorynode table entity
#[derive(Serialize, Debug)]
pub struct TensorHistoryNode {
    pub rowid: i64,
    pub project_path: PathBuf,
    pub lineage: i64,
    pub logical_time: i64,
    #[serde(serialize_with = "serialize_thn_data")]
    data: Arc<[u8]>,
    pub tensordata: Option<Vec<TensorData>>,
    pub clip: Option<Clip>,
    pub moodboard: Option<Vec<TensorMoodboardData>>,
}

impl TensorHistoryNode {
    pub fn data(&self) -> TensorHistoryNodeData {
        unsafe { root_as_tensor_history_node_unchecked(&self.data) }
    }
}

fn serialize_thn_data<S>(data: &Arc<[u8]>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    use serde::ser::Error;
    match ParsedTensorHistoryNodeData::try_from(data.as_ref()) {
        Ok(parsed) => parsed.serialize(serializer),
        Err(e) => Err(S::Error::custom(e)),
    }
}

#[derive(Serialize, Debug, Default)]
pub struct ThnRow {
    pub rowid: i64,
    pub lineage: i64,
    pub logical_time: i64,
    pub data: Arc<[u8]>,
}

impl<'r> FromRow<'r, SqliteRow> for ThnRow {
    fn from_row(row: &SqliteRow) -> Result<Self, sqlx::Error> {
        let rowid: i64 = row.get("rowid");
        let lineage: i64 = row.get("__pk0");
        let logical_time: i64 = row.get("__pk1");
        let data: Vec<u8> = row.get("p");
        let data: Arc<[u8]> = data.into();

        Ok(ThnRow {
            rowid,
            lineage,
            logical_time,
            data,
        })
    }
}

impl DTProject {
    pub async fn get_tensor_history_nodes(
        &self,
        filter: Option<ThnFilter>,
        data: Option<ThnData>,
    ) -> Result<Vec<TensorHistoryNode>, sqlx::Error> {
        let (get_tensordata, get_moodboard, get_clip) = data.map_or((false, false, false), |d| {
            (d.tensordata, d.moodboard, d.clip)
        });

        let query = build_query(filter);
        let rows: Vec<ThnRow> = query_as(&query).fetch_all(&*self.pool).await?;

        let mut clip_ids: Vec<i64> = Vec::with_capacity(if data.map_or(false, |d| d.clip) {
            rows.len()
        } else {
            0
        });

        let mut items: Vec<TensorHistoryNode> = rows
            .into_iter()
            .map(|row| {
                // this validates the flatbuffer so that .data() can provide fast unchecked access
                let fb = root_as_tensor_history_node(&row.data).unwrap();
                if get_clip && fb.clip_id() > 0 {
                    clip_ids.push(fb.clip_id())
                }
                TensorHistoryNode {
                    rowid: row.rowid,
                    project_path: PathBuf::from(&self.path),
                    lineage: row.lineage,
                    logical_time: row.logical_time,
                    data: checked_flatbuffer(&row.data).unwrap(),
                    tensordata: None,
                    clip: None,
                    moodboard: None,
                }
            })
            .collect();

        if get_tensordata {
            let lineage_times = items
                .iter()
                .map(|item| (item.lineage, item.logical_time))
                .collect();
            let td = self
                .get_tensor_data(TdFilter::LineageTimes(lineage_times))
                .await?;

            let mut td_map = td
                .into_iter()
                .into_group_map_by(|t| (t.lineage, t.logical_time));

            for item in items.iter_mut() {
                let key = (item.lineage, item.logical_time);
                item.tensordata = Some(td_map.remove(&key).unwrap_or_default());
            }
        }

        if get_moodboard {
            let lineage_times = items
                .iter()
                .map(|item| (item.lineage, item.logical_time))
                .collect();
            let moodboard = self
                .get_tensor_moodboard_data(TmdFilter::LineageTimes(lineage_times))
                .await?;

            let mut m_map = moodboard
                .into_iter()
                .into_group_map_by(|m| (m.lineage, m.logical_time));

            for item in items.iter_mut() {
                let key = (item.lineage, item.logical_time);
                item.moodboard = Some(m_map.remove(&key).unwrap_or_default());
            }
        }

        if get_clip && !clip_ids.is_empty() {
            let clips = self.get_clips(ClipFilter::ClipIds(clip_ids)).await?;
            let clip_map: HashMap<i64, Clip> =
                clips.into_iter().map(|c| (c.clip_id, c)).collect();

            for item in items.iter_mut() {
                let fb = item.data();
                let clip_id = fb.clip_id();
                if clip_id > 0 {
                    item.clip = clip_map.get(&clip_id).cloned();
                }
            }
        }

        Ok(items)
    }

    pub async fn list_tensor_history_nodes(
        &self,
        skip: i64,
        take: i64,
    ) -> Result<Vec<ThnRow>, sqlx::Error> {
        let rows: Vec<ThnRow> =
            query_as("SELECT * FROM tensorhistorynode ORDER BY rowid ASC LIMIT ?1 OFFSET ?2")
                .bind(take)
                .bind(skip)
                .fetch_all(&*self.pool)
                .await?;

        Ok(rows)
    }

    /**
     * Do not call on a cached dt_project! Only used with DTProject::open()
     */
    pub async fn check_id(&self, pdb_path: String, project_id: i64) -> Result<Vec<i64>, String> {
        if self.is_shared {
            return Err("Cannot check ids on a shared dt_project".to_string());
        }

        let missing_ids: Vec<i64> = sqlx::query_scalar(
            r#"
                ATTACH DATABASE ? AS pdb;

                SELECT pdb.images.id
                FROM pdb.images
                LEFT JOIN main.tensorhistorynode node ON pdb.images.node_id = node.rowid
                WHERE pdb.images.project_id = ?
                AND node.rowid IS NULL;
            "#,
        )
        .bind(pdb_path)
        .bind(project_id)
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(missing_ids)
    }
}

fn checked_flatbuffer(data: &Arc<[u8]>) -> Option<Arc<[u8]>> {
    if root_as_tensor_history_node(&data).is_ok() {
        Some(data.clone())
    } else {
        None
    }
}

fn build_query(filter: Option<ThnFilter>) -> String {
    let select = "SELECT * FROM tensorhistorynode thn";

    let mut limit_str = "".to_string();

    let filter_str: String = if let Some(filter) = filter {
        match filter {
            ThnFilter::None => "".to_string(),
            ThnFilter::Rowid(rowid) => format!("WHERE thn.rowid = {}", rowid),
            ThnFilter::Lineage(lineage) => format!("WHERE thn.__pk0 = {}", lineage),
            ThnFilter::LogicalTime(logical_time) => format!("WHERE thn.__pk1 = {}", logical_time),
            ThnFilter::LineageAndLogicalTime(lineage, logical_time) => format!(
                "WHERE thn.__pk0 = {} AND thn.__pk1 = {}",
                lineage, logical_time
            ),
            ThnFilter::FirstAndTake(first, take) => {
                limit_str = format!("LIMIT {}", take);
                format!("WHERE thn.rowid >= {}", first)
            }
        }
    } else {
        "".to_string()
    };

    let query = format!(
        "{} {} ORDER BY thn.rowid ASC {}",
        select, filter_str, limit_str
    );
    println!("{query}");
    query
}

fn build_queryx(filter: Option<ThnFilter>, data: Option<ThnData>) -> String {
    // with all options, query looks something like
    // let q = "SELECT
    //            thn.rowid as thn_rowid, thn.__pk0 as thn__pk0, thn.__pk1 as thn__pk1, thn.p as thn_p,
    //            td.rowid as td_rowid, td.__pk2 as td__pk2, td.p as td_p,
    //            tmd.rowid as tmd_rowid, tmd.__pk2 as tmd__pk2, tmd.p as tmd_p,
    //          FROM tensorhistorynode thn
    //          LEFT JOIN tensordata td ON thn.__pk0 = td.__pk0 AND thn.__pk1 = td.__pk1
    //          LEFT JOIN tensor_moodboard_data tmd ON thn.__pk0 = tmd.__pk0 AND thn.__pk1 = tmd.__pk1
    //          WHERE
    //            thn.rowid = ?1
    //            AND thn.__pk0 = ?2 AND thn.__pk1 = ?3
    //          ORDER BY thn.rowid ASC
    //          LIMIT ?4 OFFSET ?5";

    let mut select: Vec<&str> = Vec::new();
    select.push(SELECT_THN);

    let mut join: Vec<&str> = Vec::new();

    if let Some(data) = data {
        if data.moodboard {
            select.push(SELECT_TMD);
            join.push(JOIN_TMD);
        }
        if data.tensordata {
            select.push(SELECT_TD);
            join.push(JOIN_TD);
        }
    }

    // conveniently all binds are i64, which means I can just stick em in the query and not bind
    // let mut filter_str = "";

    let select_str = format!("SELECT {}", select.join(", "));
    let from_str = format!("FROM tensorhistorynode thn {}", join.join(" "));
    let mut limit_str = "".to_string();

    let filter_str: String = if let Some(filter) = filter {
        match filter {
            ThnFilter::None => "".to_string(),
            ThnFilter::Rowid(rowid) => format!("WHERE thn.rowid = {}", rowid),
            ThnFilter::Lineage(lineage) => format!("WHERE thn.__pk0 = {}", lineage),
            ThnFilter::LogicalTime(logical_time) => format!("WHERE thn.__pk1 = {}", logical_time),
            ThnFilter::LineageAndLogicalTime(lineage, logical_time) => format!(
                "WHERE thn.__pk0 = {} AND thn.__pk1 = {}",
                lineage, logical_time
            ),
            ThnFilter::FirstAndTake(first, take) => {
                limit_str = format!("LIMIT {}", take);
                format!("WHERE thn.rowid >= {}", first)
            }
        }
    } else {
        "".to_string()
    };

    let query = format!(
        "{} {} {} ORDER BY thn.rowid ASC {}",
        select_str, from_str, filter_str, limit_str
    );
    println!("{}", query);
    query
}

const SELECT_THN: &str =
    "thn.rowid as thn_rowid, thn.__pk0 as thn__pk0, thn.__pk1 as thn__pk1, thn.p as thn_p";
const SELECT_TD: &str = "td.rowid as td_rowid, td.__pk2 as td__pk2, td.p as td_p";
const SELECT_TMD: &str = "tmd.rowid as tmd_rowid, tmd.__pk2 as tmd__pk2, tmd.p as tmd_p";

const JOIN_TD: &str = "LEFT JOIN tensordata td ON thn.__pk0 = td.__pk0 AND thn.__pk1 = td.__pk1";
const JOIN_TMD: &str =
    "LEFT JOIN tensor_moodboard_data tmd ON thn.__pk0 = tmd.__pk0 AND thn.__pk1 = tmd.__pk1";

/*
    Rowid(i64),
    Lineage(i64),
    LogicalTime(i64),
    LineageAndLogicalTime(i64, i64),
    SkipTake(i64, i64),
*/
