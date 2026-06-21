"use client";

import React from "react";
import { STATUS_BADGE, SC } from "@/lib/theme";

const STAGES = ["new", "contacted", "qualified", "quoted", "won", "lost"];

interface KanbanLead {
  id: string;
  customerName: string;
  projectType?: string;
  address?: string;
  estimatedValue?: number;
  daysInStage: number;
  nextAction?: string;
  status?: string;
}

interface KanbanBoardProps {
  stages: {
    [key: string]: {
      count: number;
      totalValue: number;
      avgDaysInStage: number;
      leads: KanbanLead[];
    };
  };
  onDragEnd?: (result: any) => Promise<void>;
}

export default function KanbanBoard({ stages, onDragEnd }: KanbanBoardProps) {
  return (
    <div style={{ display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "16px" }}>
      {STAGES.map((stage) => {
        const data = stages[stage] || { count: 0, totalValue: 0, leads: [] };
        const badge = STATUS_BADGE[stage];
        return (
          <div key={stage} style={{ minWidth: "240px", flex: 1 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              padding: "8px",
              borderRadius: "8px",
              backgroundColor: badge?.bg || "transparent",
            }}>
              <span style={{ fontWeight: 600, color: badge?.color }}>{stage.toUpperCase()}</span>
              <span style={{
                backgroundColor: SC.surface,
                color: SC.text,
                borderRadius: "12px",
                padding: "2px 8px",
                fontSize: "12px",
              }}>
                {data.count}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {data.leads.map((lead) => (
                <div key={lead.id} style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: `1px solid ${SC.border}`,
                  backgroundColor: SC.surface,
                }}>
                  <div style={{ fontWeight: 500, marginBottom: "4px" }}>
                    {lead.customerName || "Unknown Lead"}
                  </div>
                  {lead.projectType && (
                    <div style={{ fontSize: "12px", color: SC.textMuted }}>{lead.projectType}</div>
                  )}
                  {lead.address && (
                    <div style={{ fontSize: "12px", color: SC.textMuted }}>{lead.address}</div>
                  )}
                  {lead.estimatedValue && (
                    <div style={{ fontSize: "14px", fontWeight: 600, color: SC.primary, marginTop: "4px" }}>
                      ${(lead.estimatedValue ?? 0).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
              {data.count === 0 && (
                <div style={{ textAlign: "center", color: SC.textMuted, padding: "16px", fontSize: "13px" }}>
                  No leads
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
