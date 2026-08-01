import { Plugin } from "obsidian";
import { monsterStatBlockField } from "./editor";
import { renderStatBlock } from "./render";

const DEFAULT_SETTINGS = {} as const;

export default class StatBlocksPlugin extends Plugin {
  declare settings: typeof DEFAULT_SETTINGS;

  override async onload() {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor("monster", (source, el, ctx) => {
      renderStatBlock(this.app, el, ctx, source);
    });

    // Live Preview: replace `monster` fenced blocks with a rendered stat block
    // when the cursor is outside the block, and apply TOML syntax highlighting
    // (via Obsidian's `tok-*` theme classes) when the cursor is inside.
    this.registerEditorExtension(monsterStatBlockField);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}