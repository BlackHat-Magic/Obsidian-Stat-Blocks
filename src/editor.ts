import { StringStream } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { EditorState, EditorSelection, Extension, Prec, RangeSetBuilder, StateField, Text, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { App, MarkdownRenderChild, editorInfoField, editorLivePreviewField } from "obsidian";
import { renderStatBlockInto } from "./render";

const STREAM_PARSER = toml as unknown as {
  startState?: (indentUnit: number) => unknown;
  token: (stream: StringStream, state: unknown) => string | null;
};

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*monster\s*$/i;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

/** Map legacy-mode token style names to the `tok-*` classes that Obsidian's
 *  built-in syntax-highlight theme styles (the same classes its `toml` code
 *  blocks use), so the raw view inherits the vault's TOML coloring. */
const STYLE_CLASS: Record<string, string> = {
  comment: "tok-comment",
  string: "tok-string",
  number: "tok-number",
  property: "tok-propertyName",
  atom: "tok-atom",
  bracket: "tok-punctuation",
  operator: "tok-operator",
};

interface BlockRange {
  blockFrom: number;
  blockTo: number;
  contentFrom: number;
  contentTo: number;
}

interface BlockInfo extends BlockRange {
  source: string;
}

/** Single source of truth: scan the doc for `monster` fenced blocks. */
function* iterMonsterBlocks(doc: Text): Generator<BlockRange> {
  let openLine = -1;
  const n = doc.lines;
  for (let i = 1; i <= n; i++) {
    const line = doc.line(i);
    if (openLine < 0) {
      if (FENCE_OPEN.test(line.text)) openLine = i;
    } else if (FENCE_CLOSE.test(line.text)) {
      const open = doc.line(openLine);
      yield {
        blockFrom: open.from,
        blockTo: line.to,
        contentFrom: open.to + 1,
        contentTo: line.from,
      };
      openLine = -1;
    }
  }
}

function selectionOverlaps(state: { selection: EditorSelection }, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true;
  }
  return false;
}

/** Tokenize a block's content with the TOML stream parser and emit mark
 *  decorations carrying the `tok-*` classes. State is carried across lines so
 *  multiline strings/arrays highlight correctly. */
function tomlMarkDecorations(builder: RangeSetBuilder<Decoration>, info: BlockInfo, tabSize: number): void {
  const state = STREAM_PARSER.startState ? STREAM_PARSER.startState(2) : ({} as unknown);
  const doc = info.source;
  const lines = doc.split("\n");
  let offset = info.contentFrom;
  for (const text of lines) {
    if (text !== "") {
      const stream = new StringStream(text, tabSize, 2);
      let guard = 0;
      while (!stream.eol() && guard++ < 1000) {
        stream.start = stream.pos;
        const style = STREAM_PARSER.token(stream, state);
        if (stream.pos === stream.start) {
          stream.pos++;
          continue;
        }
        if (style) {
          const cls = style
            .split(/\s+/)
            .map((s) => STYLE_CLASS[s])
            .filter(Boolean)
            .join(" ");
          if (cls) builder.add(offset + stream.start, offset + stream.pos, Decoration.mark({ class: cls }));
        }
      }
    }
    offset += text.length + 1; // +1 for the newline
  }
}

class StatBlockWidget extends WidgetType {
  private child: MarkdownRenderChild | null = null;
  constructor(
    private readonly app: App,
    private readonly info: BlockInfo,
    private readonly filePath: string,
  ) {
    super();
  }

  override eq(other: StatBlockWidget): boolean {
    return this.info.source === other.info.source && this.filePath === other.filePath;
  }

  override toDOM(_view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "stat-block-container stat-block-container--live";
    this.child = new MarkdownRenderChild(container);
    renderStatBlockInto(this.app, container, this.info.source, this.filePath, this.child);
    return container;
  }

  override updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    if (this.child) this.child.unload();
    this.child = new MarkdownRenderChild(dom);
    renderStatBlockInto(this.app, dom, this.info.source, this.filePath, this.child);
    return true;
  }

  override destroy(_dom: HTMLElement): void {
    if (this.child) {
      this.child.unload();
      this.child = null;
    }
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  if (!state.field(editorLivePreviewField, false)) return Decoration.none;

  const fileInfo = state.field(editorInfoField, false);
  const app = fileInfo?.app;
  const filePath = fileInfo?.file?.path ?? "";

  const builder = new RangeSetBuilder<Decoration>();
  const tabSize = state.tabSize;

  for (const range of iterMonsterBlocks(state.doc)) {
    const source = state.doc.sliceString(range.contentFrom, range.contentTo);
    const info: BlockInfo = { ...range, source };

    if (app && !selectionOverlaps(state, range.blockFrom, range.blockTo)) {
      // Cursor outside: replace the whole fenced block with a rendered widget.
      builder.add(
        range.blockFrom,
        range.blockTo,
        Decoration.replace({ widget: new StatBlockWidget(app, info, filePath), block: true }),
      );
    } else {
      // Cursor inside: show raw source, but add TOML syntax-highlight marks.
      tomlMarkDecorations(builder, info, tabSize);
    }
  }

  return builder.finish();
}

export const monsterStatBlockField: Extension = Prec.highest(
  StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state);
    },
    update(decorations: DecorationSet, tr: Transaction): DecorationSet {
      const liveChanged =
        tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false);
      if (tr.docChanged || tr.selection !== undefined || liveChanged) {
        return buildDecorations(tr.state);
      }
      return decorations.map(tr.changes);
    },
    provide(field: StateField<DecorationSet>): Extension {
      return EditorView.decorations.from(field);
    },
  }),
);

// (Text is used in iterMonsterBlocks's signature.)