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
                    .col(ColumnDef::new(EmbeddingModels::ModelType).string().not_null())
                    .col(ColumnDef::new(EmbeddingModels::Dimension).integer().not_null())
                    .col(ColumnDef::new(EmbeddingModels::Encoder).string().not_null())
                    .col(
                        ColumnDef::new(EmbeddingModels::Version)
                            .string()
                            .null(),
                    )
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

        // Create image_embeddings_768 table with vec extension
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE TABLE IF NOT EXISTS image_embeddings_768 (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    image_id INTEGER NOT NULL,
                    embedding_type TINYINT NOT NULL,
                    model_id INTEGER NOT NULL,
                    embedding vec(768) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
                    FOREIGN KEY (model_id) REFERENCES embedding_models(id) ON DELETE CASCADE
                );
                "#,
            )
            .await?;

        // ANN index
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE INDEX IF NOT EXISTS image_embeddings_768_idx
                ON image_embeddings_768(embedding);
                "#,
            )
            .await?;

        // Reverse lookup index
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE INDEX IF NOT EXISTS image_embeddings_768_image_id_idx
                ON image_embeddings_768(image_id);
                "#,
            )
            .await?;

        // Model + type filtering index
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                CREATE INDEX IF NOT EXISTS image_embeddings_768_model_type_idx
                ON image_embeddings_768(model_id, embedding_type);
                "#,
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop indexes
        manager
            .get_connection()
            .execute_unprepared("DROP INDEX IF EXISTS image_embeddings_768_idx;")
            .await?;

        manager
            .get_connection()
            .execute_unprepared("DROP INDEX IF EXISTS image_embeddings_768_image_id_idx;")
            .await?;

        manager
            .get_connection()
            .execute_unprepared("DROP INDEX IF EXISTS image_embeddings_768_model_type_idx;")
            .await?;

        // Drop tables
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS image_embeddings_768;")
            .await?;

        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS embedding_models;")
            .await?;

        Ok(())
    }
}
