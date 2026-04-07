import { highlight, supportsLanguage } from "cli-highlight";

import type { EditorTheme, MarkdownTheme, SelectListTheme } from "./pi-tui.ts";

export interface NanobossTuiTheme {
  text: (text: string) => string;
  accent: (text: string) => string;
  muted: (text: string) => string;
  dim: (text: string) => string;
  success: (text: string) => string;
  error: (text: string) => string;
  warning: (text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  underline: (text: string) => string;
  toolCardPendingBg: (text: string) => string;
  toolCardSuccessBg: (text: string) => string;
  toolCardErrorBg: (text: string) => string;
  toolCardBorder: (text: string) => string;
  toolCardTitle: (text: string) => string;
  toolCardMeta: (text: string) => string;
  toolCardBody: (text: string) => string;
  highlightCode: (code: string, lang?: string) => string[];
  editor: EditorTheme;
  selectList: SelectListTheme;
  markdown: MarkdownTheme;
}

function style(text: string, codes: number[], resetCodes: number[]): string {
  if (text.length === 0) {
    return text;
  }

  return `\u001b[${codes.join(";")}m${text}\u001b[${resetCodes.join(";")}m`;
}

function fgStyle(text: string, ...codes: number[]): string {
  return style(text, codes, [39]);
}

function rgbFgStyle(text: string, red: number, green: number, blue: number): string {
  return style(text, [38, 2, red, green, blue], [39]);
}

function rgbBgStyle(text: string, red: number, green: number, blue: number): string {
  return style(text, [48, 2, red, green, blue], [49]);
}

function attrStyle(text: string, code: number, resetCode: number): string {
  return style(text, [code], [resetCode]);
}

type CliHighlightTheme = Record<string, (text: string) => string>;

export function getLanguageFromPath(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) {
    return undefined;
  }

  const extToLang: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    sql: "sql",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    md: "markdown",
    markdown: "markdown",
    dockerfile: "dockerfile",
    makefile: "makefile",
    cmake: "cmake",
    lua: "lua",
    perl: "perl",
    r: "r",
    scala: "scala",
    clj: "clojure",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    ml: "ocaml",
    vim: "vim",
    graphql: "graphql",
    proto: "protobuf",
    tf: "hcl",
    hcl: "hcl",
  };

  return extToLang[ext];
}

export function createNanobossTuiTheme(): NanobossTuiTheme {
  const text = (value: string) => value;
  const accent = (value: string) => fgStyle(value, 36);
  const muted = (value: string) => fgStyle(value, 90);
  const dim = (value: string) => attrStyle(value, 2, 22);
  const success = (value: string) => fgStyle(value, 32);
  const error = (value: string) => fgStyle(value, 31);
  const warning = (value: string) => fgStyle(value, 33);
  const bold = (value: string) => attrStyle(value, 1, 22);
  const italic = (value: string) => attrStyle(value, 3, 23);
  const underline = (value: string) => attrStyle(value, 4, 24);
  const toolCardPendingBg = (value: string) => rgbBgStyle(value, 40, 40, 50);
  const toolCardSuccessBg = (value: string) => rgbBgStyle(value, 40, 50, 40);
  const toolCardErrorBg = (value: string) => rgbBgStyle(value, 60, 40, 40);
  const toolCardBorder = muted;
  const toolCardTitle = bold;
  const toolCardMeta = dim;
  const toolCardBody = text;
  const toolCardCode = (value: string) => rgbFgStyle(value, 181, 189, 104);
  const syntaxComment = (value: string) => rgbFgStyle(value, 106, 153, 85);
  const syntaxKeyword = (value: string) => rgbFgStyle(value, 86, 156, 214);
  const syntaxFunction = (value: string) => rgbFgStyle(value, 220, 220, 170);
  const syntaxVariable = (value: string) => rgbFgStyle(value, 156, 220, 254);
  const syntaxString = (value: string) => rgbFgStyle(value, 206, 145, 120);
  const syntaxNumber = (value: string) => rgbFgStyle(value, 181, 206, 168);
  const syntaxType = (value: string) => rgbFgStyle(value, 78, 201, 176);
  const syntaxOperator = (value: string) => rgbFgStyle(value, 212, 212, 212);
  const syntaxPunctuation = (value: string) => rgbFgStyle(value, 212, 212, 212);
  const cliHighlightTheme: CliHighlightTheme = {
    keyword: syntaxKeyword,
    built_in: syntaxType,
    literal: syntaxNumber,
    number: syntaxNumber,
    string: syntaxString,
    comment: syntaxComment,
    function: syntaxFunction,
    title: syntaxFunction,
    class: syntaxType,
    type: syntaxType,
    attr: syntaxVariable,
    variable: syntaxVariable,
    params: syntaxVariable,
    operator: syntaxOperator,
    punctuation: syntaxPunctuation,
  };
  const highlightCode = (code: string, lang?: string): string[] => {
    const validLanguage = lang && supportsLanguage(lang) ? lang : undefined;
    if (!validLanguage) {
      return code.split("\n").map((line) => toolCardCode(line));
    }

    try {
      return highlight(code, {
        language: validLanguage,
        ignoreIllegals: true,
        theme: cliHighlightTheme,
      }).split("\n");
    } catch {
      return code.split("\n").map((line) => toolCardCode(line));
    }
  };

  const selectList: SelectListTheme = {
    selectedPrefix: (value) => style(value, [1, 36], [22, 39]),
    selectedText: (value) => style(value, [1, 36], [22, 39]),
    description: muted,
    scrollInfo: dim,
    noMatch: warning,
  };

  const markdown: MarkdownTheme = {
    heading: (value) => style(value, [1, 36], [22, 39]),
    link: (value) => style(value, [4, 36], [24, 39]),
    linkUrl: muted,
    code: (value) => warning(value),
    codeBlock: text,
    codeBlockBorder: muted,
    quote: muted,
    quoteBorder: muted,
    hr: muted,
    listBullet: accent,
    bold,
    italic,
    strikethrough: (value) => attrStyle(value, 9, 29),
    underline,
  };

  return {
    text,
    accent,
    muted,
    dim,
    success,
    error,
    warning,
    bold,
    italic,
    underline,
    toolCardPendingBg,
    toolCardSuccessBg,
    toolCardErrorBg,
    toolCardBorder,
    toolCardTitle,
    toolCardMeta,
    toolCardBody,
    highlightCode,
    editor: {
      borderColor: accent,
      selectList,
    },
    selectList,
    markdown,
  };
}
