import { afterAll } from "vitest";

describe('Test setup', () => {
  it('should be cordial', async () => {
    console.log("hello")
    await new Promise(resolve => setTimeout(resolve, 9999))
  });
});