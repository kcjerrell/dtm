use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. projects
        manager
            .create_table(
                Table::create()
                    .table(Projects::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Projects::ProjectId)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Projects::Path).text().not_null().unique_key())
                    .to_owned(),
            )
            .await?;

        // 2. models
        manager
            .create_table(
                Table::create()
                    .table(Models::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Models::ModelId)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Models::Filename).text().not_null().unique_key())
                    .col(ColumnDef::new(Models::Name).text())
                    .to_owned(),
            )
            .await?;

        // 3. images
        manager
            .create_table(
                Table::create()
                    .table(Images::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Images::ImageId)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Images::ProjectId).integer().not_null())
                    .col(ColumnDef::new(Images::ModelId).integer())
                    .col(ColumnDef::new(Images::Prompt).text())
                    .col(ColumnDef::new(Images::NegativePrompt).text())
                    .col(ColumnDef::new(Images::DtId).big_integer().not_null())
                    .col(ColumnDef::new(Images::RowId).big_integer().not_null())
                    .col(ColumnDef::new(Images::WallClock).date_time().not_null())
                    .index(
                        Index::create()
                            .name("idx_images_rowid_projectid_unique")
                            .col(Images::RowId)
                            .col(Images::ProjectId)
                            .unique(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Images::Table, Images::ModelId)
                            .to(Models::Table, Models::ModelId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Images::Table, Images::ProjectId)
                            .to(Projects::Table, Projects::ProjectId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 4. loras
        manager
            .create_table(
                Table::create()
                    .table(Loras::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Loras::LoraId)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Loras::Filename).text().not_null().unique_key())
                    .col(ColumnDef::new(Loras::Name).text())
                    .to_owned(),
            )
            .await?;

        // 5. image_loras
        manager
            .create_table(
                Table::create()
                    .table(ImageLoras::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ImageLoras::ImageId).integer().not_null())
                    .col(ColumnDef::new(ImageLoras::LoraId).integer().not_null())
                    .primary_key(Index::create().col(ImageLoras::ImageId).col(ImageLoras::LoraId))
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageLoras::Table, ImageLoras::ImageId)
                            .to(Images::Table, Images::ImageId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageLoras::Table, ImageLoras::LoraId)
                            .to(Loras::Table, Loras::LoraId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 6. cnets
        manager
            .create_table(
                Table::create()
                    .table(Cnets::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Cnets::CnetId)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Cnets::Filename).text().not_null().unique_key())
                    .col(ColumnDef::new(Cnets::Name).text())
                    .to_owned(),
            )
            .await?;

        // 7. image_cnets
        manager
            .create_table(
                Table::create()
                    .table(ImageCnets::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ImageCnets::ImageId).integer().not_null())
                    .col(ColumnDef::new(ImageCnets::CnetId).integer().not_null())
                    .primary_key(Index::create().col(ImageCnets::ImageId).col(ImageCnets::CnetId))
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageCnets::Table, ImageCnets::ImageId)
                            .to(Images::Table, Images::ImageId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageCnets::Table, ImageCnets::CnetId)
                            .to(Cnets::Table, Cnets::CnetId)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                .table(WatchFolder::Table)
                .if_not_exists()
                .col(ColumnDef::new(WatchFolder::WatchFolderId).integer().not_null().auto_increment().primary_key())
                .col(ColumnDef::new(WatchFolder::Path).text().not_null().unique_key())
                .to_owned(),
            ).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop in reverse dependency order
        manager.drop_table(Table::drop().table(ImageCnets::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Cnets::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(ImageLoras::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Loras::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Images::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Models::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Projects::Table).to_owned()).await?;
        Ok(())
    }
}

#[derive(Iden)]
enum Projects {
    Table,
    ProjectId,
    Path,
}

#[derive(Iden)]
enum Models {
    Table,
    ModelId,
    Filename,
    Name,
}

#[derive(Iden)]
enum Images {
    Table,
    ImageId,
    ProjectId,
    ModelId,
    Prompt,
    NegativePrompt,
    DtId,
    RowId,
    WallClock
}

#[derive(Iden)]
enum Loras {
    Table,
    LoraId,
    Filename,
    Name,
}

#[derive(Iden)]
enum ImageLoras {
    Table,
    ImageId,
    LoraId,
}

#[derive(Iden)]
enum Cnets {
    Table,
    CnetId,
    Filename,
    Name,
}

#[derive(Iden)]
enum ImageCnets {
    Table,
    ImageId,
    CnetId,
}

#[derive(Iden)]
enum WatchFolder {
    Table,
    WatchFolderId,
    Path,
}