use itertools::Itertools;
use serde::{ser::SerializeStruct, Serialize};
use sqlx::{query_as, AssertSqlSafe, FromRow};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Arc,
};

use crate::dt_project::{
    data::TensorHistoryNodeData as ParsedTensorHistoryNodeData,
    fbs::{
        root_as_tensor_history_node, root_as_tensor_history_node_unchecked,
        TensorHistoryNode as TensorHistoryNodeData,
    },
    Clip, ClipFilter, DTProject, DTProjectTable, ParentExt, TdFilter, TensorData,
    TensorMoodboardData, TmdFilter,
};

#[derive(Debug, Clone)]
pub enum ThnFilter {
    /// return all history nodes
    None,
    /// return history node with rowid
    Rowid(i64),
    /// return all history nodes with lineage
    Lineage(i64),
    /// return all history nodes with logical time
    LogicalTime(i64),
    /// return history node with lineage and logical time
    LineageAndLogicalTime(i64, i64),
    /// return a slice of all of history nodes (ordered by row id)
    SkipAndTake(i64, i64),
    /// return all history nodes with rowid in range
    Range(i64, i64),
    /// Returns nodes that may be the input image to the node with the given rowid, lineage, and logical time
    Predecessor(i64, i64, i64),
    /// Return nodes with the given rowids
    Rowids(Vec<i64>),
    /// Return node with the given preview_id (from tensorhistorynode__f86 table)
    PreviewId(i64),
}

#[derive(Default, Debug, Clone, Copy)]
pub struct ThnData {
    pub tensordata: bool,
    pub clip: bool,
    pub moodboard: bool,
    /// When true, get_tensor_history_nodes will check the texthistorynode table
    /// for prompts if the flatbuffer's text_prompt field is empty. Requires
    /// the project's text_history OnceCell to be initialised (done automatically).
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
#[derive(Debug, Clone)]
pub struct TensorHistoryNode {
    /// rowid column
    pub rowid: i64,
    /// __pk0 column (lineage)
    pub lineage: i64,
    /// __pk1 column (logical_time)
    pub logical_time: i64,
    /// p column (contains the fbs blob)
    data: Arc<[u8]>,

    /// project this node belongs to
    pub project_path: PathBuf,

    /// tensordata joined by lineage and logical_time
    pub tensordata: Option<Arc<[TensorData]>>,
    /// clip joined by indexed fbs field
    pub clip: Option<Clip>,
    /// trnsormoodboarddata joined by lineage and logical_time
    pub moodboard: Option<Arc<[TensorMoodboardData]>>,

    /// Resolved positive prompt. None means fall back to the flatbuffer field.
    /// Populated by get_tensor_history_nodes when ThnData::legacy_prompts is set.
    prompt: Option<String>,
    /// Resolved negative prompt. None means fall back to the flatbuffer field.
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
    /// This method is safe - the flatbuffer was validated at construction
    /// and can be accessed unchecked
    pub fn data(&self) -> TensorHistoryNodeData<'_> {
        unsafe { root_as_tensor_history_node_unchecked(&self.data) }
    }

    /// Returns the fully parsed Rust struct. Used for serialization and when the caller needs
    /// ownership (e.g. DrawThingsMetadata, DecodeTensorOptions).
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

    /// I believe this is mostly for older versions  with f
    pub fn data_tensor_ids(&self) -> Vec<i64> {
        let mut ids = HashSet::with_capacity(6);
        let data = self.data();
        ids.insert(data.mask_id());
        ids.insert(data.pose_id());
        ids.insert(data.custom_id());
        ids.insert(data.tensor_id());
        ids.insert(data.scribble_id());
        ids.insert(data.depth_map_id());
        ids.insert(data.color_palette_id());

        if let Some(tensordata) = &self.tensordata {
            ids.extend(tensordata.iter().flat_map(|td| td.get_tensor_ids()));
        }

        ids.iter().filter(|id| id > &(&0)).copied().collect()
    }
}

#[derive(Serialize, Debug, Default, FromRow)]
struct ThnRow {
    pub rowid: i64,
    #[sqlx(rename = "__pk0")]
    pub lineage: i64,
    #[sqlx(rename = "__pk1")]
    pub logical_time: i64,
    #[sqlx(rename = "p")]
    pub data: Arc<[u8]>,
}

pub struct NodesBatcher<'a> {
    batch_index: i64,
    batch_size: i64,
    project: &'a DTProject,
    data: ThnData,
}

