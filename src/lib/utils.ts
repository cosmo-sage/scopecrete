import { parseISO, formatDistanceToNow } from "date-fns";

export const timeAgo = (dateString: string) => {
  if (!dateString) return "";
  const date = parseISO(dateString);
  return formatDistanceToNow(date, { addSuffix: true });
};

export const capitalize = (s: string) => {
  if (typeof s !== "string") return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};
