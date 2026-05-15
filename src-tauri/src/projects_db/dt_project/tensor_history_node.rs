use itertools::Itertools;
use serde::{ser::SerializeStruct, Serialize};
use sqlx::{query, query_as, sqlite::SqliteRow, FromRow, Row};
use std::{collections::HashMap, path::PathBuf, sync::Arc};

use crate::projects_db::{
    dt_project::{
        data::tensor_history_node_data::TensorHistoryNodeData as ParsedTensorHistoryNodeData,
        raw::{RawTensorDataRow, TensorDataRow},
        tensor_data::TensorData,
        Clip, ClipFilter, DTProjectTable, TdFilter, TensorMoodboardData, TmdFilter,
    },
    fbs::{
        root_as_tensor_history_node, root_as_tensor_history_node_unchecked,
        root_as_tensor_moodboard_data, TensorHistoryNode as TensorHistoryNodeData,
    },
    text_history::{PromptPair, TextHistory},
    DTProject,
};

#[derive(Debug, Clone, Copy)]
/// specifies the TensorHistoryNode's to be returned
pub enum ThnFilter {
    None,
    Rowid(i64),
    Lineage(i64),
    LogicalTime(i64),
    LineageAndLogicalTime(i64, i64),
    SkipAndTake(i64, i64),
    Range(i64, i64),
}

#[derive(Default, Debug, Clone, Copy)]
/// represents TensorHistoryNode relations that can be included when requested
pub struct ThnData {
    /// include tensordata with same lineage and logical_time as returned nodes
    pub tensordata: bool,
    /// include clip data for each node (if any)
    pub clip: bool,
    /// include current moodboard for each node (if any)
    pub moodboard: bool,
    /// for older projects, ensure text prompts are properly loaded for each node
    pub legacy_prompts: bool,
}

impl ThnData {
    /// include tensordata with same lineage and logical_time as returned nodes
    pub fn tensordata() -> Self {
        Self {
            tensordata: true,
            ..Default::default()
        }
    }
    /// include clip data for each node (if any)
    pub fn clip() -> Self {
        Self {
            clip: true,
            ..Default::default()
        }
    }
    /// include current moodboard for each node (if any)
    pub fn moodboard() -> Self {
        Self {
            moodboard: true,
            ..Default::default()
        }
    }
    /// for older projects, ensure text prompts are properly loaded for each node
    pub fn legacy_prompts() -> Self {
        Self {
            legacy_prompts: true,
            ..Default::default()
        }
    }

    /// include tensordata with same lineage and logical_time as returned nodes
    pub fn and_tensordata(&self) -> Self {
        Self {
            tensordata: true,
            ..*self
        }
    }
    /// include clip data for each node (if any)
    pub fn and_clip(&self) -> Self {
        Self {
            clip: true,
            ..*self
        }
    }
    /// include current moodboard for each node (if any)
    pub fn and_moodboard(&self) -> Self {
        Self {
            moodboard: true,
            ..*self
        }
    }
    /// for older projects, ensure text prompts are properly loaded for each node
    pub fn and_legacy_prompts(&self) -> Self {
        Self {
            legacy_prompts: true,
            ..*self
        }
    }
}

/// The definitive representation of the tensorhistorynode table entity
#[derive(Debug)]
pub struct TensorHistoryNode {
    pub rowid: i64,
    pub project_path: PathBuf,
    pub lineage: i64,
    pub logical_time: i64,
    data: Arc<[u8]>,
    pub tensordata: Option<Vec<TensorData>>,
    pub clip: Option<Clip>,
    pub moodboard: Option<Vec<TensorMoodboardData>>,
    /// will be set if legacy_prompts is true
    prompt: Option<String>,
    /// will be set if legacy prompts is true
    negative_prompt: Option<String>,
}

impl Serialize for TensorHistoryNode {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut state = serializer.serialize_struct("TensorHistoryNode", 10)?;
        state.serialize_field("rowid", &self.rowid)?;
        state.serialize_field("project_path", &self.project_path)?;
        state.serialize_field("lineage", &self.lineage)?;
        state.serialize_field("logical_time", &self.logical_time)?;

        // Serialize data by parsing it into ParsedTensorHistoryNodeData
        let parsed_data = self.node_data();
        state.serialize_field("data", &parsed_data)?;

