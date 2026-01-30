use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Clear data
        let db = manager.get_connection();
        db.execute_unprepared("DELETE FROM image_loras").await?;
        db.execute_unprepared("DELETE FROM image_controls").await?;
        db.execute_unprepared("DELETE FROM images").await?;
        db.execute_unprepared("DELETE FROM projects").await?;
        println!("Deleted data");

        // Add columns
        manager
            .alter_table(
                Table::alter()
                    .table(Images::Table)
                    .add_column(ColumnDef::new(Images::NumFrames).small_integer().null())
                    .to_owned(),
            )
            .await?;
        println!("Added num_frames column");

        // Add columns
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
        manager
            .alter_table(
                Table::alter()
                    .table(Projects::Table)
                    .drop_column(Projects::MissingOn)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Projects::Table)
                    .drop_column(Projects::Fingerprint)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Images::Table)
                    .drop_column(Images::UpscalerScaleFactor)
                    .to_owned(),
            )
            .await?;

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
