// ASIN discovery: the posts are the source of truth for which products to fetch.
//
// The scan recurses so one implementation serves both post layouts in use:
// flat `posts/slug.md` and bundled `posts/slug/index.md`.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIRECTIVE_PATTERN = /::amazon\{asin="([A-Z0-9]{10})"[^}]*\}/g
const JSX_PATTERN = /<Amazon\s+asin="([A-Z0-9]{10})"/g

/** Extracts unique ASINs from one post's source. */
export function extractAsinsFromContent(content: string): string[] {
  const matches = [...content.matchAll(DIRECTIVE_PATTERN), ...content.matchAll(JSX_PATTERN)]
  return [...new Set(matches.map((match) => match[1]!))]
}

/** Lists every post file under `dir`, recursively, in a stable order. */
function listPostFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return listPostFiles(path)
      return entry.name.endsWith('.md') || entry.name.endsWith('.mdx') ? [path] : []
    })
}

/** Extracts unique ASINs across every post, in a stable order. */
export function extractAsinsFromPosts(postsDir: string): string[] {
  const asins = listPostFiles(postsDir).flatMap((file) =>
    extractAsinsFromContent(readFileSync(file, 'utf-8')),
  )
  return [...new Set(asins)]
}
