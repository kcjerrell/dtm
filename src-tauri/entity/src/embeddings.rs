use super::enums::EmbeddingType;
use sea_orm::entity::prelude::*;
use serde::Serialize;

#[sea_orm::model]
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "image_embeddings")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,

    pub image_id: i64,

    #[sea_orm(num_enum)]
    pub embedding_type: EmbeddingType,

    pub model_id: i64,

    pub dimension: i32,

    pub embedding_id: i64,

    pub created_at: DateTimeUtc,

    #[sea_orm(
        belongs_to,
        from = "image_id",
        to = "id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    pub image: HasOne<super::images::Entity>,

    #[sea_orm(
        belongs_to,
        from = "model_id",
        to = "id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    pub embedding_model: HasOne<super::embedding_models::Entity>,
}

impl ActiveModelBehavior for ActiveModel {}
