import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Zap,
  MessageCircle,
  Phone,
  Users,
  Check,
  DollarSign,
} from "lucide-react";
import ChatWidgetPreview from "@/components/landing/ChatWidgetPreview";
import DustyBubble from "@/components/landing/DustyBubble";
import PhoneHeroAnimation from "@/components/landing/PhoneHeroAnimation";

// ─── Warm Concrete + Terracotta palette ───────────────────────
const C = {
  bg: "#F6F7FB",          // warm white page bg
  card: "#FFFFFF",         // warm light surface
  elevated: "#EEF2F8",     // elevated elements
  accent: "#2457F5",       // terracotta accent
  accentMuted: "rgba(36,87,245,0.08)",
  primary: "#2457F5",       // warm stone text
  text: "#1F2937",          // primary text
  textMuted: "#6B7280",     // muted text
  border: "#E5E7EB",        // warm border
};

const CONTRACTOR_TIERS = [
  {
    name: "Solo",
    price: "79",
    description: "For solo contractors getting started",
    leads: "500 leads/mo",
    contractors: "1 seat",
    features: [
      "AI chatbot on your site",
      "SMS lead notifications",
      "Basic dashboard",
      "Community support",
    ],
    highlight: false,
  },
  {
    name: "Growth",
    price: "199",
    description: "For growing concrete companies",
    leads: "2,000 leads/mo",
    contractors: "3 seats",
    features: [
      "Everything in Solo",
      "JobTread integration",
      "Team collaboration",
      "Priority support",
      "White-label option",
    ],
    highlight: true,
  },
  {
    name: "Pro",
    price: "499",
    description: "For established contractors firm-wide",
    leads: "Unlimited",
    contractors: "10 seats",
    features: [
      "Everything in Growth",
      "Advanced analytics",
      "Custom branding",
      "API access",
      "Dedicated account manager",
    ],
    highlight: false,
  },
];

const STEPS = [
  {
    number: "01",
    title: "Customer describes their project",
    description:
      'They tap a quick reply or type naturally — "24 by 30 foot driveway." Dusty asks just enough to get a solid estimate.',
    icon: MessageCircle,
  },
  {
    number: "02",
    title: "Instant estimate delivered",
    description:
      "Dusty calculates a tight price range on the spot — $7,500 to $9,500 — based on real market data for Baton Rouge.",
    icon: DollarSign,
  },
  {
    number: "03",
    title: "Contractor texts the customer",
    description:
      "A local pro follows up with an exact quote. Customer already knows the math. Conversations start from trust, not skepticism.",
    icon: Phone,
  },
];