        state.serialize_field("tensordata", &self.tensordata)?;
        state.serialize_field("clip", &self.clip)?;
        state.serialize_field("moodboard", &self.moodboard)?;

        // Include resolved prompts
        state.serialize_field("prompt", &self.prompt())?;
        state.serialize_field("negative_prompt", &self.negative_prompt())?;

        state.end()
    }
}

impl TensorHistoryNode {
    /// Returns the raw FlatBuffer accessor. Prefer this for cheap field reads.
    pub fn data(&self) -> TensorHistoryNodeData {
        unsafe { root_as_tensor_history_node_unchecked(&self.data) }
    }

    /// Returns the fully decoded flatbuffer
    pub fn node_data(&self) -> ParsedTensorHistoryNodeData {
        ParsedTensorHistoryNodeData::try_from(self.data.as_ref())
            .expect("flatbuffer already validated at construction")
    }

    /// Returns the positive prompt, preferring the legacy-resolved value over
    /// the flatbuffer field. Returns None only if both are absent/empty.
    pub fn prompt(&self) -> Option<&str> {
        if let Some(p) = &self.prompt {
            return Some(p.as_str());
        }
        self.data().text_prompt().filter(|s| !s.is_empty())
    }

    /// Returns the negative prompt, preferring the legacy-resolved value over
    /// the flatbuffer field. Returns None only if both are absent/empty.
    pub fn negative_prompt(&self) -> Option<&str> {
        if let Some(p) = &self.negative_prompt {
            return Some(p.as_str());
        }
        self.data().negative_text_prompt().filter(|s| !s.is_empty())
    }
}

fn create_nodes(
    rows: Vec<ThnRow>,
    tensordata: Option<Vec<TensorData>>,
    moodboard: Option<Vec<TensorMoodboardData>>,
    clips: Option<Vec<Clip>>,
    prompts: Option<HashMap<i64, PromptPair>>,
    project_path: PathBuf,
) -> Vec<TensorHistoryNode> {
    let mut items: Vec<TensorHistoryNode> = rows
        .into_iter()
        .map(|row| TensorHistoryNode {
            rowid: row.rowid,
            project_path: project_path.clone(),
            lineage: row.lineage,
            logical_time: row.logical_time,
            data: row.data,
            tensordata: None,
            clip: None,
            moodboard: None,
            prompt: None,
            negative_prompt: None,
        })
        .collect();

    if let Some(td) = tensordata {
        let mut td_map = td
            .into_iter()
            .into_group_map_by(|t| (t.lineage, t.logical_time));

        for item in items.iter_mut() {
            let key = (item.lineage, item.logical_time);
            item.tensordata = Some(td_map.remove(&key).unwrap_or_default());
        }
    }

    if let Some(mb) = moodboard {
        let mut m_map = mb
            .into_iter()
            .into_group_map_by(|m| (m.lineage, m.logical_time));

        for item in items.iter_mut() {
            let key = (item.lineage, item.logical_time);
            item.moodboard = Some(m_map.remove(&key).unwrap_or_default());
        }
    }

    if let Some(cl) = clips {
        let clip_map: HashMap<i64, Clip> = cl.into_iter().map(|c| (c.clip_id, c)).collect();

        for item in items.iter_mut() {
            let fb = item.data();
            let clip_id = fb.clip_id();
            if clip_id > 0 {
                item.clip = clip_map.get(&clip_id).cloned();
            }
        }
    }

    if let Some(mut p_map) = prompts {
        for item in items.iter_mut() {
            if let Some(pp) = p_map.remove(&item.rowid) {
                if !pp.positive.is_empty() {
                    item.prompt = Some(pp.positive);
                }
                if !pp.negative.is_empty() {
                    item.negative_prompt = Some(pp.negative);
                }
            }
        }
    }

    items
}

