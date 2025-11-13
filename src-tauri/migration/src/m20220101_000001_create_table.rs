use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. watch_folders
        manager
            .create_table(
                Table::create()
                    .table(WatchFolders::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(WatchFolders::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(WatchFolders::Path).text().not_null().unique_key())
                    .to_owned(),
            )
            .await?;

        // 2. projects
        manager
            .create_table(
                Table::create()
                    .table(Projects::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Projects::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Projects::Path).text().not_null().unique_key())
                    .col(ColumnDef::new(Projects::Filesize).big_integer())
                    .col(ColumnDef::new(Projects::Modified).big_integer())
                    .to_owned(),
            )
            .await?;

        // 3. models (merged models/loras/cnets)
        manager
            .create_table(
                Table::create()
                    .table(Models::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Models::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Models::ModelType).string().not_null())
                    .col(ColumnDef::new(Models::Filename).text().not_null())
                    .col(ColumnDef::new(Models::Name).text())
                    .col(ColumnDef::new(Models::Version).text())
                    .index(
                        Index::create()
                            .name("idx_models_type_filename_unique")
                            .col(Models::ModelType)
                            .col(Models::Filename)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        // 4. images
        manager
            .create_table(
                Table::create()
                    .table(Images::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Images::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Images::ProjectId).integer().not_null())
                    .col(ColumnDef::new(Images::ModelId).integer())
                    .col(ColumnDef::new(Images::RefinerId).integer())
                    .col(ColumnDef::new(Images::Prompt).text())
                    .col(ColumnDef::new(Images::NegativePrompt).text())
                    .col(ColumnDef::new(Images::NodeId).big_integer().not_null())
                    .col(ColumnDef::new(Images::PreviewId).big_integer().not_null())
                    .col(ColumnDef::new(Images::WallClock).date_time().not_null())
                    .index(
                        Index::create()
                            .name("idx_images_nodeid_projectid_unique")
                            .col(Images::NodeId)
                            .col(Images::ProjectId)
                            .unique(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Images::Table, Images::ProjectId)
                            .to(Projects::Table, Projects::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Images::Table, Images::ModelId)
                            .to(Models::Table, Models::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Images::Table, Images::RefinerId)
                            .to(Models::Table, Models::Id),
                    )
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
                    .primary_key(
                        Index::create()
                            .col(ImageLoras::ImageId)
                            .col(ImageLoras::LoraId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageLoras::Table, ImageLoras::ImageId)
                            .to(Images::Table, Images::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    // references models table, where model_type='lora'
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageLoras::Table, ImageLoras::LoraId)
                            .to(Models::Table, Models::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 6. image_cnets
        manager
            .create_table(
                Table::create()
                    .table(ImageCnets::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ImageCnets::ImageId).integer().not_null())
                    .col(ColumnDef::new(ImageCnets::CnetId).integer().not_null())
                    .primary_key(
                        Index::create()
                            .col(ImageCnets::ImageId)
                            .col(ImageCnets::CnetId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageCnets::Table, ImageCnets::ImageId)
                            .to(Images::Table, Images::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    // references models table, where model_type='cnet'
                    .foreign_key(
                        ForeignKey::create()
                            .from(ImageCnets::Table, ImageCnets::CnetId)
                            .to(Models::Table, Models::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.drop_table(Table::drop().table(ImageCnets::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(ImageLoras::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Images::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Models::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(Projects::Table).to_owned()).await?;
        manager.drop_table(Table::drop().table(WatchFolders::Table).to_owned()).await?;
        Ok(())
    }
}

// === Table Identities ===

#[derive(Iden)]
enum WatchFolders {
    Table,
    Id,
    Path,
}

#[derive(Iden)]
enum Projects {
    Table,
    Id,
    Path,
    Filesize,
    Modified,
}

#[derive(Iden)]
enum Models {
    Table,
    Id,
    ModelType,
    Filename,
    Name,
    Version,
}

#[derive(Iden)]
enum Images {
    Table,
    Id,
    ProjectId,
    ModelId,
    RefinerId,
    Prompt,
    NegativePrompt,
    NodeId,
    PreviewId,
    WallClock,
}

#[derive(Iden)]
enum ImageLoras {
    Table,
    ImageId,
    LoraId,
}

#[derive(Iden)]
enum ImageCnets {
    Table,
    ImageId,
    CnetId,
}