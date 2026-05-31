// Aikido design system tokens for contractor portal
export const AK = {
  bg: "#0B0F1A",           // Page background
  surface: "#131929",      // Card/panel surface
  surfaceHover: "#1a2435",
  elevated: "#1e293b",     // Elevated elements
  accent: "#F59E0B",       // Amber accent
  accentMuted: "rgba(245,158,11,0.15)",
  accentText: "#F59E0B",
  textPrimary: "#FFFFFF",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  border: "#1e293b",
  borderLight: "#2d3a4f",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",

  // Status colors
  status: {
    new: "#3B82F6",         // Blue
    contacted: "#F59E0B",   // Amber
    qualified: "#8B5CF6",   // Purple
    won: "#22C55E",         // Green
    lost: "#EF4444",        // Red
  }
} as const;

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

export interface Lead {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  projectType: string;
  address: string;
  zip: string;
  estimateMin: number;
  estimateMax: number;
  status: LeadStatus;
  createdAt: string;
  lastActivity: string;
  notes: string;
  conversation: ConversationMessage[];
  estimateDetails: EstimateDetails;
}

export interface ConversationMessage {
  role: "customer" | "dusty" | "system";
  text: string;
  timestamp: string;
}

export interface EstimateDetails {
  sqft: number;
  depthIn: number;
  psi: number;
  conditions: string;
  cy: number;
  breakdown: Record<string, { desc: string; amount: number }>;
  isBallpark: boolean;
}

