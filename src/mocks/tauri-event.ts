export const listen = async (event: string, handler: (event: any) => void) => {
  console.log(`[Mock] listen: ${event}`);
  return () => {
    console.log(`[Mock] unlisten: ${event}`);
  };
};

export const emit = async (event: string, payload?: any) => {
  console.log(`[Mock] emit: ${event}`, payload);
};
