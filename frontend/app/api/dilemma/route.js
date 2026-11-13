import { dailyDilemma } from "../../../../services/game_master/index.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const round = Number(new URL(request.url).searchParams.get("round"));
  if (!Number.isInteger(round) || round < 1 || round > 3) {
    return Response.json({ error: "Choose a round from 1 to 3" }, { status: 400 });
  }
  return Response.json(await dailyDilemma(round));
}
