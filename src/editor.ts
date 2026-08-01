import { StringStream } from "@codemirror/language";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Range } from "@codemirror/state";

interface StreamParserLike {
  startState?: (indentUnit: number) => unknown;
  token: (stream: StringStream, state: unknown) => string | null;
}

const STREAM_PARSER = toml as unknown as StreamParserLike;

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*monster\s*$/i;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

function classFor(style: string): string {
  return style
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => `tok-${s}`)
    .join(" ");
}

function buildDecorations(view: EditorView): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const tabSize = view.state.tabSize;
  const doc = view.state.doc;
  const lineCount = doc.lines;

  for (let lineNo = 1; lineNo <= lineCount; lineNo++) {
    const line = doc.line(lineNo);
    if (!FENCE_OPEN.test(line.text)) continue;
    // Find closing fence
    const blockLines: { from: number; text: string }[] = [];
    let end = lineNo + 1;
    for (; end <= lineCount; end++) {
      const l = doc.line(end);
      if (FENCE_CLOSE.test(l.text) && end !== lineNo) break;
      blockLines.push({ from: l.from, text: l.text });
    }

    // Tokenize block content with persistent TOML state.
    const state = STREAM_PARSER.startState ? STREAM_PARSER.startState(2) : ({} as unknown);
    for (const { from, text } of blockLines) {
      if (text === "") continue;
      const stream = new StringStream(text, tabSize, 2);
      let guard = 0;
      while (!stream.eol() && guard++ < 1000) {
        const style = STREAM_PARSER.token(stream, state);
        if (stream.pos === stream.start) {
          stream.next();
          stream.start = stream.pos;
          continue;
        }
        if (style) {
          const cls = classFor(style);
          if (cls) decos.push(Decoration.mark({ class: cls }).range(from + stream.start, from + stream.pos));
        }
        stream.start = stream.pos;
      }
    }
  }

  return Decoration.set(decos, true);
}

export const monsterTomlHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);