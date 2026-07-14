use crate::projects_db::ProjectsDb;
use anyhow::Result;
use candle_core::Tensor;
use entity::enums::EmbeddingType;
use hex;
use sea_orm::{
    prelude::DateTimeUtc, ActiveValue::Set, ColumnTrait, ConnectionTrait, EntityTrait,
    FromQueryResult, QueryFilter, QueryResult, Statement,
};
use serde::Serialize;
use sqlx::Row;

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

            let bytes = bytemuck::cast_slice(&embedding);
            let bytes_hex = hex::encode(bytes);

            self.pdb
                .db
                .execute_unprepared(&format!(
                    r#"
                    INSERT INTO embeddings_768 (
                        id,
                        embedding_type,
                        content
                    )
                    VALUES (
                        {},
                        {},
                        vec_f32(x'{}')
                    )
                    "#,
                    id, embedding_type as i32, bytes_hex
                ))
                .await?;
        }

        Ok(())
    }

    pub async fn get(&self, image_id: i64) -> Result<(entity::embeddings::Model, Vec<f32>)> {
        let embedding = entity::embeddings::Entity::find()
            .filter(entity::embeddings::Column::ImageId.eq(image_id))
            .one(&self.pdb.db)
            .await?
            .ok_or(anyhow::anyhow!("Embedding not found"))?;
        println!("got embedding info, {:?}", embedding);
        let embedding_768 = self
            .pdb
            .db
            .query_one_raw(Statement::from_string(
                self.pdb.db.get_database_backend(),
                format!("select * from embeddings_768 where id == {}", embedding.id),
            ))
            .await?;

        let mut content: Option<Vec<f32>> = None;
        if let Some(row) = embedding_768.iter().next().unwrap().try_as_sqlite_row() {
            let blob: Vec<u8> = row.get("content");
            // Convert bytes to f32 vector
            let f32_vec: Vec<f32> = blob
                .chunks_exact(4)
                .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
                .collect();
            content = Some(f32_vec);
        }
        println!("got embedding_768 {:?}", content);


        Ok((embedding, content.unwrap()))
    }

    pub async fn find(
        &self,
        embedding: Vec<f32>,
        k: i64,
        embedding_type: EmbeddingType,
    ) -> Result<Vec<EmbeddingMatch>> {
        let bytes = bytemuck::cast_slice(&embedding);
        let bytes_hex = hex::encode(bytes);

        let sql = format!(
            r#"
        SELECT
            ie.image_id,
            e.distance
        FROM embeddings_768 e
        JOIN image_embeddings ie
            ON ie.id = e.id
        WHERE
            e.embedding_type = {}
            AND e.content MATCH vec_f32(x'{}')
            AND k = {}
        ORDER BY e.distance ASC
        "#,
            embedding_type as i32, bytes_hex, k,
        );

        let rows: Vec<EmbeddingMatch> = EmbeddingMatch::find_by_statement(Statement::from_string(
            self.pdb.db.get_database_backend(),
            sql,
        ))
        .all(&self.pdb.db)
        .await?;

        Ok(rows)
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

#[derive(Debug, FromQueryResult)]
pub struct EmbeddingMatch {
    pub image_id: i64,
    pub distance: f64,
}
