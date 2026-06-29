use crate::projects_db::ProjectsDb;
use anyhow::Result;
use candle_core::Tensor;
use entity::enums::EmbeddingType;
use sea_orm::{
    prelude::DateTimeUtc, ActiveValue::Set, ConnectionTrait, EntityTrait, FromQueryResult,
};
use serde::Serialize;

pub struct Embeddings<'a> {
    pdb: &'a ProjectsDb,
}

impl<'a> Embeddings<'a> {
    pub fn new(pdb: &'a ProjectsDb) -> Self {
        Self { pdb }
    }

    pub async fn list(&self) -> Result<Vec<Embedding>> {
        let models: Vec<Embedding> = entity::embeddings::Entity::find()
            .into_model()
            .all(&self.pdb.db)
            .await?;
        Ok(models)
    }

    pub async fn insert_many(
        &self,
        image_ids: Vec<i64>,
        embeddings: Tensor,
        embedding_type: EmbeddingType,
        model_id: i64,
    ) -> Result<()> {
        let dimension = embeddings.dim(1)?;
        let models = image_ids
            .iter()
            .map(|image_id| entity::embeddings::ActiveModel {
                embedding_type: Set(embedding_type),
                dimension: Set(dimension as i32),
                image_id: Set(*image_id),
                model_id: Set(model_id),
                ..Default::default()
            })
            .collect::<Vec<_>>();

        let ids = entity::embeddings::Entity::insert_many(models)
            .exec_with_returning_keys(&self.pdb.db)
            .await?;

        for (i, id) in ids.iter().enumerate() {
            let embedding: Vec<f32> = embeddings.get(i)?.to_vec1()?;
            
            // sqlite-vec expects vectors as JSON array strings
            let embedding_str = embedding
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .join(",");
            
            let sql = format!(
                "INSERT INTO embeddings_768 (id, embedding_type, content) VALUES ({}, {}, '[{}]')",
                id, embedding_type as i32, embedding_str
            );
            
            self.pdb.db.execute_unprepared(&sql).await?;
        }
        Ok(())
    }
}

enum EmbeddingVecTypes {
    Unknown = 0,
    SiglipImage = 1,
    SiglipText = 2,
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct Embedding {
    pub id: i64,
    pub image_id: i64,
    pub embedding_type: EmbeddingType,
    pub model_id: i64,
    pub dimension: i32,
    pub created_at: DateTimeUtc,
    // pub image: HasOne<super::images::Entity>,
    // pub embedding_model: HasOne<super::embedding_models::Entity>,
}
