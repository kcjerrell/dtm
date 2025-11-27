export class MenuItem {
  static async new(opts: any) {
    return new MenuItem();
  }
}

export class PredefinedMenuItem {
  static async new(opts: any) {
    return new PredefinedMenuItem();
  }
}

export class CheckMenuItem {
  static async new(opts: any) {
    return new CheckMenuItem();
  }
}

export class Submenu {
  static async new(opts: any) {
    return new Submenu();
  }
}

export class Menu {
  static async new(opts: any) {
    return new Menu();
  }
  async setAsAppMenu() {
    console.log("[Mock] setAsAppMenu");
  }
}

export type AboutMetadata = any;
