import { fetchRosterData, evaluatePromotion } from "../src/lib/evaluator";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  const discordId = String(req.query.discordId || "").replace(/\D/g, "").trim();

  if (!discordId) {
    return res.status(400).json({
      ok: false,
      error: "No Discord ID provided",
    });
  }

  try {
    const result = await fetchRosterData(discordId);

    if (!result?.ok || !result?.employee) {
      return res.status(404).json({
        ok: false,
        error: result?.error || "Employee not found",
      });
    }

    const evaluation = evaluatePromotion(result.employee);

    return res.status(200).json({
      ok: true,
      employee: result.employee,
      evaluation,
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Failed to fetch data",
    });
  }
}
