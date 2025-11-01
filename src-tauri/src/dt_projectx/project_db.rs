use crate::dt_project::DTProject;
use chrono::NaiveDateTime;
use rusqlite::types::FromSqlError;
use rusqlite::{Error, OptionalExtension};
use rusqlite::{params, Connection, Result, TransactionBehavior};
use std::sync::MutexGuard;
use std::{collections::HashMap, sync::Mutex};

pub struct ProjectDb {
    conn: Mutex<Connection>,
}

pub struct Project {
    pub project_id: u64,
    pub path: String,
    pub scanned_at: Option<NaiveDateTime>,
}

impl Project {
    pub fn from_row(row: &rusqlite::Row) -> Result<Self, ScanError> {
        Ok(Self {
            project_id: row.get(0)?,
            path: row.get(1)?,
            scanned_at: row.get(2)?,
        })
    }
}

impl ProjectDb {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;

        // Initialize tables if they don't exist
        conn.execute_batch(
            "
                CREATE TABLE IF NOT EXISTS projects (
                project_id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                scanned_at DATETIME
                );

                CREATE TABLE IF NOT EXISTS images (
                image_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                model_id INTEGER,
                prompt TEXT,
                negative_prompt TEXT,
                dt_id INTEGER NOT NULL,
                unique(dt_id, project_id),
                FOREIGN KEY(model_id) REFERENCES models(model_id),
                FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
                );
                
                CREATE TABLE IF NOT EXISTS models (
                model_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,    
                filename TEXT NOT NULL UNIQUE,
                name TEXT
                );

                CREATE TABLE IF NOT EXISTS loras (
                lora_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL UNIQUE,
                name TEXT
                );

                CREATE TABLE IF NOT EXISTS image_loras (
                image_id INTEGER NOT NULL,
                lora_id INTEGER NOT NULL,
                PRIMARY KEY(image_id, lora_id),
                FOREIGN KEY(image_id) REFERENCES images(image_id) ON DELETE CASCADE,
                FOREIGN KEY(lora_id) REFERENCES loras(lora_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS cnets (
                cnet_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL UNIQUE,
                name TEXT
                );

                CREATE TABLE IF NOT EXISTS image_cnets (
                image_id INTEGER NOT NULL,
                cnet_id INTEGER NOT NULL,
                PRIMARY KEY(image_id, cnet_id),
                FOREIGN KEY(image_id) REFERENCES images(image_id) ON DELETE CASCADE,
                FOREIGN KEY(cnet_id) REFERENCES cnets(cnet_id) ON DELETE CASCADE
                );
            ",
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn add_project(&self, path: &str) -> Result<Project, ScanError> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // Try to insert the new path, ignore if it already exists
        conn.execute(
            "INSERT OR IGNORE INTO projects (path) VALUES (?1)",
            params![path],
        )?;

        // Now fetch the ID of the existing or newly inserted project
        let project = conn.query_row(
            "SELECT project_id, path, scanned_at FROM projects WHERE path = ?1",
            params![path],
            |row| Ok(Project::from_row(&row)),
        )?;

        Ok(project?)
    }

    pub fn scan_project(&self, project: &Project) -> Result<(), ScanError> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let dt_project = DTProject::new(&project.path)?;
        let count = dt_project.get_history_count()?;
        let batch_size = 50;

        // Begin a single transaction for the entire scan

        for start in (0..count).step_by(batch_size) {
            let end = (start + batch_size as i64).min(count);
            let histories = dt_project.get_tensor_history(start, end)?;

            // Collect all unique models, loras, and cnets for this batch
            // let mut models: Vec<String> = Vec::new();
            // let mut loras: Vec<String> = Vec::new();
            // let mut controls: Vec<String> = Vec::new();

            for h in &histories {
                // if let model = &h.model {
                //     models.push(model.clone());
                // }
                // loras.extend(h.loras.iter().cloned());
                // controls.extend(h.controls.iter().cloned());
            }

            // Insert or get IDs for all unique models, loras, controls
            // let model_ids: HashMap<String, i64> =
            //     insert_unique_values(&mut *conn, "models", "filename", &models)?;
            // let lora_ids: HashMap<String, i64> =
            //     insert_unique_values(&mut *conn, "loras", "filename", &loras)?;
            // let cnet_ids: HashMap<String, i64> =
            //     insert_unique_values(&mut *conn, "cnets", "filename", &controls)?;

            let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
            // Now insert images and link them to models, loras, and controls
            for h in histories {
                // let model_id: Option<i64> = model_ids.get(&h.model).copied();

                let image_id: Option<i64> = tx.query_one(
                    r#"
                    INSERT OR IGNORE INTO images (project_id, model_id, prompt, negative_prompt, dt_id)
                    VALUES (?1, ?2, ?3, ?4, ?5)
                    RETURNING image_id
                    "#,
                    params![
                        project.project_id,
                        1, //model_id,
                        h.prompt,
                        h.negative_prompt,
                        h.image_id
                    ],
                    |row| row.get(0),
                ).optional()?;

                // Link LORAs
                // for l in h.loras {
                //     if let Some(&lora_id) = lora_ids.get(&l) {
                //         tx.execute(
                //             "INSERT INTO image_loras (image_id, lora_id) VALUES (?1, ?2)",
                //             params![image_id, lora_id],
                //         )?;
                //     }
                // }

                // Link controls
                // for c in h.controls {
                //     if let Some(&cnet_id) = cnet_ids.get(&c) {
                //         tx.execute(
                //             "INSERT INTO image_cnets (image_id, cnet_id) VALUES (?1, ?2)",
                //             params![image_id, cnet_id],
                //         )?;
                //     }
                // }
            }
            let scanned_at = chrono::Utc::now().naive_utc();
            tx.execute(
                "UPDATE projects SET scanned_at = ? WHERE project_id = ?",
                params![scanned_at, project.project_id],
            )?;

            tx.commit()?;
        }

        // Update project timestamp
        Ok(())
    }

    pub fn get_images(&self, project_id: i64) -> Result<Vec<(String, String)>, ScanError> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt =
            conn.prepare("SELECT prompt, negative_prompt FROM images WHERE project_id = ?1")?;
        let rows = stmt.query_map(params![project_id], |row| Ok((row.get(0)?, row.get(1)?)))?;

        Ok(rows.filter_map(|r| r.ok()).collect())
    }
}

