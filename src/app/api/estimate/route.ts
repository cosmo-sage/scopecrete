import { NextRequest, NextResponse } from "next/server";

interface CostCards {
  concrete_per_cy?: number;
  labor_per_sqft_low?: number;
  labor_per_sqft_high?: number;
  materials_per_cy?: number;
  equipment_flat?: number;
}

interface EstimateInput {
  sqft: number;
  depth_in: number;
  psi: number;
  zip?: string;
  job_type?: string;
  cost_cards?: CostCards;
}

// Local formula fallback (used when Qwen 3B vllm is not running)
function computeLocalEstimate(input: EstimateInput) {
  const { sqft, depth_in, psi, cost_cards } = input;
  const cy = (sqft * (depth_in / 12)) / 27;

  const cc = cost_cards || {};
  const concretePerCY = cc.concrete_per_cy || (psi === 3000 ? 175 : psi === 4000 ? 195 : 220);
  const laborLow = cc.labor_per_sqft_low || 8;
  const laborHigh = cc.labor_per_sqft_high || 10;
  const materialsPerCY = cc.materials_per_cy || 75;
  const equipmentFlat = cc.equipment_flat || (sqft > 600 ? 450 : 250);

  const concreteCost = cy * concretePerCY;
  const laborLowTotal = sqft * laborLow;
  const laborHighTotal = sqft * laborHigh;
  const materialsLow = cy * materialsPerCY;
  const materialsHigh = cy * (materialsPerCY + 10);
  const equipment = equipmentFlat;

  const costLow = concreteCost + laborLowTotal + materialsLow + equipment;
  const costHigh = concreteCost + laborHighTotal + materialsHigh + equipment;
  const marginLow = Math.round(costLow * 1.28);
  const marginHigh = Math.round(costHigh * 1.28);

  return {
    rangeMin: marginLow,
    rangeMax: marginHigh,
    estimate_range: { low: marginLow, high: marginHigh },
    cy: Math.round(cy * 100) / 100,
    breakdown: {
      materials: Math.round(concreteCost),
      labor: Math.round((laborLowTotal + laborHighTotal) / 2),
      overhead: Math.round((marginHigh - costHigh + marginLow - costLow) / 2),
      equipment: equipment,
    },
    // calibration_source reflects the estimating engine:
    // qwen_3b = Qwen 3B GPU (trained model, primary)
    // local-formula = CPU fallback formula (secondary)
    calibration_source: "local-formula",
    engine: "local-formula",
  };
}

// Try Qwen 3B vllm server first (trained on concrete estimating data)
async function tryQwenEstimate(input: EstimateInput) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch("http://100.113.194.47:8000/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sqft: input.sqft,
        depthIn: input.depth_in,
        psi: input.psi,
        zip: input.zip,
        job_type: input.job_type,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Qwen responded ${response.status}`);

    const data = await response.json();
    return { ...data, engine: "qwen-3b-v2", calibration_source: "qwen_3b" };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sqft,
      depth_in,
      depthIn,
      psi = 3000,
      zip,
      job_type,
      projectType,
      cost_cards,
      mode,
    } = body;

    const depth = depth_in ?? depthIn;
    const jobType = job_type ?? projectType;

    if (!sqft || sqft < 1) {
      return NextResponse.json({ error: "sqft is required and must be > 0" }, { status: 400 });
    }
    if (!depth || depth < 1) {
      return NextResponse.json({ error: "depth_in is required" }, { status: 400 });
    }

    const effectiveMode = mode || (depth && zip ? "firm" : "ballpark");

    // Try Qwen 3B first, fall back to local formula
    const qwenResult = await tryQwenEstimate({ sqft, depth_in: depth, psi, zip, job_type: jobType, cost_cards });
    const result = qwenResult || computeLocalEstimate({ sqft, depth_in: depth, psi, cost_cards });

    const disclaimer = effectiveMode === "firm"
      ? "Based on current info — site visit may adjust final price."
      : "Preliminary estimate — site visit may adjust final price.";

    return NextResponse.json({
      mode: effectiveMode,
      estimate_range: { low: result.rangeMin, high: result.rangeMax },
      breakdown: result.breakdown,
      calibration_source: result.calibration_source,
      disclaimer,
      cy: result.cy,
      engine: result.engine,
      input: { job_type: jobType, sqft, depth_in: depth, psi, zip },
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}