#[derive(Serialize, Debug, Default)]
pub struct ThnRow {
    /// tensorhistorynode.rowid
    pub rowid: i64,
    /// tensorhistorynode.__pk0
    pub lineage: i64,
    /// tensorhistorynode.__pk1
    pub logical_time: i64,
    /// tensorhistorynode.p
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
    /// the preferred way to get tensorhistorynodes from a DTProject
    pub async fn get_tensor_history_nodes(
        &self,
        filter: Option<ThnFilter>,
        data: Option<ThnData>,
    ) -> Result<Vec<TensorHistoryNode>, sqlx::Error> {
        self.check_table(&DTProjectTable::TensorHistoryNode).await?;

        let (get_tensordata, get_moodboard, get_clip, get_legacy_prompts) = data
            .map_or((false, false, false, false), |d| {
                (d.tensordata, d.moodboard, d.clip, d.legacy_prompts)
            });

        let query = build_query(filter);
        let rows: Vec<ThnRow> = query_as(&query).fetch_all(&*self.pool).await?;

        if rows.is_empty() {
            return Ok(Vec::new());
        }

        let mut lineage_times = Vec::new();
        let mut clip_ids = Vec::new();
        let mut prompt_lookup_rows: HashMap<i64, (i64, i64)> = HashMap::new();

        for row in &rows {
            // must validate flatbuffer so unchecked access with .data() is safe
            let fb = root_as_tensor_history_node(&row.data).unwrap();
            if get_tensordata || get_moodboard {
                lineage_times.push((row.lineage, row.logical_time));
            }
            if get_clip && fb.clip_id() > 0 {
                clip_ids.push(fb.clip_id());
            }
            if get_legacy_prompts
                && fb.text_prompt().map_or(true, |s| s.is_empty())
                && fb.negative_text_prompt().map_or(true, |s| s.is_empty())
            {
                prompt_lookup_rows.insert(row.rowid, (fb.text_lineage(), fb.text_edits()));
            }
        }

        let tensordata = if get_tensordata {
            Some(
                self.get_tensor_data(TdFilter::LineageTimes(lineage_times.clone()))
                    .await
                    .unwrap_or_default(),
            )
        } else {
            None
        };

        let moodboard = if get_moodboard {
            Some(
                self.get_tensor_moodboard_data(TmdFilter::LineageTimes(lineage_times))
                    .await
                    .unwrap_or_default(),
            )
        } else {
            None
        };

        let clips = if get_clip && !clip_ids.is_empty() {
            Some(
                self.get_clips(ClipFilter::ClipIds(clip_ids))
                    .await
                    .unwrap_or_default(),
            )
        } else {
            None
        };

        let mut prompts = None;
        if get_legacy_prompts
            && !prompt_lookup_rows.is_empty()
            && self.check_table(&DTProjectTable::TextHistory).await.ok() == Some(true)
        {
            let mut p_map = HashMap::new();
            for (row_id, (text_lineage, text_edits)) in prompt_lookup_rows {
                if let Some(pp) = self.get_text_edit(text_lineage, text_edits).await.ok() {
                    p_map.insert(row_id, pp);
                }
            }
            prompts = Some(p_map);
        }

        Ok(create_nodes(
            rows,
            tensordata,
            moodboard,
            clips,
            prompts,
            PathBuf::from(&self.path),
        ))
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

const SELECT_THN: &str =
    "thn.rowid as thn_rowid, thn.__pk0 as thn__pk0, thn.__pk1 as thn__pk1, thn.p as thn_p";
const SELECT_TD: &str = "td.rowid as td_rowid, td.__pk2 as td__pk2, td.p as td_p";
const SELECT_TMD: &str = "tmd.rowid as tmd_rowid, tmd.__pk2 as tmd__pk2, tmd.p as tmd_p";

const JOIN_TD: &str = "LEFT JOIN tensordata td ON thn.__pk0 = td.__pk0 AND thn.__pk1 = td.__pk1";
const JOIN_TMD: &str =
    "LEFT JOIN tensor_moodboard_data tmd ON thn.__pk0 = tmd.__pk0 AND thn.__pk1 = tmd.__pk1";

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
            ThnFilter::SkipAndTake(skip, take) => {
                limit_str = format!("LIMIT {} OFFSET {}", take, skip);
                "".to_string()
            }
            ThnFilter::Range(min, max) => {
                format!("WHERE thn.rowid >= {} AND thn.rowid < {}", min, max)
            }
        }
    } else {
        "".to_string()
    };

    let query = format!(
        "{} {} ORDER BY thn.rowid ASC {}",
        select, filter_str, limit_str
    );
    query
}