/// Inserts unique string values into a table (with `id` and a unique column),
/// then returns a map from value -> id.
///
/// Example table structure:
/// CREATE TABLE loras (
///     lora_id INTEGER PRIMARY KEY AUTOINCREMENT,
///     filename TEXT UNIQUE NOT NULL
/// );
///
/// Usage:
/// let ids = insert_unique_values(&conn, "loras", "filename", &loras)?;
///
pub fn insert_unique_values(
    conn: &mut Connection,
    table_name: &str,
    column_name: &str,
    values: &[String],
) -> Result<HashMap<String, i64>> {
    if values.is_empty() {
        return Ok(HashMap::new());
    }

    let tx = conn.transaction()?;

    // 1. Deduplicate in-memory to minimize SQL load
    let mut unique: Vec<&String> = values.iter().collect();
    unique.sort();
    unique.dedup();

    // 2. Insert all unique values (ignoring duplicates already in DB)
    {
        let sql = format!(
            "INSERT OR IGNORE INTO {} ({}) VALUES (?1)",
            table_name, column_name
        );
        let mut stmt = tx.prepare(&sql)?;
        for val in &unique {
            stmt.execute(params![val])?;
        }
    }

    // 3. Fetch all IDs for those values
    let placeholders = std::iter::repeat("?")
        .take(unique.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT rowid, {} FROM {} WHERE {} IN ({})",
        column_name, table_name, column_name, placeholders
    );

    let mut result = HashMap::new();

    {
        let mut stmt = tx.prepare(&sql)?;
        let mut rows = stmt.query(rusqlite::params_from_iter(unique.iter()))?;

        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            let val: String = row.get(1)?;
            result.insert(val, id);
        }
    }

    tx.commit()?;
    Ok(result)
}

#[derive(Debug)]
pub enum ScanError {
    Sqlite(rusqlite::Error),
    Flatbuffers(String),
    Io(std::io::Error),
    Other(String),
}

impl From<rusqlite::Error> for ScanError {
    fn from(e: rusqlite::Error) -> Self {
        ScanError::Sqlite(e)
    }
}

impl From<std::string::String> for ScanError {
    fn from(e: std::string::String) -> Self {
        ScanError::Other(e)
    }
}

impl From<std::io::Error> for ScanError {
    fn from(e: std::io::Error) -> Self {
        ScanError::Io(e)
    }
}

impl ToString for ScanError {
    fn to_string(&self) -> String {
        match self {
            ScanError::Sqlite(e) => e.to_string(),
            ScanError::Flatbuffers(e) => e.to_string(),
            ScanError::Io(e) => e.to_string(),
            ScanError::Other(e) => e.to_string(),
        }
    }
}
