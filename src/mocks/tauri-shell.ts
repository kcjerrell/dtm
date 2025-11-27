export const open = async () => {};
export class Command {
  static sidecar() {
    return new Command();
  }
  async execute() {
    return { stdout: "", stderr: "" };
  }
}
