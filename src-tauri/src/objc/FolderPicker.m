#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>

// Global dictionary to track active security-scoped bookmarks
// Key: Base64 string of the bookmark data
// Value: NSURL object
static NSMutableDictionary<NSString *, NSURL *> *activeBookmarks = nil;

void ensure_bookmarks_initialized() {
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        activeBookmarks = [NSMutableDictionary dictionary];
    });
}

const char* open_dt_folder_picker(const char* default_path) {
    __block char* resultString = NULL;
    
    // Ensure we handle the C string safely
    NSString *defaultPathStr = default_path ? [NSString stringWithUTF8String:default_path] : nil;
    
    // NSOpenPanel must be run on the main thread
    dispatch_sync(dispatch_get_main_queue(), ^{
        NSOpenPanel *openPanel = [NSOpenPanel openPanel];
        openPanel.canChooseDirectories = YES;
        openPanel.canChooseFiles = NO;
        openPanel.allowsMultipleSelection = NO;
        openPanel.prompt = @"Select Documents folder";
        
        if (defaultPathStr) {
            openPanel.directoryURL = [NSURL fileURLWithPath:defaultPathStr];
        } else {
            NSURL *homeDir = [NSFileManager defaultManager].homeDirectoryForCurrentUser;
            NSURL *suggestion = [homeDir URLByAppendingPathComponent:@"Library/Containers/com.liuliu.draw-things/Data/Documents"];
            openPanel.directoryURL = suggestion;
        }
        
        if ([openPanel runModal] == NSModalResponseOK) {
            NSURL *url = openPanel.URL;
            if (url) {
                NSError *error = nil;
                NSData *bookmarkData = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope
                                     includingResourceValuesForKeys:nil
                                                      relativeToURL:nil
                                                              error:&error];
                
                if (bookmarkData) {
                    NSString *base64String = [bookmarkData base64EncodedStringWithOptions:0];
                    NSString *path = url.path;
                    NSString *result = [NSString stringWithFormat:@"%@|%@", path, base64String];
                    resultString = strdup([result UTF8String]);
                } else {
                    NSLog(@"Failed to create bookmark: %@", error);
                }
            }
        }
    });
    
    return resultString;
}

void free_string_ptr(char* ptr) {
    if (ptr) {
        free(ptr);
    }
}

const char* start_accessing_security_scoped_resource(const char* bookmark_base64) {
    if (!bookmark_base64) return NULL;
    
    ensure_bookmarks_initialized();
    
    NSString *base64String = [NSString stringWithUTF8String:bookmark_base64];
    if (!base64String) return NULL;
    
    // Check if we already have this bookmark active
    // Note: In Swift we used the base64 string as the key. We do the same here.
    @synchronized(activeBookmarks) {
        NSURL *existingUrl = activeBookmarks[base64String];
        if (existingUrl) {
            return strdup([existingUrl.path UTF8String]);
        }
    }
    
    NSData *data = [[NSData alloc] initWithBase64EncodedString:base64String options:0];
    if (!data) return NULL;
    
    BOOL isStale = NO;
    NSError *error = nil;
    NSURL *url = [NSURL URLByResolvingBookmarkData:data
                                           options:NSURLBookmarkResolutionWithSecurityScope
                                     relativeToURL:nil
                               bookmarkDataIsStale:&isStale
                                             error:&error];
    
    if (isStale) {
        NSLog(@"Bookmark is stale");
    }
    
    if (url) {
        if ([url startAccessingSecurityScopedResource]) {
            @synchronized(activeBookmarks) {
                activeBookmarks[base64String] = url;
            }
            return strdup([url.path UTF8String]);
        } else {
            NSLog(@"Failed to start accessing security scoped resource");
            return NULL;
        }
    } else {
        NSLog(@"Error resolving bookmark: %@", error);
        return NULL;
    }
}

void stop_accessing_security_scoped_resource(const char* bookmark_base64) {
    if (!bookmark_base64) return;
    
    ensure_bookmarks_initialized();
    
    NSString *base64String = [NSString stringWithUTF8String:bookmark_base64];
    if (!base64String) return;
    
    NSURL *url = nil;
    @synchronized(activeBookmarks) {
        url = activeBookmarks[base64String];
        if (url) {
            [activeBookmarks removeObjectForKey:base64String];
        }
    }
    
    if (url) {
        [url stopAccessingSecurityScopedResource];
    }
}

void stop_all_security_scoped_resources() {
    ensure_bookmarks_initialized();
    
    @synchronized(activeBookmarks) {
        for (NSURL *url in [activeBookmarks allValues]) {
            [url stopAccessingSecurityScopedResource];
        }
        [activeBookmarks removeAllObjects];
    }
}
