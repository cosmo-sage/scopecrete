import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import KanbanBoard from "@/components/dashboard/KanbanBoard";

import { timeAgo, formatCurrency } from "@/lib/utils"; // Assuming these are now in utils
import { SC } from "@/lib/theme"; // For SC.purple etc. in theme

// Supabase client (only for initial auth or if needed for RLS tests)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Dummy data for initial rendering or until API is ready
const DUMMY_KANBAN_DATA = {
  stages: {
    new: { count: 8, totalValue: 42500, avgDaysInStage: 1.2, leads: [] },
    contacted: { count: 5, totalValue: 38000, avgDaysInStage: 2.1, leads: [] },
    qualified: { count: 3, totalValue: 25000, avgDaysInStage: 1.5, leads: [] },
    quoted: { count: 4, totalValue: 50000, avgDaysInStage: 0.8, leads: [] },
    won: { count: 12, totalValue: 120000, avgDaysInStage: 5.0, leads: [] },
    lost: { count: 6, totalValue: 0, avgDaysInStage: 8.0, leads: [] },
  },
  summary: {
    totalPipelineValue: 275500,
    needsAction: 4,
    winRate: 23,
  },
};

export default function Dashboard() {
  const [kanbanData, setKanbanData] = useState<any>(DUMMY_KANBAN_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For now, hardcode orgId as per previous discussion, will come from AuthContext later
  const orgId = "61e26b09-da88-4c9f-bd0c-a47054b86234"; // Sacco Builders Org ID

  const fetchPipelineData = useCallback(async () => {
    if (!orgId) return; // Should not happen with hardcoded, but good practice

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/dashboard/pipeline?org_id=${orgId}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to fetch pipeline data");
      }
      const data = await response.json();
      setKanbanData(data);
    } catch (err: any) {
      console.error("Error fetching pipeline data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPipelineData();
  }, [fetchPipelineData]);

  // Handle drag and drop for updating lead status
  const onDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId) return; // Dropped in the same column

    const newStatus = destination.droppableId; // Column ID is the new status
    const leadId = draggableId; // Draggable ID is the lead ID

    // Optimistic UI update
    const newKanbanData = { ...kanbanData };
    const sourceStage = newKanbanData.stages[source.droppableId];
    const destStage = newKanbanData.stages[newStatus];
    const [movedLead] = sourceStage.leads.splice(source.index, 1);
    destStage.leads.splice(destination.index, 0, movedLead);

    // Update counts and values (simple re-sum for now)
    sourceStage.count--;
    sourceStage.totalValue -= movedLead.estimatedValue || 0;
    destStage.count++;
    destStage.totalValue += movedLead.estimatedValue || 0;
    movedLead.status = newStatus; // Update lead status in UI as well
    movedLead.daysInStage = 0; // Reset days in stage for new column

    setKanbanData(newKanbanData);

    // API call to update status
    try {
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, org_id: orgId }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to update lead status");
      }
      // Re-fetch full data to ensure consistency and correct aggregates after server update
      fetchPipelineData();
    } catch (err: any) {
      console.error("Error updating lead status via API:", err);
      // TODO: Revert UI if API call fails
      setError(err.message);
      fetchPipelineData(); // Re-fetch to get actual state
    }
  };

  if (loading) return <div className="p-4 text-center">Loading pipeline...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 shadow">
          <h3 className="text-sm font-medium text-gray-400">Pipeline Value</h3>
          <p className="text-2xl font-semibold text-white">{formatCurrency(kanbanData.summary.totalPipelineValue)}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 shadow">
          <h3 className="text-sm font-medium text-gray-400">Needs Action</h3>
          <p className="text-2xl font-semibold text-white">{kanbanData.summary.needsAction}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 shadow">
          <h3 className="text-sm font-medium text-gray-400">Win Rate</h3>
          <p className="text-2xl font-semibold text-white">{kanbanData.summary.winRate}%</p>
        </div>
      </div>

      {/* Kanban Board */}
      <KanbanBoard stages={kanbanData.stages} onDragEnd={onDragEnd} />
    </div>
  );
}
