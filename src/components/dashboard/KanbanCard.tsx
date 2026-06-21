import React from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { STATUS_BADGE, SC } from "@/lib/theme";
import { timeAgo } from "@/lib/utils"; // Moved from theme

interface KanbanCardProps {
  lead: {
    id: string;
    customerName: string;
    projectType?: string;
    address?: string;
    estimatedValue?: number;
    daysInStage: number;
    nextAction?: string;
    status?: string;
  };
}

export default function KanbanCard({ lead }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const statusConfig = lead.status ? STATUS_BADGE[lead.status] : null;

  let nextActionText = "";
  let nextActionColor = "text-gray-400";
  switch (lead.nextAction) {
    case "call_today":
      nextActionText = "📞 Call Today";
      nextActionColor = "text-orange-400";
      break;
    case "follow_up":
      nextActionText = "⏳ Follow Up";
      nextActionColor = "text-yellow-400";
      break;
    case "proposal_sent":
      nextActionText = "📋 Proposal Sent";
      nextActionColor = "text-blue-400";
      break;
    case "manual_review":
      nextActionText = "📝 Manual Review";
      nextActionColor = "text-red-400";
      break;
    default:
      if (lead.status === "won") nextActionText = "✅ Won - Invoice";
      if (lead.status === "lost") nextActionText = "❌ Lost - Archive";
      break;
  }

  return (
    <Link href={`/dashboard/leads/${lead.id}`}>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="bg-gray-700 rounded-lg shadow-sm p-3 mb-3 cursor-grab hover:bg-gray-600 transition-colors duration-200 ease-in-out"
      >
        <h3 className="text-md font-medium text-white">{lead.customerName}</h3>
        <p className="text-sm text-gray-300">{lead.projectType} in {lead.address}</p>
        {(lead.estimatedValue ?? 0) > 0 && (
          <p className="text-sm font-semibold text-green-400">${(lead.estimatedValue ?? 0).toLocaleString()}</p>
        )}
        <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
          <span>{lead.daysInStage} Days in Stage</span>
          {nextActionText && <span className={`font-medium ${nextActionColor}`}>{nextActionText}</span>}
        </div>
      </div>
    </Link>
  );
}
