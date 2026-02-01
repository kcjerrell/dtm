use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Clear data, images need to be rescanned
        let db = manager.get_connection();
        db.execute_unprepared("DELETE FROM image_loras").await?;
        db.execute_unprepared("DELETE FROM image_controls").await?;
        db.execute_unprepared("DELETE FROM images").await?;
        db.execute_unprepared("DELETE FROM projects").await?;
        println!("Deleted data");

        // 1. Add num_frames column to images
        manager
            .alter_table(
                Table::alter()
                    .table(Images::Table)
                    .add_column(ColumnDef::new(Images::NumFrames).small_integer().null())
                    .to_owned(),
            )
            .await?;
        println!("Added num_frames column");

        // 2. Add upscaler_scale_factor column to images
        manager
            .alter_table(
                Table::alter()
                    .table(Images::Table)
                    .add_column(
                        ColumnDef::new(Images::UpscalerScaleFactor)
                            .small_unsigned()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;
        println!("Added upscaler_scale_factor column");

        // 3. Add fingerprint column to projects
        manager
            .alter_table(
                Table::alter()
                    .table(Projects::Table)
                    .add_column(
                        ColumnDef::new(Projects::Fingerprint)
                            .string()
                            .not_null()
                            .default(""),
                    )
                    .to_owned(),
            )
            .await?;
        println!("Added fingerprint column");

        // 4. Add missing_on column to projects
        manager
            .alter_table(
                Table::alter()
                    .table(Projects::Table)
                    .add_column(ColumnDef::new(Projects::MissingOn).big_integer().null())
                    .to_owned(),
            )
            .await?;
        println!("Added missing_on column");

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 4. Remove missing_on column from projects
        manager
            .alter_table(
                Table::alter()
                    .table(Projects::Table)
                    .drop_column(Projects::MissingOn)
                    .to_owned(),
            )
            .await?;

        // 3. Remove fingerprint column from projects
        manager
            .alter_table(
                Table::alter()
                    .table(Projects::Table)
                    .drop_column(Projects::Fingerprint)
                    .to_owned(),
            )
            .await?;

        // 2. Remove upscaler_scale_factor column from images
        manager
            .alter_table(
                Table::alter()
                    .table(Images::Table)
                    .drop_column(Images::UpscalerScaleFactor)
                    .to_owned(),
            )
            .await?;

        // 1. Remove num_frames column from images
        manager
            .alter_table(
                Table::alter()
                    .table(Images::Table)
                    .drop_column(Images::NumFrames)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum Projects {
    Table,
    Fingerprint,
    MissingOn,
}

#[derive(Iden)]
enum Images {
    Table,
    NumFrames,
    UpscalerScaleFactor,
}
