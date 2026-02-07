const updateAvailable = true

export const check = async () => {
    // Mock an update being available
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (!updateAvailable) return null

    return {
        version: "1.0.1",
        date: new Date().toISOString(),
        body: "Mock update for testing",

        download: async (onProgress?: (chunkLength: number, contentLength?: number) => void) => {
            // Simulate download with progress
            const totalSize = 10_000_000 // 10MB mock size
            const chunkSize = 500_000 // 500KB chunks
            let downloaded = 0

            while (downloaded < totalSize) {
                await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate network delay
                downloaded += chunkSize
                if (onProgress) {
                    onProgress(chunkSize, totalSize)
                }
            }
        },

        install: async () => {
            // Simulate installation time
            await new Promise((resolve) => setTimeout(resolve, 1000))
            console.log("Mock update installed")
        },
    }
}
