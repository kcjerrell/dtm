# DTM - Draw Things Metadata Manager

**DTM** is a powerful desktop application for managing and exploring AI-generated images from Draw Things. Built with Tauri, React, and Rust, it provides two specialized tools for working with your AI art: the **Metadata Tool** and the **DT Projects Tool**.

---

## 🎨 Metadata Tool

The Metadata Tool is designed for quick inspection and analysis of individual images, with a focus on extracting and displaying Draw Things generation parameters.

### Key Features

#### 📸 Image Loading & Management
- **Drag & Drop Support**: Simply drag images into the application
- **Clipboard Integration**: Paste images directly from your clipboard
- **File Browser**: Open images through the traditional file dialog
- **Multi-Image History**: Keep track of recently viewed images with a visual history panel
- **Pin System**: Pin important images to keep them accessible across sessions

#### 🔍 Metadata Extraction & Display
- **Automatic Detection**: Instantly recognizes Draw Things metadata embedded in images
- **Dual View Tabs**:
  - **Details Tab**: Shows comprehensive EXIF data, file information, and technical metadata
  - **Config Tab**: Displays all Draw Things generation parameters in an organized, readable format
- **Draw Things Parameters**: View complete generation settings including:
  - Prompt and negative prompt
  - Model, LoRA, and control net information
  - Sampler, steps, guidance scale, and seed
  - Image dimensions and advanced settings
  - Batch configuration and aesthetic scores
  - Stage 2 settings, upscaler details, and more

#### 🖼️ Image Viewing
- **Zoom & Pan**: Interactive image viewer with smooth zoom controls
- **Full Preview Mode**: Expand images to full screen for detailed inspection
- **Responsive Layout**: Adjustable panel sizes for optimal viewing

#### ⚙️ User Interface
- **Dark/Light Mode**: Toggle between color schemes
- **Adjustable Font Size**: Customize text size for better readability
- **Collapsible Sections**: Expand or collapse metadata sections as needed
- **Persistent State**: Your view preferences are saved between sessions

---

## 📁 DT Projects Tool

The DT Projects Tool is a comprehensive project browser and search engine for your entire Draw Things project library. It provides powerful filtering and exploration capabilities across all your generated images.

### Key Features

#### 🗂️ Project Management
- **Automatic Project Discovery**: Scans and indexes all Draw Things projects in your library
- **Project Statistics**: View image count, total file size, and modification dates
- **Project Selection**: Select multiple projects to filter your search scope
- **Exclude Projects**: Hide projects you don't want to see in searches
- **Real-time Scanning**: Projects are automatically updated when changes are detected
- **Empty Project Toggle**: Show or hide projects with no images matching current filters

#### 🔎 Advanced Search & Filtering
The search system provides powerful filtering capabilities across multiple dimensions:

**Filter Types**:
- **Text Search**: Full-text search across prompts and metadata
- **Model Filters**: Filter by specific AI models used
- **LoRA Filters**: Find images using specific LoRA models
- **Control Net Filters**: Filter by control net types (pose, depth, scribble, etc.)
- **Sampler Filters**: Filter by sampling method
- **Content Filters**: Find images with specific content types (masks, depth maps, poses, etc.)
- **Refiner Filters**: Filter by refiner model usage

**Filter Operators**:
- **Equals/Not Equals**: Exact matching
- **Greater Than/Less Than**: Numerical comparisons
- **Contains/Does Not Contain**: Partial text matching
- **Has/Does Not Have**: Existence checks for content types

**Multi-Filter Support**:
- Combine multiple filters for precise searches
- Add or remove filters dynamically
- Clear all filters with one click

#### 🖼️ Image Grid & Details
- **Virtualized Grid**: Smooth scrolling through thousands of images
- **Adjustable Thumbnail Size**: Customize grid density
- **Image Details Overlay**: Click any image to see:
  - Full-resolution preview
  - Complete generation parameters
  - Tensor history and lineage
  - Related images (canvas, masks, control nets)
  - Predecessor candidates (images that may have been used as input)
- **Thumbnail Navigation**: Browse through related tensors and variations
- **Export Options**: Save images or send them to the Metadata Tool for detailed analysis

#### 📊 Status & Indicators
- **Search Indicators**: Visual badges showing active filters and search terms
- **Selected Projects Badge**: Shows how many projects are currently selected
- **Image Count**: Real-time count of images matching current filters
- **Loading States**: Visual feedback during scanning and loading operations

#### ⚡ Performance
- **Efficient Database**: Fast SQLite-based indexing for instant searches
- **Lazy Loading**: Images load on-demand as you scroll
- **Background Scanning**: Project updates happen in the background
- **Optimized Thumbnails**: Multiple thumbnail sizes for performance

---

## 🎯 Use Cases

### For the Metadata Tool:
- **Quick Parameter Check**: Instantly see what settings were used to generate an image
- **Comparison**: Keep multiple images pinned to compare their generation parameters
- **Learning**: Study successful generations to understand what settings work best
- **Troubleshooting**: Verify that images contain the expected metadata

### For the DT Projects Tool:
- **Project Organization**: Browse your entire Draw Things library in one place
- **Find Specific Generations**: Use advanced filters to locate images by model, LoRA, or other parameters
- **Explore Variations**: See the complete generation history and related images
- **Bulk Analysis**: Get statistics across your entire project collection
- **Workflow Integration**: Quickly find and export images for further work

---

## 🛠️ Technical Stack

- **Frontend**: React 19, Chakra UI 3, Motion (Framer Motion)
- **Backend**: Tauri 2, Rust
- **Database**: SQLite with SeaORM
- **State Management**: Valtio
- **Build Tool**: Vite

---

## 🚀 Getting Started

1. **Launch the Application**: Start DTM from your applications folder
2. **Choose Your Tool**: 
   - Select "Metadata" from the sidebar for single-image analysis
   - Select "Projects" from the sidebar for project browsing
3. **For Metadata Tool**: Drag an image or paste from clipboard
4. **For Projects Tool**: 
   - Go to Settings tab to add your Draw Things projects folder
   - Wait for initial scanning to complete
   - Start searching and exploring!

---

## 💡 Tips

- **Metadata Tool**: Use the pin feature to keep reference images accessible while you work
- **Projects Tool**: Combine multiple filters to narrow down exactly what you're looking for
- **Both Tools**: Adjust font size and color mode to match your preferences
- **Projects Tool**: Use the "Show Empty Projects" toggle when filtering to see which projects have matching images

---

## 📝 Notes

- The application automatically saves your preferences and state
- Project scanning happens in the background and updates automatically
- All metadata is read-only; the application never modifies your original files
- Images are cached locally for fast access
