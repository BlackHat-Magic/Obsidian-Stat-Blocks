import { Plugin } from "obsidian";

const DEFAULT_SETTINGS = {} as const;

export default class StatBlocksPlugin extends Plugin {
  declare settings: typeof DEFAULT_SETTINGS;

  override async onload() {
    await this.loadSettings();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}