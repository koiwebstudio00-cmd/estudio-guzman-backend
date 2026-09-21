export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeChannel(type: "EMAIL" | "PHONE" | "WHATSAPP" | "OTHER", value: string) {
  if (type === "EMAIL") return value.trim().toLowerCase();
  if (type === "PHONE" || type === "WHATSAPP") {
    const trimmed = value.trim();
    return `${trimmed.startsWith("+") ? "+" : ""}${trimmed.replace(/\D/g, "")}`;
  }
  return normalizeSearch(value);
}
