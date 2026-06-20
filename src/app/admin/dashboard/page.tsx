import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { SelectChangeEvent } from "@mui/material";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Unstable_Grid2";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import { useAuth0 } from "@auth0/auth0-react";
import { enqueueSnackbar } from "notistack";

import { PLAN_BADGE } from "@/lib/theme";
import { timeAgo, formatCurrency } from "@/lib/utils"; // Moved from theme
import AnalyticsCurrentVisits from "@/sections/overview/analytics-current-visits";
import AnalyticsWebsiteVisits from "@/sections/overview/analytics-website-visits";
import AnalyticsWidgetSummary from "@/sections/overview/analytics-widget-summary";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function OverviewAppView() {

  const { user } = useAuth0();
  const orgId = user?.app_metadata?.org_id; // Get orgId from Auth0 user metadata

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("all");

  const fetchMetrics = async () => {
    if (!orgId) {
      setError("Org ID not found in user metadata.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/dashboard/metrics?org_id=${orgId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch metrics");
      }
      const data = await response.json();
      setMetrics(data.metrics);
      setRecentLeads(data.recentLeads.map((lead: any) => ({ ...lead, createdAt: new Date(lead.created_at) })));
    } catch (err: any) {
      console.error("Error fetching metrics:", err);
      setError(err.message);
      enqueueSnackbar(err.message, { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [orgId]); // Refetch when orgId changes

  // Convert currency amounts for display
  const currencyMetrics = useMemo(() => {
    if (!metrics) return null;
    return {
      totalPipelineValue: formatCurrency(metrics.totalPipelineValue || 0),
      totalRevenueBooked: formatCurrency(metrics.totalRevenueBooked || 0),
    };
  }, [metrics]);

  const filteredLeads = useMemo(() => {
    if (!recentLeads) return [];
    if (activeTab === "all") return recentLeads;
    return recentLeads.filter(lead => lead.source_channel === activeTab);
  }, [recentLeads, activeTab]);

  const handleTabChange = (event: SelectChangeEvent) => {
    setActiveTab(event.target.value);
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 5 }}>
        <Alert severity="error">
          <AlertTitle>Error</AlertTitle>
          {error} — <strong>Please try again later or contact support.</strong>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Grid container spacing={3}>
        <Grid xs={12} sm={6} md={3}>
          <AnalyticsWidgetSummary
            title="Total Pipeline Value"
            total={currencyMetrics?.totalPipelineValue || "$0"}
            icon="solar:users-group-rounded-bold"
          />
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <AnalyticsWidgetSummary
            title="Total Revenue Booked"
            total={currencyMetrics?.totalRevenueBooked || "$0"}
            icon="solar:bill-list-bold"
          />
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <AnalyticsWidgetSummary
            title="New Leads Today"
            total={metrics?.newLeadsToday || 0}
            color="info"
            icon="solar:add-circle-bold"
          />
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <AnalyticsWidgetSummary
            title="Conversion Rate"
            total={`${metrics?.conversionRate || 0}%`}
            color="warning"
            icon="solar:graph-up-bold"
          />
        </Grid>
        
        <Grid xs={12} md={6} lg={8}>
          <AnalyticsWebsiteVisits
            title="Lead Sources"
            subheader="(+43% than last year)"
            chart={{
              labels: [
                "01/01/2003",
                "02/01/2003",
                "03/01/2003",
                "04/01/2003",
                "05/01/2003",
                "06/01/2003",
                "07/01/2003",
                "08/01/2003",
                "09/01/2003",
                "10/01/2003",
                "11/01/2003",
              ],
              series: [
                {
                  name: "Team A",
                  type: "column",
                  fill: "solid",
                  data: [23, 11, 22, 27, 13, 22, 37, 21, 44, 22, 30],
                },
                {
                  name: "Team B",
                  type: "area",
                  fill: "gradient",
                  data: [44, 55, 41, 67, 22, 43, 21, 41, 56, 27, 43],
                },
                {
                  name: "Team C",
                  type: "line",
                  fill: "solid",
                  data: [30, 25, 36, 30, 45, 35, 64, 52, 59, 36, 39],
                },
              ],
            }}
          />
        </Grid>

        <Grid xs={12} md={6} lg={4}>
          <AnalyticsCurrentVisits
            title="Current Visits"
            chart={{
              series: [
                { label: "America", value: 4344 },
                { label: "Asia", value: 5435 },
                { label: "Europe", value: 1443 },
                { label: "Africa", value: 4443 },
              ],
            }}
          />
        </Grid>

        <Grid xs={12} lg={8}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6">Recent Leads</Typography>
            <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
              <InputLabel id="leads-filter-label">Source</InputLabel>
              <Select
                labelId="leads-filter-label"
                id="leads-filter"
                value={activeTab}
                label="Source"
                onChange={handleTabChange}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="web">Web</MenuItem>
                <MenuItem value="phone">Phone</MenuItem>
                <MenuItem value="sms">SMS</MenuItem>
                <MenuItem value="email">Email</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          
          <Box>
            {filteredLeads.map((lead) => (
              <Box key={lead.id} sx={{ mb: 2, p: 2, bgcolor: (theme) => theme.palette.background.paper, borderRadius: 1 }}>
                <Typography variant="subtitle2">{lead.customer_name || lead.customer_phone || "Unknown Lead"}</Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>{lead.project_type || 'Unspecified Project'} from {lead.source_channel} • {timeAgo(lead.createdAt.toISOString())}</Typography>
              </Box>
            ))}
            {filteredLeads.length === 0 && <Typography variant="body2" sx={{ color: "text.disabled" }}>No recent leads found.</Typography>}
          </Box>
        </Grid>

        <Grid xs={12} md={6} lg={4}>
          {/* Example of a different type of grid item */}
        </Grid>
      </Grid>
    </Container>
  );
}