// Mock data for MVP
export const MOCK_LEADS: Lead[] = [
  {
    id: "lead-001",
    customerName: "Marcus Thibodaux",
    phone: "(225) 555-0147",
    email: "marcus.t@example.com",
    projectType: "driveway",
    address: "4412 Government St",
    zip: "70802",
    estimateMin: 7200,
    estimateMax: 8900,
    status: "new",
    createdAt: "2026-05-25T10:30:00Z",
    lastActivity: "2026-05-25T10:45:00Z",
    notes: "",
    estimateDetails: {
      sqft: 600,
      depthIn: 4,
      psi: 3000,
      conditions: "flat grade, easy access",
      cy: 7.4,
      breakdown: {},
      isBallpark: false
    },
    conversation: [
      { role: "dusty", text: "Hey, I'm Dusty. Tell me about your concrete project.", timestamp: "2026-05-25T10:30:00Z" },
      { role: "customer", text: "I need a new driveway, about 600 square feet", timestamp: "2026-05-25T10:30:00Z" },
      { role: "dusty", text: "Got it. What's the depth — 4 inches for driveways?", timestamp: "2026-05-25T10:31:00Z" },
      { role: "customer", text: "4 inches is fine", timestamp: "2026-05-25T10:31:00Z" },
      { role: "dusty", text: "Almost done — what's your zip code?", timestamp: "2026-05-25T10:32:00Z" },
      { role: "customer", text: "70802", timestamp: "2026-05-25T10:32:00Z" },
      { role: "dusty", text: "Here's your estimate for a 24×25ft driveway at 4\" depth: $7,200–$8,900. Want me to send you the full breakdown?", timestamp: "2026-05-25T10:45:00Z" }
    ]
  },
  {
    id: "lead-002",
    customerName: "Sophia Broussard",
    phone: "(225) 555-0293",
    email: "sophia.b@example.com",
    projectType: "patio",
    address: "8813 Highland Rd",
    zip: "70810",
    estimateMin: 4800,
    estimateMax: 6100,
    status: "contacted",
    createdAt: "2026-05-24T14:15:00Z",
    lastActivity: "2026-05-25T09:00:00Z",
    notes: "Called twice, left voicemail. Interested in 4000psi upgrade.",
    estimateDetails: {
      sqft: 400,
      depthIn: 4,
      psi: 3000,
      conditions: "sloped grade, standard access",
      cy: 4.9,
      breakdown: {},
      isBallpark: false
    },
    conversation: [
      { role: "dusty", text: "Hey, I'm Dusty. Tell me about your concrete project.", timestamp: "2026-05-24T14:15:00Z" },
      { role: "customer", text: "Patio, maybe 20 by 20", timestamp: "2026-05-24T14:15:00Z" },
      { role: "dusty", text: "Got it. What's the depth?", timestamp: "2026-05-24T14:16:00Z" },
      { role: "customer", text: "Standard, 4 inches", timestamp: "2026-05-24T14:16:00Z" },
      { role: "dusty", text: "And your zip?", timestamp: "2026-05-24T14:16:00Z" },
      { role: "customer", text: "70810", timestamp: "2026-05-24T14:17:00Z" },
      { role: "dusty", text: "Your estimate for a 20×20ft patio at 4\" depth: $4,800–$6,100.", timestamp: "2026-05-24T14:17:00Z" }
    ]
  },
  {
    id: "lead-003",
    customerName: "Derek Sonnier",
    phone: "(225) 555-0384",
    email: "d.sonnier@example.com",
    projectType: "foundation",
    address: "2201 Chippewa St",
    zip: "70805",
    estimateMin: 11200,
    estimateMax: 13800,
    status: "qualified",
    createdAt: "2026-05-23T11:00:00Z",
    lastActivity: "2026-05-24T16:30:00Z",
    notes: "Building a detached garage. Wants detailed breakdown for permit.",
    estimateDetails: {
      sqft: 900,
      depthIn: 6,
      psi: 4000,
      conditions: "requires permit, engineered spec",
      cy: 16.7,
      breakdown: {},
      isBallpark: false
    },
    conversation: [
      { role: "dusty", text: "Tell me about your project.", timestamp: "2026-05-23T11:00:00Z" },
      { role: "customer", text: "I need a concrete slab for a garage, about 30 by 30", timestamp: "2026-05-23T11:00:00Z" },
      { role: "dusty", text: "For a garage foundation, you'll want 6 inches at 4000psi. What's your zip?", timestamp: "2026-05-23T11:01:00Z" },
      { role: "customer", text: "70805", timestamp: "2026-05-23T11:01:00Z" },
      { role: "dusty", text: "Here's your estimate for a 30×30ft foundation at 6\" depth, 4000psi: $11,200–$13,800.", timestamp: "2026-05-23T11:02:00Z" }
    ]
  },
  {
    id: "lead-004",
    customerName: "Amara Diallo",
    phone: "(225) 555-0512",
    email: "amara.d@example.com",
    projectType: "driveway",
    address: "7722 Mickens Rd",
    zip: "70791",
    estimateMin: 6800,
    estimateMax: 8400,
    status: "won",
    createdAt: "2026-05-20T09:00:00Z",
    lastActivity: "2026-05-22T14:00:00Z",
    notes: "Signed contract for $8,100. Scheduled for June 3.",
    estimateDetails: {
      sqft: 560,
      depthIn: 4,
      psi: 3000,
      conditions: "flat, standard access",
      cy: 6.9,
      breakdown: {},
      isBallpark: false
    },
    conversation: [
      { role: "dusty", text: "Tell me about your project.", timestamp: "2026-05-20T09:00:00Z" },
      { role: "customer", text: "Driveway, 28 by 20 feet", timestamp: "2026-05-20T09:00:00Z" },
      { role: "dusty", text: "Got it — what's the depth?", timestamp: "2026-05-20T09:01:00Z" },
      { role: "customer", text: "4 inches", timestamp: "2026-05-20T09:01:00Z" },
      { role: "dusty", text: "Zip code?", timestamp: "2026-05-20T09:01:00Z" },
      { role: "customer", text: "70791", timestamp: "2026-05-20T09:02:00Z" },
      { role: "dusty", text: "Here's your estimate: $6,800–$8,400.", timestamp: "2026-05-20T09:02:00Z" }
    ]
  },
  {
    id: "lead-005",
    customerName: "Leon Cravins",
    phone: "(225) 555-0627",
    email: "leon.cravins@example.com",
    projectType: "slab",
    address: "1401 Florida Blvd",
    zip: "70802",
    estimateMin: 3200,
    estimateMax: 4100,
    status: "lost",
    createdAt: "2026-05-18T15:30:00Z",
    lastActivity: "2026-05-20T10:00:00Z",
    notes: "Went with competitor. Price was factor. Told him we're here if competitor falls through.",
    estimateDetails: {
      sqft: 280,
      depthIn: 4,
      psi: 3000,
      conditions: "tight access",
      cy: 3.5,
      breakdown: {},
      isBallpark: false
    },
    conversation: [
      { role: "dusty", text: "Tell me about your project.", timestamp: "2026-05-18T15:30:00Z" },
      { role: "customer", text: "Concrete slab for a shed, about 14 by 20", timestamp: "2026-05-18T15:30:00Z" },
      { role: "dusty", text: "Got it. What's the depth?", timestamp: "2026-05-18T15:31:00Z" },
      { role: "customer", text: "4 inches", timestamp: "2026-05-18T15:31:00Z" },
      { role: "dusty", text: "And zip?", timestamp: "2026-05-18T15:31:00Z" },
      { role: "customer", text: "70802", timestamp: "2026-05-18T15:32:00Z" },
      { role: "dusty", text: "Your estimate for a 14×20ft slab at 4\": $3,200–$4,100.", timestamp: "2026-05-18T15:32:00Z" }
    ]
  },
  {
    id: "lead-006",
    customerName: "Jennifer Hebert",
    phone: "(225) 555-0738",
    email: "j.hebert@example.com",
    projectType: "driveway",
    address: "3394 Millerville Rd",
    zip: "70811",
    estimateMin: 9200,
    estimateMax: 11400,
    status: "qualified",
    createdAt: "2026-05-25T08:00:00Z",
    lastActivity: "2026-05-25T08:20:00Z",
    notes: "Large dual-car driveway. Interested in exposed aggregate finish upgrade.",
    estimateDetails: {
      sqft: 800,
      depthIn: 5,
      psi: 4000,
      conditions: "flat grade, good access",
      cy: 12.3,
      breakdown: {},
      isBallpark: false
    },
    conversation: [
      { role: "dusty", text: "Hey, I'm Dusty. Tell me about your concrete project.", timestamp: "2026-05-25T08:00:00Z" },
      { role: "customer", text: "I need a new driveway, it's about 40 by 20 feet", timestamp: "2026-05-25T08:00:00Z" },
      { role: "dusty", text: "Got it. What's the depth?", timestamp: "2026-05-25T08:01:00Z" },
      { role: "customer", text: "What do you recommend for heavy trucks?", timestamp: "2026-05-25T08:01:00Z" },
      { role: "dusty", text: "For heavy vehicles, I'd say 5 inches at 4000psi. What zip?", timestamp: "2026-05-25T08:02:00Z" },
      { role: "customer", text: "70811", timestamp: "2026-05-25T08:02:00Z" },
      { role: "dusty", text: "Here's your estimate: $9,200–$11,400. Want me to send the full breakdown?", timestamp: "2026-05-25T08:20:00Z" }
    ]
  }
];

export const MOCK_STATS = {
  totalConversations: 47,
  conversationsThisMonth: 12,
  avgEstimateValue: 7450,
  leadsConverted: 3,
  totalLeads: 6,
  newLeads: 2,
  contactedLeads: 1,
  qualifiedLeads: 2,
  wonLeads: 1,
  lostLeads: 0
};
