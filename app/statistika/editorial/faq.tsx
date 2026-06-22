import { BodyMuted, Eyebrow, Hook } from "./primitives"

/**
 * Reusable "česta pitanja" block for the editorial pSEO pages (linije, kvartovi,
 * stanica). One visual language everywhere: eyebrow + questions as h3 hooks with
 * muted answers, airy spacing, no dividers. Each page builds its own FaqItem[].
 */

export interface FaqItem {
  q: string
  a: string
}

export function CestaPitanja({ items }: { items: FaqItem[] }) {
  return (
    <div>
      <Eyebrow className="pb-2">česta pitanja</Eyebrow>
      <dl className="flex flex-col gap-7 pt-4">
        {items.map((item) => (
          <div key={item.q}>
            <dt>
              <Hook as="h3">{item.q}</Hook>
            </dt>
            <dd className="mt-2 max-w-[520px]">
              <BodyMuted>{item.a}</BodyMuted>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  }
}
