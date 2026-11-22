/* 文档中心 — 代码块语言表（lowlight/common 支持的语法） */

import { common, createLowlight } from 'lowlight'

export const LOWLIGHT = createLowlight(common)

const LABELS: Record<string, string> = {
  plaintext: '纯文本',
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  graphql: 'GraphQL',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  kotlin: 'Kotlin',
  less: 'Less',
  lua: 'Lua',
  makefile: 'Makefile',
  markdown: 'Markdown',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  python: 'Python',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  scss: 'SCSS',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
  xml: 'XML/HTML',
  yaml: 'YAML',
}

export interface CodeLanguage {
  id: string
  label: string
}

/** 下拉框里的语言：纯文本 + lowlight 已注册语法（按标签排序） */
export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { id: 'plaintext', label: '纯文本' },
  ...LOWLIGHT.listLanguages()
    .map((id) => ({ id, label: LABELS[id] ?? id }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en')),
]

export function languageLabel(id: string | null | undefined) {
  const key = id && id.length > 0 ? id : 'plaintext'
  return CODE_LANGUAGES.find((item) => item.id === key)?.label ?? key
}
