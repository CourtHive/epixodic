import { getEpisodes } from '../state/env';

export function groupGames(pointEpisodes?: any[]) {
  pointEpisodes = pointEpisodes || getEpisodes();
  const games: any = [{ points: [] }];
  let gameCounter = 0;
  let currentGame = 0;
  pointEpisodes?.forEach((episode: any) => {
    const point = episode.point;
    if (point.game != currentGame) {
      gameCounter += 1;
      currentGame = point.game;
      games[gameCounter] = { points: [] };
    }
    games[gameCounter].points.push(point);
    games[gameCounter].index = gameCounter;
    games[gameCounter].set = episode.set.index;
    games[gameCounter].score = episode.game.games;
    games[gameCounter].complete = episode.game.complete;
    if (episode.game.complete) games[gameCounter].winner = point.winner;
    if (episode.set.complete) games[gameCounter].lastGame = true;
  });
  return games;
  // if (set != undefined) games = games.filter(function(game) { return game.set == set });
}
