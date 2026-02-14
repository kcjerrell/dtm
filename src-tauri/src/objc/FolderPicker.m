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

const char* open_dt_folder_picker(const char* default_path, const char* button_text) {
    __block char* resultString = NULL;
    
    // Ensure we handle the C string safely
    NSString *defaultPathStr = default_path ? [NSString stringWithUTF8String:default_path] : nil;
    NSString *buttonTextStr = button_text ? [NSString stringWithUTF8String:button_text] : nil;
    
    // NSOpenPanel must be run on the main thread
    dispatch_sync(dispatch_get_main_queue(), ^{
        NSOpenPanel *openPanel = [NSOpenPanel openPanel];
        openPanel.canChooseDirectories = YES;
        openPanel.canChooseFiles = NO;
        openPanel.allowsMultipleSelection = NO;
        openPanel.prompt = buttonTextStr ?: @"Select folder";
        
        if (defaultPathStr) {
            openPanel.directoryURL = [NSURL fileURLWithPath:defaultPathStr];
        } else {
            NSURL *homeDir = [NSFileManager defaultManager].homeDirectoryForCurrentUser;
            openPanel.directoryURL = homeDir;
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
                    
                    // JSON format: {"path": "...", "bookmark": "..."}
                    // We need to escape backslashes and quotes in path if necessary (standard JSON rules)
                    // For simplicity in ObjC without a JSON lib, we can use NSJSONSerialization
                    
                    NSDictionary *dict = @{
                        @"path": path,
                        @"bookmark": base64String
                    };
                    
                    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:dict options:0 error:&error];
                    if (jsonData) {
                        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
                        resultString = strdup([jsonString UTF8String]);
                    } else {
                         NSLog(@"Failed to serialize JSON: %@", error);
                    }

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
    @synchronized(activeBookmarks) {
        NSURL *existingUrl = activeBookmarks[base64String];
        if (existingUrl) {
            NSDictionary *dict = @{
                @"status": @"resolved",
                @"path": existingUrl.path
            };
            NSData *jsonData = [NSJSONSerialization dataWithJSONObject:dict options:0 error:nil];
            if (jsonData) {
                NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
                return strdup([jsonString UTF8String]);
            }
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
    
    if (url) {
        if ([url startAccessingSecurityScopedResource]) {
            NSString *status = @"resolved";
            NSString *newBookmarkBase64 = nil;

            if (isStale) {
                NSLog(@"Bookmark is stale, refreshing...");
                NSData *newBookmarkData = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope
                                        includingResourceValuesForKeys:nil
                                                         relativeToURL:nil
                                                                 error:&error];
                if (newBookmarkData) {
                    newBookmarkBase64 = [newBookmarkData base64EncodedStringWithOptions:0];
                    status = @"stale_refreshed";
                } else {
                    NSLog(@"Failed to refresh stale bookmark: %@", error);
                }
            }

            @synchronized(activeBookmarks) {
                activeBookmarks[base64String] = url;
            }

            NSMutableDictionary *resultDict = [NSMutableDictionary dictionaryWithDictionary:@{
                @"status": status,
                @"path": url.path
            }];
            if (newBookmarkBase64) {
                resultDict[@"new_bookmark"] = newBookmarkBase64;
            }

            NSData *jsonData = [NSJSONSerialization dataWithJSONObject:resultDict options:0 error:&error];
            if (jsonData) {
                NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
                return strdup([jsonString UTF8String]);
            }
        } else {
            NSLog(@"Failed to start accessing security scoped resource");
        }
    } else {
        NSLog(@"Error resolving bookmark: %@", error);
    }
    
    return NULL;
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
