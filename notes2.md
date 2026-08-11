├── public - front end images
├── scripts - various scripts
├── src
│   ├── commands - invoke wrappers for tauri commands
│   ├── components - shared react components
│   │   ├── icons - icon barrel exports and custom icons
│   │   ├── measureGrid - self measuring grid component and hook 
│   │   ├── preview - full screen zoomable image preview
│   │   ├── sidebar - sidebar components
│   │   ├── ui - chakra ui recipes
│   │   ├── video - video related components
│   │   └── virtualizedList - virtualized image grid and item source class
│   ├── dtProjects - for the dt projects browser feature (projects view)
│   │   ├── controlPane - the projects view sidebar (project list and search)
│   │   │   ├── filters - search filter components
│   │   │   └── projectsPanel - projects list components
│   │   ├── detailsOverlay - image details view 
│   │   ├── dialog - dialog components
│   │   │   ├── clipExport - components for video/frames export dialog
│   │   │   └── projectExport - components for project export dialog
│   │   ├── explorer - dev only views of a dtproject
│   │   ├── imagesList - the project browser image grid components
│   │   ├── settingsPanel - The settings dialog
│   │   ├── state - state management
│   │   └── util - util functions and types
│   ├── hooks - shared react hooks
│   ├── metadata - for the metadata feature (metadata view)
│   │   ├── components - media display coponents
│   │   ├── history - history tab bar
│   │   ├── infoPanel - details pane
│   │   ├── state - state management
│   │   └── toolbar - toolabr components and buttons
│   ├── mocks - unused
│   ├── scratch - various templates and views for testing features
│   ├── state - global app state
│   ├── theme - chakra ui theme
│   └── utils - utility functions
│       └── container - container and state controller base classes
├── src-tauri
│   ├── capabilities
│   ├── entity - data model for the projectsdb 
│   ├── fpzip-sys - vendored library
│   ├── macros - implementation for dtm_command and dtp_command
│   ├── migration - projectsdb migrations
│   ├── src
│   │   ├── bookmarks - apple security scoped bookmark implementation
│   │   ├── clipboard - clipboard utilities
│   │   ├── dt_project - provides access to individual dtprojects and data
│   │   │   └── data - rust structs representing the dt project flatbuffer columns
│   │   ├── dtp_service - state, services and tauri commands for the projects browser backend
│   │   │   └── jobs - implementations of various background jobs related to project management
│   │   │   ├── fbs - generated code for reading flatbuffers columns in the dtprojects
│   │   ├── objc - objc code for mac folder picker
│   │   ├── projects_db - poorly named, bundles the projects db and dtprojects
│   │   │   ├── dtos - data transfer objects, being upgraded to resource accessors
│   │   │   ├── projects_db - manages and provides access to the projectsdb database
│   │   │   └── tensor_history_mod - contains lora and control structs. should be moved.
│   │   └── util - various utility types
│   ├── test_data
│   │   ├── projects
│   │   └── temp
│   │       └── app_data_dir
│   └── tests
│       └── common
├── test
│   ├── artifacts
│   │   └── screenshots
│   ├── pageobjects
│   ├── specs
│   └── util
└── test_data
    ├── ffmpeg
    ├── projects
    └── temp
        ├── folder-a
        ├── folder-b
        ├── md
        └── project-export-out


### Important types:

#### TensorHistoryNode
  - this *should* represent the actual row in the project file, but has been used inconsistently
  - rust: struct TensorHistoryNode (src-tauri/src/dt_project/tensor_history_node.rs)
    - contains fields for each column, optional fields for commonly joined data, and a handful of
      helper methods. Also adds a field for the project path
  - web: type TensorHistoryNodeResponse (src/commands/DTProjectTypes.ts)
    - the json representation of a TensorHistoryNode received from the backend
  - web: class TensorHistoryNode (src/commands/DTProjectTypes.ts)
    - initialized with the TensorHistoryNodeResponse object. Adds a field for the project id if it
      was used to fetch the node. Adds helper methods for pulling out commonly used data from the
      response

#### TensorHistoryNodeData
  - this represents the flatbuffer data stored in TensorHistoryNode. Although it contains fields
    for prompts and associated tensor ids, these are not populated consistently over time due to
    changes in the fbs and db schema. The TensorHistoryNode type (both in rust and web) adds
    helpers to get this data whether its contained in this type, tensordata or legacy prompts
  - rust: struct TensorHistoryNodeData (src-tauri/src/dt_project/data/tensor_history_node_data.rs)
  - web: type TensorHistoryNodeData (src/commands/DTProjectTypes.ts)

#### GenerationConfiguration
  - this type is not used directly by this project, but is the flatbuffer used by the grpc server.
    For the most part, it is a subet of TensorHistoryNodeData, with exception of id, name, and
    batch_count

#### Config/V2
  - closely related to GenerationConfiguration, this represents the JSON config object that DT can
    import/export. It is a subset of TensorHistoryNodeData, with some field types changed.

#### Image Metadata
  - this is the top level type included in image metadata written, and imported, by DT. It seems to
    contain the most important config fields, but the included fields are not always consistent. It
    carries the prompts, model, loras, cnets, profile info, as well as the v2 config.

It is important that these types are updated and kept in sync when new fields are added to the 
official flatbuffer schema. This can't be handled automatically, since sometimes the new fields 
use string in Config/V2 and enum(u8) in the flatbuffer.

In this project, the full config should be refered to as V2Config or Config, and should include
every value in the flatbuffer schema except for id and name (which are used by the grpc server) and
batch_count (which is used by the DT app).

'DTConfig' or 'Config' however should be used to describe the JS/JSON object that can be imported or
exported from DT. It doesn't necessarily include every property from the V2Config, since many
properties do not have an effect on one particular gen. It should however always include model,
steps, guidance, sampler, seed, shift, width, and height. Any other fields can (and maybe should?)
be excluded.

Every field should have a default value, and creating a V2Config from a DTConfig should use these.

Obviously this only makes sense from JS - since it has truly optional fields.

And if it should come up, a PartialConfig refers to JS/JSON object with as little as 1 field.
These are commonly used as combinators to apply specific settings, particularly outside of the
range accepted by the DT UI, for example: { shift: 20.0 }