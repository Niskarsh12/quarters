import { dailyDilemma } from "../../../../services/game_master/index.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const round = Number(params.get("round"));
  const circuit = params.get("room") === "circuit";
  if (!Number.isInteger(round) || round < 1 || round > 3 || (circuit && round === 2)) {
    return Response.json({ error: "Invalid arena room" }, { status: 400 });
  }
  return Response.json(await dailyDilemma(round, circuit));
}
