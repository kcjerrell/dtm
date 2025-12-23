use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // projects
        manager
            .create_table(
                Table::create()
                    .table(Projects::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Projects::Id)
                            .integer()
                            .not_null()
                            .primary_key()
                            .auto_increment(),
                    )
                    .col(
                        ColumnDef::new(Projects::Path)
                            .string()
                            .not_null()
                            .unique_key(),
                    )
                    .col(ColumnDef::new(Projects::Filesize).big_integer().null())
                    .col(ColumnDef::new(Projects::Modified).big_integer().null())
                    .col(
                        ColumnDef::new(Projects::Excluded)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .to_owned(),
            )
            .await?;

        // models
        manager
            .create_table(
                Table::create()
                    .table(Models::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Models::Id)
                            .integer()
                            .not_null()
                            .primary_key()
                            .auto_increment(),
                    )
                    .col(ColumnDef::new(Models::ModelType).tiny_integer().not_null())
                    .col(ColumnDef::new(Models::Filename).string().not_null())
                    .col(ColumnDef::new(Models::Name).string().null())
                    .col(ColumnDef::new(Models::Version).string().null())
                    .index(
                        Index::create()
                            .name("idx_models_model_type_filename")
                            .col(Models::ModelType)
                            .col(Models::Filename)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_models_type")
                    .table(Models::Table)
                    .col(Models::ModelType)
                    .to_owned(),
            )
            .await?;

        // images
        manager
            .create_table(
                Table::create()
                    .table(Images::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Images::Id)
                            .integer()
                            .not_null()
                            .primary_key()
                            .auto_increment(),
                    )
                    .col(ColumnDef::new(Images::ProjectId).integer().not_null())
                    .col(ColumnDef::new(Images::NodeId).big_integer().not_null())
                    .col(ColumnDef::new(Images::PreviewId).big_integer().not_null())
                    .col(ColumnDef::new(Images::ThumbnailHalf).blob().null())
                    .col(ColumnDef::new(Images::ClipId).big_integer().not_null())
                    .col(ColumnDef::new(Images::WallClock).timestamp().not_null())
                    .col(ColumnDef::new(Images::ModelId).integer().null())
                    .col(ColumnDef::new(Images::RefinerId).integer().null())
                    .col(ColumnDef::new(Images::RefinerStart).float().null())
                    .col(ColumnDef::new(Images::UpscalerId).integer().null())
                    .col(ColumnDef::new(Images::Prompt).text().null())
                    .col(ColumnDef::new(Images::NegativePrompt).text().null())
                    .col(
                        ColumnDef::new(Images::StartWidth)
                            .unsigned()
                            .small_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Images::StartHeight)
                            .unsigned()
                            .small_integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Images::Seed).unsigned().integer().not_null())
                    .col(ColumnDef::new(Images::Strength).float().not_null())
                    .col(
                        ColumnDef::new(Images::Steps)
                            .unsigned()
                            .small_integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Images::GuidanceScale).float().not_null())
                    .col(ColumnDef::new(Images::Shift).float().not_null())
                    .col(ColumnDef::new(Images::Sampler).tiny_integer().not_null())
                    .col(ColumnDef::new(Images::HiresFix).boolean().not_null())
                    .col(ColumnDef::new(Images::TiledDecoding).boolean().not_null())
                    .col(ColumnDef::new(Images::TiledDiffusion).boolean().not_null())
                    .col(ColumnDef::new(Images::TeaCache).boolean().not_null())
                    .col(ColumnDef::new(Images::CfgZeroStar).boolean().not_null())
                    .col(
                        ColumnDef::new(Images::HasMask)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Images::HasDepth)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Images::HasPose)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Images::HasColor)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Images::HasCustom)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Images::HasScribble)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(Images::HasShuffle)
                            .boolean()
                            .not_null()
                            .default(false),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_images_project")
                            .from(Images::Table, Images::ProjectId)
                            .to(Projects::Table, Projects::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_images_model")
                            .from(Images::Table, Images::ModelId)
                            .to(Models::Table, Models::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_images_refiner")
                            .from(Images::Table, Images::RefinerId)
                            .to(Models::Table, Models::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_images_upscaler")
                            .from(Images::Table, Images::UpscalerId)
                            .to(Models::Table, Models::Id),
                    )
                    .index(
                        Index::create()
                            .name("idx_images_project_id_node_id")
                            .col(Images::ProjectId)
                            .col(Images::NodeId)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        // Indexes for images
        manager
            .create_index(
                Index::create()
                    .name("idx_images_project_id")
                    .table(Images::Table)
                    .col(Images::ProjectId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_images_wall_clock")
                    .table(Images::Table)
                    .col(Images::WallClock)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_images_model_ids")
                    .table(Images::Table)
                    .col(Images::ModelId)
                    .col(Images::RefinerId)
                    .col(Images::UpscalerId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_images_strength")
                    .table(Images::Table)
                    .col(Images::Strength)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_images_guidance_scale")
                    .table(Images::Table)
                    .col(Images::GuidanceScale)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_images_seed")
                    .table(Images::Table)
                    .col(Images::Seed)
                    .to_owned(),
            )
            .await?;

        // image_controls
        manager
            .create_table(
                Table::create()
                    .table(ImageControls::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ImageControls::ImageId).integer().not_null())
                    .col(
                        ColumnDef::new(ImageControls::ControlId)
                            .integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(ImageControls::Weight).float().not_null())
                    .primary_key(
                        Index::create()
                            .col(ImageControls::ImageId)
                            .col(ImageControls::ControlId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_image_controls_image")
                            .from(ImageControls::Table, ImageControls::ImageId)
                            .to(Images::Table, Images::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_image_controls_control")
                            .from(ImageControls::Table, ImageControls::ControlId)
                            .to(Models::Table, Models::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // image_loras
        manager
            .create_table(
                Table::create()
                    .table(ImageLoras::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ImageLoras::ImageId).integer().not_null())
                    .col(ColumnDef::new(ImageLoras::LoraId).integer().not_null())
                    .col(ColumnDef::new(ImageLoras::Weight).float().not_null())
                    .primary_key(
                        Index::create()
                            .col(ImageLoras::ImageId)
                            .col(ImageLoras::LoraId),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_image_loras_image")
                            .from(ImageLoras::Table, ImageLoras::ImageId)
                            .to(Images::Table, Images::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_image_loras_lora")
                            .from(ImageLoras::Table, ImageLoras::LoraId)
                            .to(Models::Table, Models::Id),
                    )
                    .to_owned(),
            )
            .await?;

        // watchfolders
        manager
            .create_table(
                Table::create()
                    .table(WatchFolders::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(WatchFolders::Id)
                            .integer()
                            .not_null()
                            .primary_key()
                            .auto_increment(),
                    )
                    .col(ColumnDef::new(WatchFolders::Path).string().not_null())
                    .col(
                        ColumnDef::new(WatchFolders::Recursive)
                            .boolean()
                            .default(false),
                    )
                    .col(
                        ColumnDef::new(WatchFolders::ItemType)
                            .tiny_integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(WatchFolders::LastUpdated).integer().null())
                    .index(
                        Index::create()
                            .name("idx_watch_folders_path_item_type")
                            .col(WatchFolders::Path)
                            .col(WatchFolders::ItemType)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .get_connection()
            .execute_unprepared(
                r#"
                    CREATE VIRTUAL TABLE IF NOT EXISTS images_fts
                    USING fts5(
                        prompt,
                        negative_prompt,
                        content='images',
                        content_rowid='id',
                        tokenize='porter',
                        prefix='2 3 4'
                    );
                "#,
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS images_fts;")
            .await?;
        manager
            .drop_table(Table::drop().table(ImageLoras::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(ImageControls::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Images::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Models::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Projects::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(WatchFolders::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(Iden)]
enum Projects {
    Table,
    Id,
    Path,
    Filesize,
    Modified,
    Excluded,
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
    NodeId,
    PreviewId,
    ThumbnailHalf,
    ClipId,
    WallClock,
    ModelId,
    RefinerId,
    RefinerStart,
    UpscalerId,
    Prompt,
    NegativePrompt,
    StartWidth,
    StartHeight,
    Seed,
    Strength,
    Steps,
    GuidanceScale,
    Shift,
    Sampler,
    HiresFix,
    TiledDecoding,
    TiledDiffusion,
    TeaCache,
    CfgZeroStar,
    HasMask,
    HasDepth,
    HasPose,
    HasColor,
    HasCustom,
    HasScribble,
    HasShuffle,
}

#[derive(Iden)]
enum ImageControls {
    Table,
    ImageId,
    ControlId,
    Weight,
}

#[derive(Iden)]
enum ImageLoras {
    Table,
    ImageId,
    LoraId,
    Weight,
}

#[derive(Iden)]
enum WatchFolders {
    Table,
    Id,
    Path,
    Recursive,
    ItemType,
    LastUpdated,
}
