/**
 * Inline abbreviation with a native tooltip.
 * Use for technical terms (CV, GTFS-RT, etc.) that need a brief explanation.
 */
export function Term({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <abbr
      title={title}
      className="cursor-help border-b border-dotted border-current no-underline"
    >
      {children}
    </abbr>
  )
}
