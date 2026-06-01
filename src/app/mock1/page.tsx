import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  Zap,
  MessageCircle,
  Phone,
  Users,
  Check,
  DollarSign,
  BarChart3,
  Globe,
} from "lucide-react";
import ChatWidgetPreview from "@/components/landing/ChatWidgetPreview";
import DustyBubble from "@/components/landing/DustyBubble";

// ─── Dark brand palette (Clay's identity) ───────────────────────
const C = {
  bg: "#0F0F0F",           // near-black page bg
  surface: "#1A1A1A",      // dark charcoal cards
  elevated: "#252525",     // elevated elements
  accent: "#FF6B00",        // safety orange
  accentMuted: "rgba(255,107,0,0.12)",
  text: "#FFFFFF",         // primary text
  textMuted: "#9CA3AF",    // muted text
  border: "#2A2A2A",       // dark border
  success: "#22C55E",      // green for checkmarks
};

const FEATURES = [
  {
    icon: MessageCircle,
    title: "AI Chat on Your Website",
    description:
      "Dusty — our AI estimator — chats with your customers 24/7. Captures project details, shows real pricing, qualifies leads before they call.",
  },
  {
    icon: BarChart3,
    title: "Pipeline You Own",
    description:
      "Every lead lands in your dashboard. Full conversation history, source, status, and follow-up notes — forever.",
  },
  {
    icon: Zap,
    title: "Real Market Data",
    description:
      "Estimates calibrated to your market. Labor rates, material costs, regional concrete prices — so your first number is close.",
  },
  {
    icon: Shield,
    title: "No HomeAdvisor Fees",
    description:
      "$1,800–$2,700 per lead from HomeAdvisor. ScopeCrete is $79/month per seat. Own every lead that hits your site.",
  },
  {
    icon: Globe,
    title: "White-Label Ready",
    description:
      "Dusty on your website. Your colors, your number, your domain. Customers think it's just you.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description:
      "Share leads across your crew. Notes, status updates, and quote history — everyone in the same pipeline.",
  },
];

const STATS = [
  { value: "$0", label: "HomeAdvisor fees" },
  { value: "100%", label: "Lead ownership" },
  { value: "24/7", label: "AI active on your site" },
  { value: "1 seat", label: "per contractor minimum" },
];

