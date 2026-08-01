import { Plugin } from "obsidian";
import { monsterTomlHighlight } from "./editor";
import { renderStatBlock } from "./render";

const DEFAULT_SETTINGS = {} as const;

export default class StatBlocksPlugin extends Plugin {
  declare settings: typeof DEFAULT_SETTINGS;

  override async onload() {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor("monster", (source, el, ctx) => {
      renderStatBlock(this.app, el, ctx, source);
    });

    this.registerEditorExtension(monsterTomlHighlight);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}