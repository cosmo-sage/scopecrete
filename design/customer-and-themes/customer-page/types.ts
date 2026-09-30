/**
 * Customer ≠ contact. A customer (school, household, business) owns the address
 * and the jobs; contacts are the people who work for or with it, each with
 * their own phones and emails. Threads on a customer page merge all of its
 * contacts' calls, texts and emails into one timeline.
 */

export interface Customer {
  id: string;
  name: string;                 // "Slaughter Elementary School"
  kind: "residential" | "commercial" | "public";
  subtype: string | null;       // "Public school"
  address: Address | null;      // the customer's — NOT a contact's. Jobs may override with a site address.
  lead_source: string | null;
  status: string | null;        // "Active customer", "Follow up on lead"…
  notes: string | null;
  since: string | null;         // ISO — first job won
  primary_contact_id: string | null;
}

export interface Address {
  line1: string; city: string; state: string; zip: string;
  lat: number | null; lng: number | null;      // geocode once on save; street view needs these
  formatted: string;                            // "3170 Church St, Zachary, LA 70791"
}

export interface Contact {
  id: string;                   // existing contacts.id — threads already key off it
  customer_id: string | null;   // NEW: null = unsorted / not attached yet
  name: string | null;
  role: string | null;          // "Principal · signs off on work"
  methods: ContactMethod[];
}

export interface ContactMethod {
  kind: "mobile" | "office" | "home" | "email";
  value: string;                // E.164 for phones
  can_text: boolean;            // mobile only, usually
  primary: boolean;
}

/* ---- one timeline, three channels ---- */

interface Base { id: string; contact_id: string; direction: "in" | "out"; at: string }

export interface CallItem extends Base {
  channel: "call";
  duration_s: number;
  voicemail: boolean;
  recording_url: string | null;   // Quo/OpenPhone recording
  transcript: Array<{ t: number; speaker: "you" | "them"; text: string }> | null;
  summary: string | null;         // Dusty — shown FIRST on the card
  next_steps: string[];           // Dusty
  notes: CallNote[];              // Coy's notes on this call
}
export interface CallNote { id: string; body: string; author: string; at: string }

export interface TextItem extends Base { channel: "text"; body: string; media: string[] }

export interface EmailItem extends Base {
  channel: "email"; subject: string; body_preview: string;
  attachments: Array<{ name: string; url: string }>;
}

export type ThreadItem = CallItem | TextItem | EmailItem;
