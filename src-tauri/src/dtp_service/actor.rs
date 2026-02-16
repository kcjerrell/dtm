use std::sync::Arc;

use tauri::AppHandle;
use tokio::sync::{RwLock, mpsc};

use crate::{dtp_service::events::{self, DTPEvent}, projects_db::ProjectsDb};

pub type DTPActor = mpsc::Sender<DTPMessage>;

pub fn create_actor(
    app_handle: &AppHandle,
    pdb: &Arc<RwLock<Option<ProjectsDb>>>,
    events: &events::DTPEventsService,
) -> DTPActor {
    let _app_handle = app_handle.clone();
    let events = events.clone();
    let _pdb = pdb.clone();

    let (tx, mut rx) = mpsc::channel(100);
    let tx2 = tx.clone();

    tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            match msg {
                DTPMessage::DoIt => {
                    println!("DoIt");
                    events.emit(DTPEvent::DoItDone);
                }
                DTPMessage::DoTheThing => {
                    println!("DoTheThing");
                    events.emit(DTPEvent::DidTheThing);
                    tx.send(DTPMessage::Win).await.unwrap();
                }
                DTPMessage::Win => {
                    println!("Win");
                    events.emit(DTPEvent::Won);
                }
            }
        }
    });

    return tx2;
}

pub enum DTPMessage {
    DoIt,
    DoTheThing,
    Win,
}