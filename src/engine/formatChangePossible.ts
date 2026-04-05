import { getEpisodes } from '../state/env';

export function formatChangePossible() {
  const episodes = getEpisodes();
  // Check if any episode has advantage scoring (score contains 'A')
  const advantages = episodes.some((ep: any) => (ep.point?.score || '').split('-').includes('A'));
  if (advantages) return false;
  if (episodes.length == 0) return true;
  const last = episodes[episodes.length - 1];
  return last.set.complete;

  // TODO: implement when umo can propagate changes to children...
  /*
      scores = points.map(point=>point.score);
      var games = match.score().counters.games.reduce((a, b) => a + b);
      var advantages = scores.map(m=>m.indexOf('A') >= 0).filter(f=>f);
      if (games < 1 && advantages < 1) return true;
      */
}
