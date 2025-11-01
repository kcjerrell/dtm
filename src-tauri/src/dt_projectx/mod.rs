use rusqlite::{params, Connection, Result};
extern crate flatbuffers;

#[allow(dead_code, unused_imports)]
#[path = "tensor_history_generated.rs"]
mod tensor_history_generated;
use tensor_history_generated::TensorHistoryNode;

use crate::dt_project::tensor_history_generated::root_as_tensor_history_node;

mod tensor_history;
pub use tensor_history::{parse_tensor_history, TensorHistory};

mod project_db;
pub use project_db::ProjectDb;

mod dt_project;
pub use dt_project::{DTProject, TensorResult};

fn open_file(path: &str) -> Result<Connection> {
    let conn = Connection::open(path)?;

    Ok(conn)
}

fn count_rows(conn: &Connection) -> Result<u32> {
    // SELECT count(rowid) FROM 'tensorhistorynode'
    let mut stmt = conn.prepare("SELECT count(rowid) FROM 'tensorhistorynode'")?;
    let row = stmt.query_row(params![], |row| row.get(0))?;
    Ok(row)
}

fn get_blob(conn: &Connection, index: u32) -> Result<Vec<u8>> {
    // SELECT p FROM 'tensorhistorynode' where rowid == 2
    let mut stmt = conn.prepare("SELECT p FROM 'tensorhistorynode' where rowid == ?")?;
    let row: Vec<u8> = stmt.query_row(params![index], |row| row.get(0))?;
    println!("{}", row.len());
    Ok(row)
}

fn read_buffer(blob: &Vec<u8>) -> Result<TensorHistoryNode> {
    Ok(root_as_tensor_history_node(blob).unwrap())
}

// pub fn test() -> Result<TensorHistoryNode> {
//     println!("testing...");

//     let project = open_file(
//         "/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents/examine.sqlite3",
//     )
//     .unwrap();
//     let count = count_rows(&project).unwrap();
//     println!("count: {}", count);
//     let blob = get_blob(&project, 2).unwrap();
//     println!("blob: {}", blob.len());
//     let data = read_buffer(&blob).unwrap();

//     Ok(data)
// }

struct TensorHistoryResult {
    pub image_id: i64,
    pub blob: Vec<u8>,
}

pub fn get_tensor_history_single(row_id: u32) -> Result<TensorHistory, String> {
    let db_path =
        "/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents/examine.sqlite3";
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let row = conn
        .query_row(
            "SELECT p FROM tensorhistorynode WHERE rowid == ?1
            JOIN tensorhistorynode__f86 ON tensorhistorynode.rowid == tensorhistorynode__f86.rowid",
            params![row_id],
            |row| {
                Ok(TensorHistoryResult {
                    image_id: row.get(1)?,
                    blob: row.get(0)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    parse_tensor_history(&row.blob, row_id as i64, row.image_id).map_err(|e| e.to_string())
}

pub fn search_tensor_history(text: String) -> Result<Vec<u32>, String> {
    let db_path =
        "/Users/kcjer/Library/Containers/com.liuliu.draw-things/Data/Documents/examine.sqlite3";
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT rowid FROM tensorhistorynode WHERE text_prompt LIKE ?1")
        .map_err(|e| e.to_string())?;

    let pattern = format!("%{}%", text);
    let rows = stmt
        .query_map(params![pattern], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<u32>>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}
