import { EmptyState } from "@/components/v34/primitives";

/** Right pane on desktop until a person is picked. On a phone the list shows instead. */
export default function CustomersIndex() {
  return (
    <div className="hidden lg:block">
      <EmptyState title="Pick someone" detail="Their numbers, what they are to the business, and their jobs show here." />
    </div>
  );
}
