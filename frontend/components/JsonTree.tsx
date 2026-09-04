function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** One key/value line in the tree. Objects and arrays get their own
 * collapsed-by-default <details> toggle (native, so no JS state needed per
 * node); primitives render inline. Deliberately no per-field formatting
 * (dates, URLs, images) -- this is the generic fallback for data we don't
 * know the shape of, formatting specific fields is exactly what the typed
 * sources already do elsewhere. */
export function JsonNode({ label, value }: { label?: string; value: unknown }) {
  const isContainer = value !== null && typeof value === "object";

  if (!isContainer) {
    return (
      <div className="flex min-w-0 gap-1.5 text-xs">
        {label !== undefined ? <span className="flex-shrink-0 font-medium text-gray-500">{label}:</span> : null}
        <span className="min-w-0 truncate text-gray-800">{formatPrimitive(value)}</span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const summary = `${label !== undefined ? `${label}: ` : ""}${isArray ? `[${entries.length}]` : `{${entries.length}}`}`;

  return (
    <details className="border-l border-gray-100 pl-2">
      <summary className="cursor-pointer select-none text-xs font-medium text-gray-500 hover:text-gray-700">
        {summary}
      </summary>
      <div className="mt-1 flex flex-col gap-1 pl-1">
        {entries.map(([key, val]) => (
          <JsonNode key={key} label={isArray ? undefined : key} value={val} />
        ))}
      </div>
    </details>
  );
}
