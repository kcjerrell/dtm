use std::sync::Arc;

use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, FromQueryResult, QueryFilter, prelude::DateTimeUtc,
};
use serde::Serialize;

use crate::projects_db::{dtos::embedding_model, ProjectsDb};
use anyhow::Result;

pub struct EmbeddingModels<'a> {
    pdb: &'a ProjectsDb,
}

impl<'a> EmbeddingModels<'a> {
    pub fn new(pdb: &'a ProjectsDb) -> Self {
        Self { pdb }
    }

    pub async fn list(&self) -> Result<Vec<EmbeddingModel>> {
        let models: Vec<EmbeddingModel> = entity::embedding_models::Entity::find()
            .into_model()
            .all(&self.pdb.db)
            .await?;
        Ok(models)
    }

    pub async fn get(&self, model_ref: impl Into<EmbeddingModelRef>) -> Result<Option<EmbeddingModel>> {
        let model = match model_ref.into() {
            EmbeddingModelRef::Id(id) => entity::embedding_models::Entity::find_by_id(id),
            EmbeddingModelRef::Name(name) => entity::embedding_models::Entity::find()
                .filter(entity::embedding_models::Column::Name.eq(name)),
        }
        .into_model()
        .one(&self.pdb.db)
        .await?;
        Ok(model)
    }

    pub async fn create(
        &self,
        name: String,
        model_type: String,
        dimension: i32,
        encoder: String,
        version: Option<String>,
    ) -> Result<EmbeddingModel> {
        let model = entity::embedding_models::ActiveModel {
            name: Set(name),
            model_type: Set(model_type),
            dimension: Set(dimension),
            encoder: Set(encoder),
            version: Set(version),
            ..Default::default()
        };

        let model = model.insert(&self.pdb.db).await?;

        Ok(EmbeddingModel::from(model))
    }
}

enum EmbeddingModelRef {
    Id(i64),
    Name(String),
}

impl Into<EmbeddingModelRef> for i64 {
    fn into(self) -> EmbeddingModelRef {
        EmbeddingModelRef::Id(self)
    }
}

impl Into<EmbeddingModelRef> for &str {
    fn into(self) -> EmbeddingModelRef {
        EmbeddingModelRef::Name(self.to_string())
    }
}

#[derive(Debug, FromQueryResult, Serialize)]
pub struct EmbeddingModel {
    pub id: i64,
    pub name: String,
    pub model_type: String,
    pub dimension: i32,
    pub encoder: String,
    pub version: Option<String>,
    pub created_at: DateTimeUtc,
}

impl From<entity::embedding_models::Model> for EmbeddingModel {
    fn from(model: entity::embedding_models::Model) -> Self {
        Self {
            id: model.id,
            name: model.name,
            model_type: model.model_type,
            dimension: model.dimension,
            encoder: model.encoder,
            version: model.version,
            created_at: model.created_at,
        }
    }
}
