import { proxy } from "valtio";

/**
 * Mock implementation of @tauri-store/valtio's `store` function.
 * It creates a proxied state and provides a `start` method to match the real API.
 * The generic type `T` represents the shape of the store's state.
 */
export function store<T extends object>(
  name: string,
  initialState: T,
  _options?: unknown
): { state: T; start: () => Promise<void> } {
  console.log(`[Mock] Creating store: ${name}`);
  return {
    state: proxy(initialState) as T,
    start: async () => {}
  };
}

