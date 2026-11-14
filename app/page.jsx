import Link from 'next/link';
import { arcadeArt, GAMES } from '../lib/arcade.mjs';

export default function Page() {
  return (
    <main className="arcade-home">
      <nav className="arcade-nav" aria-label="Arcade">
        <Link href="/" className="arcade-wordmark">
          <span className="arcade-token" aria-hidden="true">◆</span>
          Dungeon Stake
        </Link>
        <a href="#games">Game lineup <span aria-hidden="true">↓</span></a>
      </nav>

      <section className="arcade-hero" aria-labelledby="arcade-title">
        <img src={arcadeArt('arcade')} alt="" fetchPriority="high" />
        <div className="arcade-hero-copy">
          <h1 id="arcade-title">Dungeon<br /><em>Stake Arcade</em></h1>
          <p>Take on your friends or play solo against the CPU.</p>
          <a className="arcade-cta" href="#games">Choose a game <span aria-hidden="true">↓</span></a>
        </div>
      </section>

      <section className="arcade-lineup" id="games" aria-labelledby="lineup-title">
        <h2 id="lineup-title">Choose your cabinet</h2>
        <div className="arcade-grid">
          {GAMES.map(game => (
            <article className="arcade-cabinet" key={game.id} style={{ '--cabinet-color': game.color }}>
              <Link href={game.href} className="arcade-cover" tabIndex={-1} aria-hidden="true">
                <img src={arcadeArt(game.id)} alt="" />
              </Link>
              <div className="arcade-cabinet-copy">
                <p className="arcade-capacity">{game.players}</p>
                <h3>{game.name}</h3>
                <p>{game.rules}</p>
                <p>{game.options}</p>
                <Link href={game.href} className="arcade-cta">Play {game.name} <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="arcade-footer"><span>Dungeon Stake</span><span>Free play and NEAR Testnet matches</span></footer>
    </main>
  );
}
