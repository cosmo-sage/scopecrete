/** Voice/text providers a line can run on (org_phone_numbers.provider CHECK, migration 035). */
export const PROVIDERS: Array<{ k: string; label: string }> = [
  { k: "quo", label: "Quo (OpenPhone)" },
  { k: "twilio", label: "Twilio" },
  { k: "telnyx", label: "Telnyx" },
  { k: "retell", label: "Retell AI" },
  { k: "vapi", label: "Vapi" },
  { k: "own_stack", label: "Own AI stack" },
  { k: "other", label: "Other" },
];
