function humanDescription(value?: string | null): string | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }
  if (text.startsWith("[") || text.startsWith("{")) {
    return undefined;
  }
  return text;
}

export function photoCaption(parts: {
  year: number;
  description?: string | null;
  place?: string | null;
  people?: string[];
}): string {
  return [
    String(parts.year),
    humanDescription(parts.description),
    parts.place?.trim(),
    parts.people?.filter(Boolean).join(", "),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" — ");
}
