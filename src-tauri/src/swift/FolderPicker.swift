import Cocoa
import Foundation

@_cdecl("open_dt_folder_picker")
public func open_dt_folder_picker(defaultPath: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>? {
    var resultString: UnsafeMutablePointer<CChar>? = nil
    
    DispatchQueue.main.sync {
        let openPanel = NSOpenPanel()
        openPanel.canChooseDirectories = true
        openPanel.canChooseFiles = false
        openPanel.allowsMultipleSelection = false
        openPanel.prompt = "Select Draw Things Documents Folder"
        
        // Suggest the standard path or the provided default
        if let defaultPath = defaultPath,
           let pathString = String(validatingUTF8: defaultPath) {
            openPanel.directoryURL = URL(fileURLWithPath: pathString)
        } else {
            let homeDir = FileManager.default.homeDirectoryForCurrentUser
            let suggestion = homeDir.appendingPathComponent("Library/Containers/com.liuliu.draw-things/Data/Documents")
            openPanel.directoryURL = suggestion
        }

        if openPanel.runModal() == .OK {
            if let url = openPanel.url {
                do {
                    let bookmarkData = try url.bookmarkData(
                        options: .withSecurityScope,
                        includingResourceValuesForKeys: nil,
                        relativeTo: nil
                    )
                    
                    let base64String = bookmarkData.base64EncodedString()
                    let path = url.path
                    let result = "\(path)|\(base64String)"
                    resultString = strdup(result)
                } catch {
                    print("Failed to create bookmark: \(error)")
                }
            }
        }
    }
    
    return resultString
}

@_cdecl("free_string_ptr")
public func free_string_ptr(ptr: UnsafeMutablePointer<CChar>?) {
    guard let ptr = ptr else { return }
    free(ptr)
}

class BookmarkManager {
    static let shared = BookmarkManager()
    var activeBookmarks: [String: URL] = [:]
}

@_cdecl("start_accessing_security_scoped_resource")
public func start_accessing_security_scoped_resource(bookmarkBase64: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>? {
    guard let bookmarkBase64 = bookmarkBase64,
          let base64String = String(validatingUTF8: bookmarkBase64),
          let data = Data(base64Encoded: base64String) else {
        return nil
    }

    // Check if we are already accessing this bookmark (via simple string key lookup)
    // In a robust implementation, we might resolve first to check equality, but string key is sufficient for this simple cache.
    if let existingUrl = BookmarkManager.shared.activeBookmarks[base64String] {
         return strdup(existingUrl.path)
    }

    do {
        var isStale = false
        let url = try URL(resolvingBookmarkData: data,
                          options: .withSecurityScope,
                          relativeTo: nil,
                          bookmarkDataIsStale: &isStale)
        
        if isStale {
             print("Bookmark is stale")
             // In some cases we might want to re-save it, but for now we just proceed.
        }

        if url.startAccessingSecurityScopedResource() {
            BookmarkManager.shared.activeBookmarks[base64String] = url
            return strdup(url.path)
        } else {
            print("Failed to start accessing security scoped resource")
            return nil
        }
    } catch {
        print("Error resolving bookmark: \(error)")
        return nil
    }
}

@_cdecl("stop_all_security_scoped_resources")
public func stop_all_security_scoped_resources() {
    for (_, url) in BookmarkManager.shared.activeBookmarks {
        url.stopAccessingSecurityScopedResource()
    }
    BookmarkManager.shared.activeBookmarks.removeAll()
}