impl<'a> NodesBatcher<'a> {
    fn new(project: &'a DTProject, data: ThnData) -> Self {
        Self {
            batch_index: 0,
            batch_size: 100,
            project,
            data,
        }
    }
    pub async fn next(&mut self) -> anyhow::Result<Option<Vec<TensorHistoryNode>>> {
        let filter = ThnFilter::SkipAndTake(self.batch_index * self.batch_size, self.batch_size);
        let nodes = self
            .project
            .get_tensor_history_nodes(Some(filter), Some(self.data))
            .await?;
        self.batch_index += 1;

        if !nodes.is_empty() {
            Ok(Some(nodes))
        } else {
            Ok(None)
        }
    }
}

impl DTProject {
    /// Queries the DTProject for TensorHistoryNodes
    /// # Arguments
    /// * `filter`: The filter to use for the query. See `ThnFilter` for more information.
    /// * `data`: Optional data to be included with the query. In general, each requested type
    ///   will result in an additional query to the database
    pub async fn get_tensor_history_nodes(
        &self,
        filter: Option<ThnFilter>,
        data: Option<ThnData>,
    ) -> Result<Vec<TensorHistoryNode>, sqlx::Error> {
        self.check_table(&DTProjectTable::TensorHistoryNode).await?;

        if let Some(ThnFilter::PreviewId(_)) = filter {
            self.check_table(&DTProjectTable::ThumbnailHistoryNode).await?;
        }

        // set flags for the requested data
        let (get_tensordata, get_moodboard, get_clip, get_legacy_prompts) = data
            .map_or((false, false, false, false), |d| {
                (d.tensordata, d.moodboard, d.clip, d.legacy_prompts)
            });

        // build and run the thn query
        let query = build_query(&filter);
        let mut rows: Vec<ThnRow> = query_as(query).fetch_all(&*self.pool).await?;

        if let Some(ThnFilter::Predecessor(_, lineage, _)) = filter {
            if rows.iter().any(|r| r.lineage == lineage) {
                rows.retain(|r| r.lineage == lineage);
            }
        }

        // make a list to hold clip ids (if needed)
        let mut clip_ids: Vec<i64> = Vec::with_capacity(if data.is_some_and(|d| d.clip) {
            rows.len()
        } else {
            0
        });

        // create TensorHistoryNodes from rows (I think this could be moved into FromRow)
        let mut items: Vec<TensorHistoryNode> = rows
            .into_iter()
            .map(|row| {
                // this validates the flatbuffer so that .data() can provide fast unchecked access
                let fb = root_as_tensor_history_node(&row.data).unwrap();
                if get_clip && fb.clip_id() > 0 {
                    // update list of clip_ids
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
                    prompt: None,
                    negative_prompt: None,
                }
            })
            .collect();

        if get_tensordata {
            // gather tensor_data using lineage and logical_time
            let lineage_times = items
                .iter()
                .map(|item| (item.lineage, item.logical_time))
                .collect();
            let td = self
                .get_tensor_data(TdFilter::LineageTimes(lineage_times))
                .await
                .unwrap_or_default();

            let mut td_map = td
                .into_iter()
                .into_group_map_by(|t| (t.lineage, t.logical_time));

            for item in items.iter_mut() {
                let key = (item.lineage, item.logical_time);
                item.tensordata = Some(td_map.remove(&key).unwrap_or_default().into());
            }
        }

        if get_moodboard {
            // gather moodboard using lineage and logical_time
            let lineage_times = items
                .iter()
                .map(|item| (item.lineage, item.logical_time))
                .collect();
            let moodboard = self
                .get_tensor_moodboard_data(TmdFilter::LineageTimes(lineage_times))
                .await
                .unwrap_or_default();

            let mut m_map = moodboard
                .into_iter()
                .into_group_map_by(|m| (m.lineage, m.logical_time));

            for item in items.iter_mut() {
                let key = (item.lineage, item.logical_time);
                item.moodboard = Some(m_map.remove(&key).unwrap_or_default().into());
            }
        }

        if get_clip && !clip_ids.is_empty() {
            // use clip_ids to get clip data
            let clips = self
                .get_clips(ClipFilter::ClipIds(clip_ids))
                .await
                .unwrap_or_default();
            let clip_map: HashMap<i64, Clip> = clips.into_iter().map(|c| (c.clip_id, c)).collect();

            for item in items.iter_mut() {
                let fb = item.data();
                let clip_id = fb.clip_id();
                if clip_id > 0 {
                    item.clip = clip_map.get(&clip_id).cloned();
                }
            }
        }

        if get_legacy_prompts
            && self.check_table(&DTProjectTable::TextHistory).await.ok() == Some(true)
        {
            // Collect items that lack flatbuffer prompts and need text history lookup.
            let needs_lookup: Vec<usize> = items
                .iter()
                .enumerate()
                .filter(|(_, item)| {
                    let fb = item.data();
                    fb.text_prompt().is_none_or(|s| s.is_empty())
                        && fb.negative_text_prompt().is_none_or(|s| s.is_empty())
                })
                .map(|(i, _)| i)
                .collect();
            if !needs_lookup.is_empty() {
                for i in needs_lookup {
                    let fb = items[i].data();
                    if let Ok(prompts) =
                        self.get_text_edit(fb.text_lineage(), fb.text_edits()).await
                    {
                        if !prompts.positive.is_empty() {
                            items[i].prompt = Some(prompts.positive);
                        }
                        if !prompts.negative.is_empty() {
                            items[i].negative_prompt = Some(prompts.negative);
                        }
                    }
                }
            }
        }

        Ok(items)
    }