const STATS = [
  { value: "60s", label: "Average estimate time" },
  { value: "94%", label: "Customer satisfaction" },
  { value: "$0", label: "HomeAdvisor fees" },
  { value: "3×", label: "More leads, lower cost" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text, fontFamily: "'DM Sans', sans-serif" }}>
      {/* ─── Header ─── */}
      <header
        className="fixed top-0 inset-x-0 z-50 border-b"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", borderColor: C.border }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo — iMessage bubble wrapping "Scope" */}
          <div className="flex items-center gap-0">
            <div className="relative flex items-end shrink-0" style={{ paddingBottom: 2 }}>
              {/* iMessage bubble with "Scope" inside */}
              <svg width="76" height="30" viewBox="0 0 76 30" fill="none" style={{ display: 'block' }}>
                {/* Bubble body */}
                <rect x="1" y="1" width="72" height="24" rx="12" fill="#2457F5" />
                {/* Bubble tail — iMessage style, small triangle */}
                <path d="M2 20 L-4 27 L10 20 Z" fill="#2457F5" />
                {/* "Scope" text — SF Pro / system font */}
                <text
                  x="38" y="19"
                  textAnchor="middle"
                  fill="white"
                  fontSize="15"
                  fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                  fontWeight="400"
                  letterSpacing="0.3"
                >Scope</text>
              </svg>
            </div>
            {/* Wordmark: Scope (in bubble) + Crete bold + .ai */}
            <span
              className="font-extrabold text-lg tracking-tight leading-none"
              style={{ fontFamily: "var(--font-sans), sans-serif", color: C.textMuted }}
            >
              <span style={{ fontWeight: 800 }}>Crete</span>
              <span className="text-sm font-normal ml-0.5" style={{ color: "#1F2937" }}>.ai</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm transition-colors" style={{ color: C.textMuted }}>How it works</a>
            <a href="#contractor" className="text-sm transition-colors" style={{ color: C.textMuted }}>For Contractors</a>
            <a href="#pricing" className="text-sm transition-colors" style={{ color: C.textMuted }}>Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="hidden md:block text-sm font-medium transition-colors"
              style={{ color: C.textMuted }}
            >
              Sign in
            </Link>
            <Link
              href="/calculator"
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              style={{ background: C.accent, color: "#FFFFFF" }}
            >
              Get your estimate
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="pt-32 pb-20 px-6 min-h-[100dvh] flex flex-col justify-center">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <div>
              <div
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-6"
                style={{ background: C.accentMuted, color: C.accent }}
              >
                <Zap size={11} style={{ color: C.accent }} />
                AI-powered concrete estimating
              </div>

              <h1
                className="text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-none mb-6"
                style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: C.text }}
              >
                Get a concrete
                <br />
                <span style={{ color: C.accent }}>estimate</span>
                <br />
                in 60 seconds
              </h1>

              <p className="text-lg leading-relaxed max-w-[44ch] mb-10" style={{ color: C.textMuted }}>
                Describe your project. Get an accurate bid based on real market math. A
                local contractor texts you within the hour. No phone calls, no
                guesswork.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  href="/calculator"
                  className="inline-flex items-center justify-center gap-2 font-semibold px-8 py-4 rounded-xl transition-colors"
                  style={{ background: C.accent, color: "#FFFFFF", fontFamily: "'DM Sans', sans-serif" }}
                >
                  Start your estimate
                  <ArrowRight size={18} />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 font-medium px-8 py-4 rounded-xl transition-colors border"
                  style={{ borderColor: C.border, color: C.textMuted }}
                >
                  See how it works
                </a>
              </div>

              <div className="flex flex-wrap gap-6 text-sm" style={{ color: C.textMuted }}>
                {[
                  "No phone call required",
                  "Powered by real market data",
                  "Local Baton Rouge contractors",
                ].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check size={13} style={{ color: C.accent }} />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — Tablet animation */}
            <PhoneHeroAnimation />
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="border-y" style={{ borderColor: C.border, background: C.card }}>
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl lg:text-4xl font-bold mb-1" style={{ color: C.accent, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{stat.value}</div>
                <div className="text-sm" style={{ color: C.textMuted }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-4"
              style={{ background: C.accentMuted, color: C.accent }}
            >
              <Zap size={11} style={{ color: C.accent }} />
              How it works
            </div>
            <h2
              className="text-4xl lg:text-5xl font-bold tracking-tight mb-4"
              style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: C.text }}
            >
              Three steps. No phone calls.
            </h2>
            <p className="text-lg max-w-[52ch] mx-auto" style={{ color: C.textMuted }}>
              Your customer describes the project. Dusty does the math. You follow up with confidence.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative">
                {i < STEPS.length - 1 && (
                  <div
                    className="hidden lg:block absolute top-12 left-[calc(50%+3rem)] right-[calc(-50%+3rem)] h-px z-0"
                    style={{ background: C.border }}
                  />
                )}
                <div
                  className="relative z-10 rounded-2xl p-8 transition-colors"
                  style={{ background: C.card, border: `1px solid ${C.border}` }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: C.accentMuted }}
                  >
                    <step.icon size={22} style={{ color: C.accent }} />
                  </div>
                  <div className="text-xs font-mono mb-2" style={{ color: C.textMuted }}>{step.number}</div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: C.text }}>{step.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: C.textMuted }}>{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Chat showcase ─── */}
      <section className="py-24 px-6" style={{ background: C.card, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-4"
                style={{ background: C.accentMuted, color: C.accent }}
              >
                <MessageCircle size={11} style={{ color: C.accent }} />
                Live chat experience
              </div>
              <h2
                className="text-4xl lg:text-5xl font-bold tracking-tight mb-6"
                style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: C.text }}
              >
                Customers love
                <br />
                talking to Dusty
              </h2>
              <p className="text-lg leading-relaxed mb-8" style={{ color: C.textMuted }}>
                No forms. No phone trees. Just a conversation. Dusty speaks like a real
                field rep — shows the math, explains the variables, earns trust before
                asking for a phone number.
              </p>
              <div className="space-y-3">
                {[
                  "Typing animation feels like texting a real person",
                  "Quick reply chips — one tap, no typing",
                  "Visual thinking bubbles show the math",
                  "Estimate shown before contact is requested",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <Check size={15} className="shrink-0" style={{ color: C.accent }} />
                    <span className="text-sm" style={{ color: C.textMuted }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <ChatWidgetPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Contractor pricing ─── */}
      <section id="contractor" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-4"
              style={{ background: C.accentMuted, color: C.accent }}
            >
              <Users size={11} style={{ color: C.accent }} />
              For Contractors
            </div>
            <h2
              className="text-4xl lg:text-5xl font-bold tracking-tight mb-4"
              style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: C.text }}
            >
              Stop paying HomeAdvisor.
              <br />
              Own your leads.
            </h2>
            <p className="text-lg max-w-[52ch] mx-auto" style={{ color: C.textMuted }}>
              HomeAdvisor charges $1,800–$2,700 per lead. Scope Builder charges
              $79/month. Your customers find you on your own website — and you own
              the relationship forever.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {CONTRACTOR_TIERS.map((tier) => (
              <div
                key={tier.name}
                className="relative rounded-2xl p-8 flex flex-col gap-6"
                style={
                  tier.highlight
                    ? { background: C.bg, border: `1px solid ${C.border}`, boxShadow: `0 0 0 1px ${C.accent}20` }
                    : { background: C.card, border: `1px solid ${C.border}` }
                }
              >
                {tier.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full"
                    style={{ background: C.accent, color: "#FFFFFF" }}
                  >
                    Most popular
                  </div>
                )}
                <div>
                  <div className={`text-sm font-semibold mb-1 ${tier.highlight ? "" : ""}`} style={{ color: tier.highlight ? C.accent : C.textMuted }}>
                    {tier.name}
                  </div>
                  <div className="flex items-end gap-1 mb-1">
                    <span className="text-5xl font-bold tracking-tight" style={{ color: C.text, fontFamily: "'Bricolage Grotesque', sans-serif" }}>${tier.price}</span>
                    <span className="text-sm mb-2" style={{ color: C.textMuted }}>/mo</span>
                  </div>
                  <p className="text-sm" style={{ color: C.textMuted }}>
                    {tier.description}
                  </p>
                </div>
                <div className="text-sm font-semibold" style={{ color: C.textMuted }}>
                  {tier.leads} · {tier.contractors}
                </div>
                <ul className="space-y-2.5 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check
                        size={14}
                        className="mt-0.5 shrink-0"
                        style={{ color: tier.highlight ? C.accent : "#9CA3AF" }}
                      />
                      <span className="text-sm" style={{ color: tier.highlight ? C.textMuted : C.textMuted }}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`inline-flex items-center justify-center gap-2 font-semibold text-sm px-6 py-3 rounded-xl transition-colors`}
                  style={
                    tier.highlight
                      ? { background: C.accent, color: "#FFFFFF" }
                      : { background: C.elevated, color: C.text, border: `1px solid ${C.border}` }
                  }
                >
                  Get started
                  <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>

          <div className="text-center mt-8 text-sm" style={{ color: C.textMuted }}>
            All plans include a 14-day free trial. No credit card required.
          </div>
        </div>
      </section>

            {/* ─── Dusty chat bubble ─── */}
      <DustyBubble />

{/* ─── Footer ─── */}
      <footer className="py-12 px-6" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div>
              <div className="flex items-center gap-0 mb-3">
                {/* Footer logo — iMessage bubble */}
                <div className="relative flex items-end shrink-0" style={{ paddingBottom: 2 }}>
                  <svg width="60" height="24" viewBox="0 0 60 24" fill="none" style={{ display: 'block' }}>
                    <rect x="1" y="1" width="56" height="20" rx="10" fill="#2457F5" />
                    <path d="M2 16 L-2 22 L8 16 Z" fill="#2457F5" />
                    <text
                      x="30" y="15"
                      textAnchor="middle"
                      fill="white"
                      fontSize="12"
                      fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
                      fontWeight="400"
                      letterSpacing="0.2"
                    >Scope</text>
                  </svg>
                </div>
                <span
                  className="font-extrabold tracking-tight leading-none"
                  style={{ fontFamily: "var(--font-sans), sans-serif", color: C.textMuted }}
                >
                  <span style={{ fontWeight: 800 }}>Crete</span>
                  <span className="text-sm font-normal ml-0.5" style={{ color: "#1F2937" }}>.ai</span>
                </span>
              </div>
              <p className="text-sm max-w-[28ch] leading-relaxed" style={{ color: C.textMuted }}>
                AI-powered concrete estimating for contractors who value accuracy and speed.
              </p>
            </div>
            <div className="flex gap-16">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>Product</div>
                <ul className="space-y-2 text-sm" style={{ color: C.textMuted }}>
                  <li><a href="/calculator" className="hover:text-white transition-colors">Estimate</a></li>
                  <li><a href="#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
                  <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>Company</div>
                <ul className="space-y-2 text-sm" style={{ color: C.textMuted }}>
                  <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div
            className="mt-10 pt-8 text-xs flex justify-between"
            style={{ borderTop: `1px solid ${C.border}`, color: C.textMuted }}
          >
            <span>© 2026 Scope Builder. All rights reserved.</span>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}