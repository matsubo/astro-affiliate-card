// The Astro integration: registers the remark plugin and injects the
// stylesheet, so a site's astro.config only names this once.

import type { AstroIntegration } from 'astro'
import { resolveOptions, type AffiliateCardOptions } from './options.js'
import { remarkAmazon } from './remark.js'

export type { AmazonCardData, CardLabels } from './card.js'
export { renderAmazonCard } from './card.js'
export type { AffiliateCardOptions } from './options.js'
export {
  createRemarkAmazon,
  remarkAmazon,
  type ProductRecord,
  type RemarkAmazonOptions,
} from './remark.js'
export * from './shops.js'

export interface IntegrationOptions extends AffiliateCardOptions {
  /**
   * Inject the bundled stylesheet.
   * @default true
   */
  injectStyles?: boolean
}

export default function affiliateCard(options: IntegrationOptions = {}): AstroIntegration {
  const { injectStyles = true, ...cardOptions } = options

  return {
    name: 'astro-affiliate-card',
    hooks: {
      'astro:config:setup': ({ config, updateConfig, injectScript, logger }) => {
        const root = config.root.pathname

        if (injectStyles) {
          injectScript('page-ssr', `import 'astro-affiliate-card/card.css';`)
        }

        // A site whose Markdown is built out of remark plugins declares
        // `markdown.processor: unified({...})` and lists them itself, because
        // Astro 7's native processor runs none. An integration cannot add to a
        // list the site constructs, and the failure is silent: every ::amazon
        // renders as literal text.
        //
        // There is no reliable way to tell that apart from here -- Astro
        // populates `markdown.processor` with its own default either way, so
        // testing that field flags every site. Register regardless (harmless
        // when it goes unused) and say what to do if the cards do not appear.
        logger.info(
          'if this site declares markdown.processor, add the plugin to it instead: ' +
            "import { createRemarkAmazon } from 'astro-affiliate-card/remark'",
        )

        updateConfig({
          markdown: {
            remarkPlugins: [[remarkAmazon, resolveOptions({ root, ...cardOptions }, logger)]],
          },
        })
      },
    },
  }
}
