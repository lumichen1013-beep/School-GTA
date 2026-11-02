// 測試工具：以 TypeScript 編譯器 API 列出 src/puzzle 原始檔中的字串常值 (不含註解)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

export const PUZZLE_SRC = join(__dirname, '../../src/puzzle');

export function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

export interface Literal { file: string; line: number; value: string }

/** 檔案中所有字串 / 樣板字串片段 (import 路徑除外) */
export function stringLiterals(file: string): Literal[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: Literal[] = [];
  const rel = relative(PUZZLE_SRC, file);
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) return;
    if (ts.isModuleDeclaration(n) && ts.isStringLiteral(n.name)) { n.body && visit(n.body); return; }
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      out.push({ file: rel, line: src.getLineAndCharacterOfPosition(n.getStart()).line + 1, value: n.text });
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

export const CJK = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;
