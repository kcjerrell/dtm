use sea_orm::entity::prelude::*;
use serde::Serialize;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "embedding_models")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,

    #[sea_orm(unique)]
    pub name: String,

    pub model_type: String,

    pub dimension: i32,

    pub encoder: String,

    pub version: Option<String>,

    pub created_at: DateTimeUtc,

    #[sea_orm(has_many)]
    pub image_embeddings: HasMany<super::embeddings::Entity>,
}

impl ActiveModelBehavior for ActiveModel {}
