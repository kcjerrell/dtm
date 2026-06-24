use sea_orm::entity::prelude::*;
use super::enums::EmbeddingType;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "image_embeddings_768")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,

    pub image_id: i64,

    pub embedding_type: EmbeddingType,

    pub model_id: i64,

    // Stored as BLOB, interpreted by sqlite-vec as vec(768)
    #[sea_orm(column_type = "Blob")]
    pub embedding: Vec<u8>,

    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter)]
pub enum Relation {
    Images,
    EmbeddingModels,
}

impl RelationTrait for Relation {
    fn def(&self) -> RelationDef {
        match self {
            Self::Images => Entity::belongs_to(super::images::Entity)
                .from(Column::ImageId)
                .to(super::images::Column::Id)
                .on_delete(ForeignKeyAction::Cascade)
                .into(),
            Self::EmbeddingModels => Entity::belongs_to(super::embedding_models::Entity)
                .from(Column::ModelId)
                .to(super::embedding_models::Column::Id)
                .on_delete(ForeignKeyAction::Cascade)
                .into(),
        }
    }
}

impl ActiveModelBehavior for ActiveModel {}