    pub async fn get_predecessors(&self, rowid: i64) -> anyhow::Result<Vec<TensorHistoryNode>> {
        let history = self.get_history_graph().await?;
        let parents = history.get_parent(rowid).ids();
        Ok(self
            .get_tensor_history_nodes(
                Some(ThnFilter::Rowids(parents)),
                Some(ThnData::tensordata()),
            )
            .await?)
    }

    pub async fn get_predecessor_ids(&self, rowid: i64) -> anyhow::Result<Vec<i64>> {
        let history = self.get_history_graph().await?;
        let parents = history.get_parent(rowid).ids();
        Ok(parents)
    }

    pub fn batch_tensor_history_nodes(&self, data: ThnData) -> NodesBatcher<'_> {
        NodesBatcher::new(self, data)
    }

    /**
     * Do not call on a cached dt_project! Only used with DTProject::open()
     */
    pub async fn check_id(&self, pdb_path: String, project_id: i64) -> anyhow::Result<Vec<i64>> {
        if self.is_shared {
            anyhow::bail!("Cannot check ids on a shared dt_project");
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
        .map_err(|e| anyhow::anyhow!("{:?}", e))?;

        Ok(missing_ids)
    }
}

fn checked_flatbuffer(data: &Arc<[u8]>) -> Option<Arc<[u8]>> {
    if root_as_tensor_history_node(data).is_ok() {
        Some(data.clone())
    } else {
        None
    }
}

fn build_query(filter: &Option<ThnFilter>) -> AssertSqlSafe<String> {
    let select = "SELECT thn.* FROM tensorhistorynode thn";

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
            ThnFilter::Predecessor(rowid, _lineage, logical_time) => {
                format!(
                    "WHERE thn.rowid < {} AND thn.__pk1 == {}",
                    rowid,
                    logical_time - 1
                )
            }
            ThnFilter::Rowids(rowids) => {
                format!("WHERE thn.rowid IN ({})", rowids.iter().join(", "))
            }
            ThnFilter::PreviewId(preview_id) => {
                format!(
                    "JOIN tensorhistorynode__f86 f86 ON thn.rowid = f86.rowid WHERE f86.f86 = {}",
                    preview_id
                )
            }
        }
    } else {
        "".to_string()
    };

    let query = format!(
        "{} {} ORDER BY thn.rowid ASC {}",
        select, filter_str, limit_str
    );
    AssertSqlSafe(query)
}

/*
const SELECT_THN: &str =
    "thn.rowid as thn_rowid, thn.__pk0 as thn__pk0, thn.__pk1 as thn__pk1, thn.p as thn_p";
const SELECT_TD: &str = "td.rowid as td_rowid, td.__pk2 as td__pk2, td.p as td_p";
const SELECT_TMD: &str = "tmd.rowid as tmd_rowid, tmd.__pk2 as tmd__pk2, tmd.p as tmd_p";

const JOIN_TD: &str = "LEFT JOIN tensordata td ON thn.__pk0 = td.__pk0 AND thn.__pk1 = td.__pk1";
const JOIN_TMD: &str =
    "LEFT JOIN tensor_moodboard_data tmd ON thn.__pk0 = tmd.__pk0 AND thn.__pk1 = tmd.__pk1";

    Rowid(i64),
    Lineage(i64),
    LogicalTime(i64),
    LineageAndLogicalTime(i64, i64),
    SkipAndTake(i64, i64),
    Range(i64, i64),
*/