const PRICING_TIERS = [
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

const HOW_IT_WORKS = [
  {
    number: "01",
    title: "Dusty chats with your customer",
    description:
      "AI estimator on your website. Customer describes their project — '24 by 30 foot driveway' — Dusty asks just enough questions to qualify the job.",
    icon: MessageCircle,
  },
  {
    number: "02",
    title: "Qualified lead lands in your dashboard",
    description:
      "Phone number, project details, estimate range, source. Full conversation history. No more mystery leads from forms.",
    icon: BarChart3,
  },
  {
    number: "03",
    title: "Text the customer. Close the job.",
    description:
      "Customer already knows the math. You're not starting from scratch. Text them with your exact quote — based on real market data.",
    icon: Phone,
  },
];

export default function Mock1Page() {
  return (
    <div
      className="min-h-screen"
      style={{ background: C.bg, color: C.text, fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* ─── Header ─── */}
      <header
        className="fixed top-0 inset-x-0 z-50 border-b"
        style={{ background: "rgba(15,15,15,0.95)", backdropFilter: "blur(12px)", borderColor: C.border }}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: C.accent }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="#000" />
                <rect x="8" y="1" width="5" height="5" rx="1" fill="#000" fillOpacity="0.5" />
                <rect x="1" y="8" width="5" height="5" rx="1" fill="#000" fillOpacity="0.5" />
                <rect x="8" y="8" width="5" height="5" rx="1" fill="#000" />
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight" style={{ color: C.text }}>
              ScopeCrete
            </span>
            <span className="text-sm font-normal ml-0.5" style={{ color: C.textMuted }}>
              .ai
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a
              href="#how-it-works"
              className="text-sm transition-colors"
              style={{ color: C.textMuted }}
            >
              How it works
            </a>
            <a
              href="#features"
              className="text-sm transition-colors"
              style={{ color: C.textMuted }}
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-sm transition-colors"
              style={{ color: C.textMuted }}
            >
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="hidden md:block text-sm font-medium transition-colors"
              style={{ color: C.textMuted }}
            >
              Log in
            </Link>
            <Link
              href="#pricing"
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              style={{ background: C.accent, color: "#000" }}
            >
              Get a demo
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="pt-32 pb-24 px-6 min-h-[90dvh] flex flex-col justify-center">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <div>
              <div
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-6"
                style={{ background: C.accentMuted, color: C.accent }}
              >
                <Zap size={11} style={{ color: C.accent }} />
                For concrete contractors
              </div>

              <h1
                className="text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-none mb-6"
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  color: C.text,
                  lineHeight: 1.05,
                }}
              >
                Turn website
                <br />
                visitors into
                <br />
                <span style={{ color: C.accent }}>bids.</span>
                <br />
                Own your pipeline.
              </h1>

              <p className="text-lg leading-relaxed max-w-[44ch] mb-10" style={{ color: C.textMuted }}>
                Your competitors pay $1,800 per lead to HomeAdvisor. ScopeCrete puts
                an AI estimator on your website — and every lead lands in your
                dashboard. You own it forever.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  href="#pricing"
                  className="inline-flex items-center justify-center gap-2 font-semibold px-8 py-4 rounded-xl transition-all"
                  style={{ background: C.accent, color: "#000", fontFamily: "'DM Sans', sans-serif" }}
                >
                  Get a demo
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
                  "AI estimator on your site 24/7",
                  "No HomeAdvisor fees",
                  "Own every lead forever",
                ].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check size={13} style={{ color: C.accent }} />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — Scope Builder preview */}
            <div className="relative">
              <div
                className="rounded-2xl overflow-hidden border"
                style={{ background: C.surface, borderColor: C.border }}
              >
                {/* Fake browser chrome */}
                <div
                  className="flex items-center gap-2 px-4 py-3 border-b"
                  style={{ background: C.elevated, borderColor: C.border }}
                >
                  <div className="w-3 h-3 rounded-full" style={{ background: "#FF5F57" }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: "#FEBC2E" }} />
                  <div className="w-3 h-3 rounded-full" style={{ background: "#28C840" }} />
                  <span className="text-xs ml-2" style={{ color: C.textMuted }}>
                    scopecrete.ai/dashboard
                  </span>
                </div>
                {/* App shell */}
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded" style={{ background: C.accent }} />
                      <span className="font-semibold text-sm" style={{ color: C.text }}>
                        Scope Builder
                      </span>
                    </div>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: C.elevated, color: C.textMuted }}
                    >
                      SC
                    </div>
                  </div>
                  {/* Tab bar */}
                  <div
                    className="flex gap-4 mb-6 pb-3 border-b"
                    style={{ borderColor: C.border }}
                  >
                    {["Scope", "Cost Cards", "Notes Pad", "Plan Room"].map((tab, i) => (
                      <span
                        key={tab}
                        className="text-xs font-medium pb-1"
                        style={{
                          color: i === 0 ? C.accent : C.textMuted,
                          borderBottom: i === 0 ? `2px solid ${C.accent}` : "2px solid transparent",
                        }}
                      >
                        {tab}
                      </span>
                    ))}
                  </div>
                  {/* Lead card */}
                  <div
                    className="rounded-xl p-4 mb-4"
                    style={{ background: C.elevated, border: `1px solid ${C.border}` }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold text-sm mb-1" style={{ color: C.text }}>
                          Riverside Dr Project
                        </div>
                        <div className="text-xs" style={{ color: C.textMuted }}>
                          +1 (225) 608-8891 · 24 × 30 ft driveway
                        </div>
                      </div>
                      <div
                        className="w-2 h-2 rounded-full mt-1.5"
                        style={{ background: C.accent }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: C.accentMuted, color: C.accent }}
                      >
                        Insta-Quote
                      </span>
                      <span className="text-xs" style={{ color: C.textMuted }}>
                        $8,200–$9,500 estimate
                      </span>
                    </div>
                  </div>
                  {/* Cost cards mini */}
                  {["Concrete", "Rebar", "Forms"].map((card) => (
                    <div
                      key={card}
                      className="flex items-center justify-between py-2 border-b"
                      style={{ borderColor: C.border }}
                    >
                      <span className="text-xs" style={{ color: C.textMuted }}>
                        {card}
                      </span>
                      <span className="text-xs font-medium" style={{ color: C.text }}>
                        —
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Overlay label */}
              <div
                className="absolute -bottom-4 -right-4 text-xs px-3 py-1.5 rounded-full font-medium"
                style={{ background: C.accent, color: "#000" }}
              >
                Live dashboard
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section
        className="border-y"
        style={{ borderColor: C.border, background: C.surface }}
      >
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div
                  className="text-3xl lg:text-4xl font-bold mb-1"
                  style={{ color: C.accent, fontFamily: "'Bricolage Grotesque', sans-serif" }}
                >
                  {stat.value}
                </div>
                <div className="text-sm" style={{ color: C.textMuted }}>
                  {stat.label}
                </div>
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
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                color: C.text,
              }}
            >
              Three steps to pipeline ownership.
            </h2>
            <p className="text-lg max-w-[52ch] mx-auto" style={{ color: C.textMuted }}>
              Your website does the work. Your crew follows up with confidence. No
              more mystery leads from HomeAdvisor.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.number} className="relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div
                    className="hidden lg:block absolute top-12 left-[calc(50%+3rem)] right-[calc(-50%+3rem)] h-px z-0"
                    style={{ background: C.border }}
                  />
                )}
                <div
                  className="relative z-10 rounded-2xl p-8"
                  style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: C.accentMuted }}
                  >
                    <step.icon size={22} style={{ color: C.accent }} />
                  </div>
                  <div className="text-xs font-mono mb-2" style={{ color: C.textMuted }}>
                    {step.number}
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: C.text }}>
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: C.textMuted }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section
        id="features"
        className="py-24 px-6"
        style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-4xl lg:text-5xl font-bold tracking-tight mb-4"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                color: C.text,
              }}
            >
              Everything a contractor needs.
            </h2>
            <p className="text-lg max-w-[52ch] mx-auto" style={{ color: C.textMuted }}>
              Not a form builder. Not a calendar. A complete pipeline tool — from first
              chat to signed contract.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl p-8"
                style={{
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: C.accentMuted }}
                >
                  <feature.icon size={22} style={{ color: C.accent }} />
                </div>
                <h3 className="text-lg font-bold mb-2" style={{ color: C.text }}>
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: C.textMuted }}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-4"
              style={{ background: C.accentMuted, color: C.accent }}
            >
              <DollarSign size={11} style={{ color: C.accent }} />
              Pricing
            </div>
            <h2
              className="text-4xl lg:text-5xl font-bold tracking-tight mb-4"
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                color: C.text,
              }}
            >
              No HomeAdvisor. No per-lead fees.
            </h2>
            <p className="text-lg max-w-[52ch] mx-auto" style={{ color: C.textMuted }}>
              HomeAdvisor charges $1,800–$2,700 per lead. ScopeCrete charges a flat
              monthly subscription. You pay once. You own every lead forever.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className="relative rounded-2xl p-8"
                style={{
                  background: C.surface,
                  border: tier.highlight ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                }}
              >
                {tier.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full"
                    style={{ background: C.accent, color: "#000" }}
                  >
                    Most popular
                  </div>
                )}
                <div className="mb-6">
                  <div className="text-sm font-semibold mb-1" style={{ color: C.accent }}>
                    {tier.name}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span
                      className="text-4xl font-bold"
                      style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: C.text }}
                    >
                      ${tier.price}
                    </span>
                    <span className="text-sm" style={{ color: C.textMuted }}>
                      /mo
                    </span>
                  </div>
                  <div className="text-sm mt-1" style={{ color: C.textMuted }}>
                    {tier.description}
                  </div>
                </div>
                <div className="space-y-3 mb-8">
                  <div className="text-xs font-medium" style={{ color: C.textMuted }}>
                    {tier.leads} · {tier.contractors}
                  </div>
                  {tier.features.map((f) => (
                    <div key={f} className="flex items-start gap-2">
                      <Check size={14} className="shrink-0 mt-0.5" style={{ color: C.accent }} />
                      <span className="text-sm" style={{ color: C.textMuted }}>
                        {f}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="#pricing"
                  className="inline-flex items-center justify-center gap-2 w-full font-semibold px-6 py-3 rounded-xl transition-all"
                  style={{
                    background: tier.highlight ? C.accent : "transparent",
                    color: tier.highlight ? "#000" : C.textMuted,
                    border: tier.highlight ? "none" : `1px solid ${C.border}`,
                  }}
                >
                  Get started
                  <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="text-4xl lg:text-5xl font-bold tracking-tight mb-6"
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              color: C.text,
            }}
          >
            Ready to own your pipeline?
          </h2>
          <p className="text-lg mb-10" style={{ color: C.textMuted }}>
            Book a 20-minute demo. We'll show you how Dusty works on a contractor
            site — and how the pipeline flows into Scope Builder.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="#pricing"
              className="inline-flex items-center justify-center gap-2 font-semibold px-8 py-4 rounded-xl transition-all"
              style={{ background: C.accent, color: "#000" }}
            >
              Get a demo
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 font-medium px-8 py-4 rounded-xl transition-colors border"
              style={{ borderColor: C.border, color: C.textMuted }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer
        className="border-t py-8 px-6"
        style={{ borderColor: C.border, background: C.surface }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center"
              style={{ background: C.accent }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="#000" />
                <rect x="8" y="1" width="5" height="5" rx="1" fill="#000" fillOpacity="0.5" />
                <rect x="1" y="8" width="5" height="5" rx="1" fill="#000" fillOpacity="0.5" />
                <rect x="8" y="8" width="5" height="5" rx="1" fill="#000" />
              </svg>
            </div>
            <span className="text-sm" style={{ color: C.textMuted }}>
              © 2026 ScopeCrete.ai
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm" style={{ color: C.textMuted }}>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}