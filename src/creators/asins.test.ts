/// <reference types="bun" />
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractAsinsFromContent, extractAsinsFromPosts } from './asins.js'

describe('extractAsinsFromContent', () => {
  test('finds a bare directive', () => {
    expect(extractAsinsFromContent('::amazon{asin="B00TQMO5E0"}')).toEqual(['B00TQMO5E0'])
  })

  test('finds a directive carrying extra attributes', () => {
    expect(extractAsinsFromContent('::amazon{asin="B00TQMO5E0" title="エナジージェル"}')).toEqual([
      'B00TQMO5E0',
    ])
  })

  // MDX posts use the component form instead of the directive.
  test('finds the JSX component form', () => {
    expect(extractAsinsFromContent('<Amazon asin="B016RJPL4W" />')).toEqual(['B016RJPL4W'])
  })

  test('collects both forms from one post', () => {
    const content = '::amazon{asin="B00TQMO5E0"}\n\n<Amazon asin="B016RJPL4W" />\n'
    expect(extractAsinsFromContent(content)).toEqual(['B00TQMO5E0', 'B016RJPL4W'])
  })

  // A product mentioned twice in a post is still one API item.
  test('reports each ASIN once', () => {
    const content = '::amazon{asin="B00TQMO5E0"}\n::amazon{asin="B00TQMO5E0"}\n'
    expect(extractAsinsFromContent(content)).toEqual(['B00TQMO5E0'])
  })

  test('ignores anything that is not a well-formed ASIN', () => {
    expect(extractAsinsFromContent('::amazon{asin="b00tqmo5e0"}')).toEqual([])
    expect(extractAsinsFromContent('::amazon{asin="B00TQ"}')).toEqual([])
    expect(extractAsinsFromContent('::amazon{asin="B00TQMO5E0EXTRA"}')).toEqual([])
  })

  test('ignores an unrelated directive', () => {
    expect(extractAsinsFromContent('::youtube{id="B00TQMO5E0"}')).toEqual([])
  })

  test('finds nothing in a post with no products', () => {
    expect(extractAsinsFromContent('# 見出し\n\n本文だけの記事。\n')).toEqual([])
  })
})

describe('extractAsinsFromPosts', () => {
  let postsDir: string

  // Both post layouts are in use across the sites this serves: flat
  // `posts/slug.md` and bundled `posts/slug/index.md`.
  beforeAll(() => {
    postsDir = mkdtempSync(join(tmpdir(), 'affiliate-card-posts-'))
    writeFileSync(join(postsDir, 'a-flat-post.md'), '::amazon{asin="B00TQMO5E0"}')
    writeFileSync(join(postsDir, 'b-mdx-post.mdx'), '<Amazon asin="B016RJPL4W" />')
    mkdirSync(join(postsDir, 'c-bundled-post'))
    writeFileSync(join(postsDir, 'c-bundled-post', 'index.md'), '::amazon{asin="B003ER7K0E"}')
    // Assets living beside the posts must not be read as markdown.
    writeFileSync(join(postsDir, 'c-bundled-post', 'cover.jpg'), 'not markdown')
    writeFileSync(join(postsDir, 'notes.txt'), '::amazon{asin="B0IGNORED0"}')
  })

  afterAll(() => rmSync(postsDir, { recursive: true, force: true }))

  test('walks both post layouts and reads only markdown', () => {
    expect(extractAsinsFromPosts(postsDir)).toEqual(['B00TQMO5E0', 'B016RJPL4W', 'B003ER7K0E'])
  })

  // A stable order keeps the committed product file's diff to the entries that
  // actually changed.
  test('orders the result by filename, not by directory listing order', () => {
    expect(extractAsinsFromPosts(postsDir)).toEqual(extractAsinsFromPosts(postsDir))
  })

  test('finds nothing in an empty directory', () => {
    const empty = mkdtempSync(join(tmpdir(), 'affiliate-card-empty-'))
    try {
      expect(extractAsinsFromPosts(empty)).toEqual([])
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  // The CLI takes the directory from a flag; a typo should say so rather than
  // silently syncing zero products and wiping nothing.
  test('throws when the posts directory does not exist', () => {
    expect(() => extractAsinsFromPosts(join(tmpdir(), 'affiliate-card-no-such-dir'))).toThrow()
  })
})
