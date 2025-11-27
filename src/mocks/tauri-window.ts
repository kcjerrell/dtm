export const getCurrentWindow = () => ({
  onCloseRequested: async (cb: (event: any) => void) => {
    console.log("[Mock] onCloseRequested");
    return () => {};
  },
  hide: async () => {
    console.log("[Mock] Window hide");
  },
  destroy: async () => {
    console.log("[Mock] Window destroy");
  },
  show: async () => {
    console.log("[Mock] Window show");
  },
});
