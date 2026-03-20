use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // add maint column to watch_folder table
        let _ = manager
            .alter_table(
                Table::alter()
                    .table("watch_folders")
                    .add_column(ColumnDef::new("maint").integer().default(0))
                    .to_owned(),
            )
            .await?;

        // set all to 1 (binary OR 1)
        let db = manager.get_connection();
        let _ = db
            .execute_unprepared("UPDATE watch_folders SET maint = maint | 1;")
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let _ = manager
            .alter_table(
                Table::alter()
                    .table("watch_folders")
                    .drop_column_if_exists("maint")
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}
