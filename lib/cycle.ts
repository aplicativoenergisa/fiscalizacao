export const TIMEZONE = "America/Campo_Grande";
export function cycleAt(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  const year = get("year"),
    month = get("month"),
    half = Number(get("day")) <= 15 ? 1 : 2;
  return {
    id: `${year}-${month}-C${half}`,
    month: `${year}-${month}`,
    half,
    period: `${half === 1 ? "01" : "16"}/${month} a ${half === 1 ? 15 : new Date(Number(year), Number(month), 0).getDate()}/${month}/${year}`,
  };
}
export const formatTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
