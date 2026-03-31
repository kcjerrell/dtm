import path from "path";
import fse from "fs-extra";
import { getTestDataRootDir } from "./paths";

export function getFile(filename: string, checkExists = true) {
	const filePath = path.join(getTestDataRootDir(), filename);
	if (checkExists && !fse.pathExistsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}
	return filePath;
}
