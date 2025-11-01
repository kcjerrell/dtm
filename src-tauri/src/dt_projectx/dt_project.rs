use std::sync::Mutex;

use rusqlite::{Connection, Result};

use crate::dt_project::{parse_tensor_history, TensorHistory};

pub struct DTProject {
    conn: Mutex<Connection>,
}

impl DTProject {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn get_tensor_history(
        &self,
        first_id: i64,
        count: i64,
    ) -> Result<Vec<TensorHistory>, String> {
        let conn = self.conn.lock().unwrap();
        let last_id = first_id + count - 1;
        let mut stmt = conn.prepare(
          "SELECT p, f86, tensorhistorynode.rowid FROM tensorhistorynode LEFT JOIN tensorhistorynode__f86 ON tensorhistorynode.rowid == tensorhistorynode__f86.rowid
           WHERE tensorhistorynode.rowid BETWEEN ?1 AND ?2
           ORDER BY tensorhistorynode.rowid ASC")
          .map_err(|e| e.to_string())?;

        let mut rows = stmt.query([first_id, last_id]).map_err(|e| e.to_string())?;

        let mut histories = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let blob: Vec<u8> = row.get(0).map_err(|e| e.to_string())?;
            let image_id: i64 = row.get(1).map_err(|e| e.to_string())?;
            let row_id: i64 = row.get(2).map_err(|e| e.to_string())?;
            histories.push(parse_tensor_history(&blob, row_id, image_id)?);
        }

        Ok(histories)
    }

    pub fn get_tensor(&self, name: String) -> Result<TensorResult, String> {
        let conn = self.conn.lock().unwrap();
        let result = conn
            .query_row(
                "SELECT format, datatype, dim, data FROM tensors WHERE name = ?1",
                [name],
                |row| {
                    Ok(TensorResult {
                        format: row.get(0)?,
                        datatype: row.get(1)?,
                        dim: row.get(2)?,
                        data: row.get(3)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;
        Ok(result)
    }

    pub fn get_thumb_half(&self, thumb_id: i64) -> Result<Vec<u8>, String> {
        let conn = self.conn.lock().unwrap();
        let result: Vec<u8> = conn
            .query_row(
                "SELECT p FROM thumbnailhistoryhalfnode WHERE __pk0 = ?1",
                [thumb_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(result)
    }

    pub fn get_history_count(&self) -> Result<i64, String> {
        let conn = self.conn.lock().unwrap();
        let result: i64 = conn
            .query_row("SELECT COUNT(*) FROM tensorhistorynode", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(result)
    }
}

#[derive(serde::Serialize, Debug)]
pub struct TensorResult {
    pub format: u64,
    pub datatype: u64,
    pub dim: Vec<u8>,
    pub data: Vec<u8>,
}
