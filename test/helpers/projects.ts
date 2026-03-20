import path from "path";
import fse from "fs-extra";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// helpers for manipulating projects in test data

// ./test_data/projects contains original files and should not be modified
// ./test_data/temp contains 'live' data for tests

const testDataProjectsDir = path.resolve(__dirname, "../../test_data/projects");
const testDataTempDir = path.resolve(__dirname, "../../test_data/temp");

export enum TestProject {
    projectA = 'test-project-a2',
    projectC = 'test-project-c-9',
    /** this is a variant of projectC with an added image */
    projectC2 = 'test-project-c-10' 
}

export enum TestFolder {
    folderA = 'folder-a',
    folderB = 'folder-b'
}

function getProjectPath(folder: TestFolder, project: string | TestProject) {
    return path.join(testDataTempDir, folder, `${project}.sqlite3`);
}

function getSourceProjectPath(project: TestProject) {
    return path.join(testDataProjectsDir, `${project}.sqlite3`);
}

// resets watchfolders to default state
export async function resetProjects() {
    const folderAPath = path.join(testDataTempDir, TestFolder.folderA);
    const folderBPath = path.join(testDataTempDir, TestFolder.folderB);

    await fse.emptyDir(folderAPath);
    await fse.emptyDir(folderBPath);

    // default projects for folder-a are test-project-a2 and test-project-c-9
    await addProject(TestFolder.folderA, TestProject.projectA);
    await addProject(TestFolder.folderA, TestProject.projectC);
}

export async function addProject(folder: TestFolder, project: TestProject) {
    const src = getSourceProjectPath(project);
    const dest = getProjectPath(folder, project);
    await fse.copy(src, dest);
}

export async function removeProject(folder: TestFolder, project: TestProject | string) {
    const base = path.join(testDataTempDir, folder, project as string);
    const files = [
        `${base}.sqlite3`,
        `${base}.sqlite3-shm`,
        `${base}.sqlite3-wal`
    ];

    for (const file of files) {
        if (await fse.pathExists(file)) {
            await fse.remove(file);
        } else {
            console.warn(`Warning: file ${file} does not exist and cannot be removed.`);
        }
    }
}

export async function replaceProject(folder: TestFolder, target: TestProject, replacement: TestProject) {
    // delete the -shm and -wal files for the target
    const targetBase = path.join(testDataTempDir, folder, target);
    await fse.remove(`${targetBase}.sqlite3-shm`);
    await fse.remove(`${targetBase}.sqlite3-wal`);

    // overwrite target .sqlite3 with replacement .sqlite3
    const src = getSourceProjectPath(replacement);
    const dest = getProjectPath(folder, target);
    await fse.copy(src, dest, { overwrite: true });
}

export async function renameProject(folder: TestFolder, project: TestProject | string, newName: string) {
    const oldBase = path.join(testDataTempDir, folder, project as string);
    const newBase = path.join(testDataTempDir, folder, newName);

    const extensions = ['.sqlite3', '.sqlite3-shm', '.sqlite3-wal'];

    for (const ext of extensions) {
        const oldFile = oldBase + ext;
        const newFile = newBase + ext;
        if (await fse.pathExists(oldFile)) {
            await fse.rename(oldFile, newFile);
        }
    }
}