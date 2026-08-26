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

        // Astro 7's default Markdown processor does not run remark/rehype
        // plugins, so a site that needs them declares `markdown.processor` and
        // lists the plugins itself. Nothing this integration adds to
        // `markdown.remarkPlugins` reaches that list -- and the failure is
        // silent: the directive just renders as literal text. Say so rather
        // than letting every card quietly disappear.
        if ((config.markdown as { processor?: unknown } | undefined)?.processor) {
          logger.warn(
            'markdown.processor is declared explicitly, so this integration cannot register its ' +
              'remark plugin and ::amazon directives will render as text. Add the plugin to that ' +
              'processor instead:\n' +
              "  import { createRemarkAmazon } from 'astro-affiliate-card/remark'\n" +
              '  remarkPlugins: [remarkDirective, createRemarkAmazon(), ...]',
          )
          return
        }

        updateConfig({
          markdown: {
            remarkPlugins: [[remarkAmazon, resolveOptions({ root, ...cardOptions }, logger)]],
          },
        })
      },
    },
  }
}
