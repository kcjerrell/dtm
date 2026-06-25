use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(Iden)]
enum EmbeddingModels {
    Table,
    Id,
    Name,
    ModelType,
    Dimension,
    Encoder,
    Version,
    CreatedAt,
}

#[derive(Iden)]
enum ImageEmbeddings {
    Table,
    Id,
    ImageId,
    EmbeddingType,
    ModelId,
    Dimension,
    EmbeddingId,
    CreatedAt,
}

#[derive(Iden)]
enum Images {
    Table,
    Id,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Create embedding_models table
        manager
            .create_table(
                Table::create()
                    .table(EmbeddingModels::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(EmbeddingModels::Id)
                            .integer()
                            .not_null()
                            .primary_key()
                            .auto_increment(),
                    )
                    .col(ColumnDef::new(EmbeddingModels::Name).string().not_null())
                    .col(
                        ColumnDef::new(EmbeddingModels::ModelType)
                            .string()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(EmbeddingModels::Dimension)
                            .integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(EmbeddingModels::Encoder).string().not_null())
                    .col(ColumnDef::new(EmbeddingModels::Version).string().null())
                    .col(
                        ColumnDef::new(EmbeddingModels::CreatedAt)
                            .timestamp()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .index(
                        Index::create()
                            .name("idx_embedding_models_name")
                            .col(EmbeddingModels::Name)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        // Metadata owned by SeaORM. The vector payload lives in dimension-specific vec0 tables.
        manager
            .create_table(
                Table::create()
                    .table(ImageEmbeddings::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ImageEmbeddings::Id)
                            .integer()
                            .not_null()
                            .primary_key()
                            .auto_increment(),
                    )
                    .col(
                        ColumnDef::new(ImageEmbeddings::ImageId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ImageEmbeddings::EmbeddingType)
                            .tiny_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ImageEmbeddings::ModelId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ImageEmbeddings::Dimension)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ImageEmbeddings::EmbeddingId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ImageEmbeddings::CreatedAt)
                            .timestamp()
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_image_embeddings_image_id")
                            .from(ImageEmbeddings::Table, ImageEmbeddings::ImageId)
                            .to(Images::Table, Images::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_image_embeddings_model_id")
                            .from(ImageEmbeddings::Table, ImageEmbeddings::ModelId)
                            .to(EmbeddingModels::Table, EmbeddingModels::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .index(
                        Index::create()
                            .name("idx_image_embeddings_image_id")
                            .col(ImageEmbeddings::ImageId),
                    )
                    .index(
                        Index::create()
                            .name("idx_image_embeddings_model_type")
                            .col(ImageEmbeddings::ModelId)
                            .col(ImageEmbeddings::EmbeddingType),
                    )
                    .index(
                        Index::create()
                            .name("idx_image_embeddings_dimension_embedding_id")
                            .col(ImageEmbeddings::Dimension)
                            .col(ImageEmbeddings::EmbeddingId)
                            .unique(),
                    )
                    .index(
                        Index::create()
                            .name("idx_image_embeddings_unique_embedding")
                            .col(ImageEmbeddings::ImageId)
                            .col(ImageEmbeddings::EmbeddingType)
                            .col(ImageEmbeddings::ModelId)
                            .col(ImageEmbeddings::Dimension)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        // Vector storage/search owned by sqlite-vec.
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE VIRTUAL TABLE IF NOT EXISTS embeddings_768 USING vec0(
                    id integer primary key,
                    embedding_type integer partition key,
                    content float[768] distance_metric=cosine
                );
                "#,
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop tables
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS embeddings_768;")
            .await?;

        manager
            .drop_table(
                Table::drop()
                    .table(ImageEmbeddings::Table)
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS embedding_models;")
            .await?;

        Ok(())
    }
}
