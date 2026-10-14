import type { LeadStatus } from "../lib/crm";
export const statusLabel: Record<LeadStatus, string> = {
  new: "Новая", in_progress: "В работе", won: "Закрыта", lost: "Отказ",
};
export default function StatusBadge({ s }: { s: LeadStatus }) {
  return <span className={`badge b-${s}`}>{statusLabel[s]}</span>;
}
