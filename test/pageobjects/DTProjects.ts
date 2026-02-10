import fse from "fs-extra"

class DTProjects {
    get projectA() { return $('[data-test-id="project-item"]*=test-project-a') }
    get projectB() { return $('[data-test-id="project-item"]*=test-project-b') }

    get images() { return $$('[data-testid="image-item"]') }

    getProject(projectName: string) {
        return $(`[data-test-id="project-item"]*=${projectName}`)
    }

    getProjectId(projectName: string) {
        return this.getProject(projectName).getAttribute("data-project-id")
    }

    async selectProject(projectName: string) {
        await this.getProject(projectName).click()
        await expect(this.getProject(projectName)).toHaveAttribute("aria-selected", "true")
    }

    async deselectProject(projectName: string) {
        await this.getProject(projectName).click()
        await expect(this.getProject(projectName)).toHaveAttribute("aria-selected", "false")
    }

    async countVisibleImages() {
        return (await this.images).length
    }

    helpers = {
        checkProjectFiles: async () => {
            // check that all files in TEST_DATA_STORAGE are also in DTP_TEST_DIR
            // if not, copy them
            const testDataStorage = process.env.TEST_DATA_STORAGE
            const dtpTestDir = process.env.DTP_TEST_DIR

            if (!testDataStorage || !dtpTestDir) {
                throw new Error('TEST_DATA_STORAGE and DTP_TEST_DIR environment variables must be set')
            }

            await fse.ensureDir(dtpTestDir)
            const files = await fse.readdir(testDataStorage, { recursive: true })

            for (const file of files) {
                const srcPath = `${testDataStorage}${file}`
                const destPath = `${dtpTestDir}${file}`
                const destExists = await fse.pathExists(destPath)

                if (!destExists) {
                    await fse.copy(srcPath, destPath)
                }
            }
        },

        removeProjectFiles: async (projectName: string) => {
            // remove files for the given project from DTP_TEST_DIR
            // remove both .sqlite3 and .sqlite3-shm and .sqlite3-wal if they exist
            const dtpTestDir = process.env.DTP_TEST_DIR

            if (!dtpTestDir) {
                throw new Error('DTP_TEST_DIR environment variable must be set')
            }

            const extensions = ['.sqlite3', '.sqlite3-shm', '.sqlite3-wal']

            for (const ext of extensions) {
                const filePath = `${dtpTestDir}/projects/${projectName}${ext}`
                await fse.remove(filePath)
            }
        },

        renameProjectFiles: async (oldName: string, newName: string) => {
            // rename project files in DTP_TEST_DIR from oldName to newName
            // rename both .sqlite3 and .sqlite3-shm and .sqlite3-wal if they exist
            const dtpTestDir = process.env.DTP_TEST_DIR

            if (!dtpTestDir) {
                throw new Error('DTP_TEST_DIR environment variable must be set')
            }

            const extensions = ['.sqlite3', '.sqlite3-shm', '.sqlite3-wal']

            for (const ext of extensions) {
                const oldPath = `${dtpTestDir}/projects/${oldName}${ext}`
                const newPath = `${dtpTestDir}/projects/${newName}${ext}`
                const exists = await fse.pathExists(oldPath)

                if (exists) {
                    await fse.rename(oldPath, newPath)
                }
            }
        }
    }
}

export default new DTProjects()