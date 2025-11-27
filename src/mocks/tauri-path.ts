export const appDataDir = async () => "/mock/app-data";
export const join = async (...args: string[]) => args.join("/");
export const basename = async (path: string) => path.split("/").pop();
export const extname = async (path: string) => {
  const parts = path.split(".");
  return parts.length > 1 ? "." + parts.pop() : "";
};
export const homeDir = async () => "/mock/home";
