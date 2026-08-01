import type { AbilityKey, Monster } from "./types";
import {
  abilityMods,
  attackMod,
  diceAverage,
  displayName,
  pluralName,
  saveDC,
  signed,
} from "./calc";

const ABILITY_RE = "(?:STR|DEX|CON|INT|WIS|CHA)";

function parseExtra(s: string): { value: number; raw: string } {
  if (!s) return { value: 0, raw: "" };
  const m = s.match(/^\s*([+\-])\s*(\d+)\s*$/);
  if (!m) return { value: 0, raw: "" };
  const v = Number(m[2]);
  return { value: m[1] === "-" ? -v : v, raw: `${m[1] === "-" ? "-" : "+"}${v}` };
}

function diceNotation(count: number, die: number, tail: string): string {
  return `${count}d${die}${tail}`;
}

function signedTail(n: number): string {
  return n > 0 ? ` + ${n}` : n < 0 ? ` - ${Math.abs(n)}` : "";
}

interface Token {
  raw: string;
  apply(m: Monster): string;
}

function parseToken(inner: string): Token | null {
  const t = inner.trim();
  if (t === "") return null;

  if (/^MON$/i.test(t)) return { raw: inner, apply: (m) => displayName(m) };
  if (/^MONS$/i.test(t)) return { raw: inner, apply: (m) => pluralName(m) };

  // ability ATK [+/- n]
  let c = t.match(new RegExp(`^${ABILITY_RE}\\s+ATK(\\s*[+\\-]\\s*\\d+)?$`, "i"));
  if (c) {
    const ability = c[0].split(/\s+/)[0].toLowerCase() as AbilityKey;
    const extra = parseExtra(c[1] ?? "");
    return {
      raw: inner,
      apply: (m) => signed(attackMod(m, ability) + extra.value),
    };
  }

  // ability SAVE [+/- n]
  c = t.match(new RegExp(`^${ABILITY_RE}\\s+SAVE(\\s*[+\\-]\\s*\\d+)?$`, "i"));
  if (c) {
    const ability = c[0].split(/\s+/)[0].toLowerCase() as AbilityKey;
    const extra = parseExtra(c[1] ?? "");
    return {
      raw: inner,
      apply: (m) => String(saveDC(m, ability) + extra.value),
    };
  }

  // ability nDn [+/- n]  (ability-based damage roll)
  c = t.match(new RegExp(`^${ABILITY_RE}\\s+(\\d+)D(\\d+)(\\s*[+\\-]\\s*\\d+)?$`, "i"));
  if (c) {
    const ability = c[0].split(/\s+/)[0].toLowerCase() as AbilityKey;
    const count = Number(c[1]);
    const die = Number(c[2]);
    const extra = parseExtra(c[3] ?? "");
    return {
      raw: inner,
      apply: (m) => {
        const mod = abilityMods(m)[ability];
        const base = diceAverage(count, die);
        const tail = signedTail(mod) + (extra.raw ? ` ${extra.raw}` : "");
        const total = base + mod + extra.value;
        return `${total} (${diceNotation(count, die, tail)})`;
      },
    };
  }

  // bare ability mod
  c = t.match(new RegExp(`^${ABILITY_RE}$`, "i"));
  if (c) {
    const ability = t.toLowerCase() as AbilityKey;
    return { raw: inner, apply: (m) => signed(abilityMods(m)[ability]) };
  }

  // bare nDn [+/- n]
  c = t.match(/^(\d+)D(\d+)(\s*[+\-]\s*\d+)?$/i);
  if (c) {
    const count = Number(c[1]);
    const die = Number(c[2]);
    const extra = parseExtra(c[3] ?? "");
    return {
      raw: inner,
      apply: () => {
        const base = diceAverage(count, die);
        const tail = extra.raw ? ` ${extra.raw}` : "";
        const total = base + extra.value;
        return `${total} (${diceNotation(count, die, tail)})`;
      },
    };
  }

  return null;
}

const TOKEN_RE = /\{\{([^{}]*)\}\}/g;

/** Substitute all {{...}} tokens. Unknown tokens are left untouched. */
export function substitute(text: string, m: Monster): string {
  if (!text) return text;
  return text.replace(TOKEN_RE, (whole, inner: string) => {
    const token = parseToken(inner);
    if (!token) return whole;
    return token.apply(m);
  });
}