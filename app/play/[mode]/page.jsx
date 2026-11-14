import { notFound } from 'next/navigation';
import Sports from '../../../components/sports';
import { isMode } from '../../../lib/modes.mjs';

export function generateStaticParams() {
  return [{ mode: 'football' }, { mode: 'hockey' }];
}

export function generateMetadata({ params }) {
  const name = params.mode === 'hockey' ? 'Ice Hockey' : 'Football';
  return { title: name + ' · Dungeon Stake' };
}

export default function Play({ params }) {
  if (!isMode(params.mode)) notFound();
  return <Sports mode={params.mode} />;
}
