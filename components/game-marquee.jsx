import { arcadeArt } from '../lib/arcade.mjs';

export default function GameMarquee({ game, children }) {
  return (
    <section className="game-marquee" style={{ '--cabinet-color': game.color }}>
      <img src={arcadeArt(game.id)} alt="" fetchPriority="high" />
      <div className="game-marquee-copy">
        <p className="arcade-capacity">{game.players}</p>
        <h1>{game.name}</h1>
        <p>{children || game.rules}</p>
      </div>
    </section>
  );
}
