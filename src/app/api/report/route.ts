import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * VLM report drafting. This is the **language** path, kept strictly separate
 * from the clinical segmentation/measurement path (SaMD §I.2): the model drafts
 * an impression *over numbers that already exist* — measurements and
 * AI-generated segment labels passed in the request — and is told never to
 * invent findings or measurements. Output is labeled AI-generated, research use
 * only, and is clinician-editable. The provider is configurable; when none is
 * set we return a typed 503 rather than fabricating language.
 */

const PROVIDER = process.env.REPORT_PROVIDER;
const MODEL = process.env.REPORT_MODEL ?? "medgemma-4b-it";
const LOCAL_URL = process.env.REPORT_LOCAL_URL ?? "http://localhost:8000/v1/chat/completions";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL =
  process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1/chat/completions";

const NOT_CONFIGURED =
  "Report model is not configured. Set REPORT_PROVIDER (local | openai | anthropic) " +
  "and the matching key/URL. The language model never produces clinical masks " +
  "or measurements — it only drafts text over numbers that already exist.";

const MeasurementSchema = z.object({ label: z.string(), value: z.string() });
const SegmentSchema = z.object({ index: z.number(), label: z.string() });

const ReportRequestSchema = z.object({
  context: z.object({
    studyInstanceUid: z.string().optional(),
    seriesInstanceUid: z.string().optional(),
    modality: z.string().optional(),
    measurements: z.array(MeasurementSchema),
    segments: z.array(SegmentSchema)
  })
});

const SYSTEM_PROMPT = [
  "You are a radiology reporting assistant for a research-use-only viewer.",
  "Draft a concise, structured radiology impression STRICTLY from the provided",
  "measurements and AI-generated segment labels. Do NOT invent measurements,",
  "findings, laterality, or diagnoses that are not present in the input. If the",
  "input is sparse, say so. Never present output as a definitive diagnosis; this",
  "is decision support pending clinician review. Use sections: Findings,",
  "Impression. Keep it under 180 words."
].join(" ");

export function GET(): Response {
  if (!isConfigured()) {
    return Response.json(
      { available: false, provider: null, message: NOT_CONFIGURED },
      { status: 503 }
    );
  }

  return Response.json({
    available: true,
    provider: PROVIDER ?? null,
    message: `Report model ready (${PROVIDER}: ${MODEL}).`
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ status: "error", message: NOT_CONFIGURED }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { status: "error", message: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = ReportRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { status: "error", message: "Report request did not match the schema." },
      { status: 400 }
    );
  }

  const userPrompt = buildUserPrompt(parsed.data.context);

  try {
    const text =
      PROVIDER === "anthropic"
        ? await callAnthropic(userPrompt)
        : await callOpenAiCompatible(userPrompt);

    return Response.json({ status: "ok", text, provider: PROVIDER, model: MODEL });
  } catch (error) {
    return Response.json(
      { status: "error", message: getErrorMessage(error) },
      { status: 502 }
    );
  }
}

function isConfigured(): boolean {
  if (PROVIDER === "anthropic") {
    return Boolean(ANTHROPIC_KEY);
  }
  if (PROVIDER === "openai") {
    return Boolean(OPENAI_KEY);
  }
  if (PROVIDER === "local") {
    return Boolean(LOCAL_URL);
  }
  return false;
}

function buildUserPrompt(context: z.infer<typeof ReportRequestSchema>["context"]): string {
  const lines: string[] = [];
  if (context.modality) {
    lines.push(`Modality: ${context.modality}`);
  }
  lines.push("Measurements:");
  if (context.measurements.length === 0) {
    lines.push("  (none recorded)");
  } else {
    for (const measurement of context.measurements) {
      lines.push(`  - ${measurement.label}: ${measurement.value}`);
    }
  }
  lines.push("AI-generated segments (clinician-editable):");
  if (context.segments.length === 0) {
    lines.push("  (none)");
  } else {
    for (const segment of context.segments) {
      lines.push(`  - #${segment.index} ${segment.label}`);
    }
  }
  lines.push("");
  lines.push("Draft Findings and Impression from ONLY the above.");
  return lines.join("\n");
}

async function callAnthropic(userPrompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_KEY ?? "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API returned HTTP ${response.status}.`);
  }

  const data: unknown = await response.json();
  const schema = z.object({
    content: z.array(z.object({ type: z.string(), text: z.string().optional() }))
  });
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unexpected Anthropic response shape.");
  }
  return parsed.data.content
    .map((block) => block.text ?? "")
    .join("")
    .trim();
}

async function callOpenAiCompatible(userPrompt: string): Promise<string> {
  const url = PROVIDER === "openai" ? OPENAI_URL : LOCAL_URL;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (PROVIDER === "openai" && OPENAI_KEY) {
    headers.authorization = `Bearer ${OPENAI_KEY}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Report service returned HTTP ${response.status}.`);
  }

  const data: unknown = await response.json();
  const schema = z.object({
    choices: z
      .array(z.object({ message: z.object({ content: z.string() }) }))
      .min(1)
  });
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unexpected report response shape.");
  }
  const first = parsed.data.choices[0];
  return first ? first.message.content.trim() : "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
