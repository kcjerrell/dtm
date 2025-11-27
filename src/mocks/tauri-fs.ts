export const exists = async () => true;
export const mkdir = async () => {};
export const writeFile = async () => {};
export const readFile = async () => new Uint8Array();
export const remove = async () => {};
export const copyFile = async () => {};
export const stat = async () => ({
  size: 1000,
  mtime: new Date(),
  isDirectory: () => false,
  isFile: () => true,
  isSymlink: () => false,
});

export const readDir = async (path: string) => {
  console.log(`[Mock] readDir: ${path}`);
  return [];
};

export const watch = async (path: string, cb: (event: any) => void, options?: any) => {
  console.log(`[Mock] watch: ${path}`, options);
  return () => {
    console.log(`[Mock] unwatch: ${path}`);
  };
};

export const writeTextFile = async (path: string, contents: string) => {
  console.log(`[Mock] writeTextFile: ${path}`);
};
