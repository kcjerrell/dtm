kcjer@Kellys-MacBook-Pro dt-metadata % tree -d -I 'target|build|dist|node_modules|cargo'
.
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
│   │   ├── dtp_service - maintains state and services and tauri commands for the projects browser backend
│   │   │   └── jobs - implementations of various background jobs related to project management
│   │   ├── objc - objc code for mac folder picker
│   │   └── projects_db - poorly named, bundles the projects db and dtprojects
│   │       ├── dt_project - provides access to individual dtprojects and data
│   │       │   └── data - rust structs representing the dt project flatbuffer columns
│   │       ├── dtos - data transfer objects, being upgraded to resource accessors
│   │       ├── fbs - generataed code for reading flatbuffers columns in the dtprojects
│   │       ├── projects_db - manages and provides access to the projectsdb database
│   │       └── tensor_history_mod - contains lora and control structs. should be moved.
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

99 directories
kcjer@Kellys-MacBook-Pro dt-metadata % 