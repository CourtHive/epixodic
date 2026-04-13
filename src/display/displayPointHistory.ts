import { env, getEpisodes } from '../state/env';
import { supportsGameVisualizations } from './vizSupport';
import { WINNER_RESULTS } from '../utils/constants';

export function displayPointHistory() {
  const episodeGames = groupGames();
  const players = env.metadata.players;
  const hasDirectActions = env.directActions.length > 0;
  const hasEpisodeGames = episodeGames.some((g: any) => g.points?.length);

  if (!hasDirectActions && !hasEpisodeGames) return false;

  let html = '';

  // Render direct actions (games/sets added without points) in order
  env.directActions.forEach((action: any) => {
    html += directActionEntry(action, players);
  });

  // Render episode-based games (games with point data)
  episodeGames.forEach((game: any) => {
    if (game.points && game.points.length) html += gameEntry(game, players);
  });

  // Always show match duration (will show 00:00:00 if no timestamps yet)
  html += `
    <div class="flexrows ph_game">
      <div class='ph_margin' style='width: 100%'>
          <div class='flexcenter' style='width: 100%'>Duration ${matchDuration()}</div>
      </div>
    </div>
  `;

  const phFrame = document.getElementById('ph_frame');
  if (phFrame) phFrame.innerHTML = html;
}

function directActionEntry(action: any, players: any[]) {
  if (action.type === 'set') {
    const score = `${action.side1Score}-${action.side2Score}`;
    const winner = players[action.winner].participantName;
    return `
      <div class="flexrows ph_game">
        <div class='ph_margin flexrows'>
          <div class="ph_server">${winner}</div>
          <div class="ph_action flexcenter">Set</div>
          <div class='ph_rally ph_won'><b>${score}</b></div>
        </div>
      </div>`;
  }
  if (action.type === 'game') {
    const winner = players[action.winner].participantName;
    const score = action.score ? action.score.join('-') : '';
    return `
      <div class="flexrows ph_game">
        <div class='ph_margin flexrows'>
          <div class="ph_server">${winner}</div>
          <div class="ph_action flexcenter">Game</div>
          <div class='ph_rally ph_won'><b>${score}</b></div>
        </div>
      </div>`;
  }
  return '';
}

function groupGames() {
  const pointEpisodes = getEpisodes();
  const games: any = [{ points: [] }];
  let gameCounter = 0;
  let currentGame = 0;
  pointEpisodes.forEach((episode: any) => {
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
}

function gameEntry(game: any, players: any[]) {
  const last_point = game.points[game.points.length - 1];
  const game_score = game.complete ? game.score.join('-') : undefined;
  const tiebreak = last_point.tiebreak;
  const server = tiebreak ? 'Tiebreak' : players[last_point.server].participantName;
  const service = tiebreak ? '' : last_point.server ? 'playertwo' : 'playerone';
  const servergame = tiebreak ? '' : last_point.server == last_point.winner ? 'won' : 'lost';
  const showFish = supportsGameVisualizations(env.engine.getFormat());
  const fishIcon = showFish
    ? `<div class='viewGameFish ph_fish iconfish' gameIndex='${game.index}'></div>`
    : '';
  let html = `
         <div class="flexrows ph_game">
            <div class='ph_margin flexrows'>
               <div class="ph_server ${service}">${server}</div>
               <div class="ph_action flexcenter">
                  ${fishIcon}
               </div>
               <div class='viewGameFish ph_rally ph_${servergame}' gameIndex="${game.index}"'>
                  <b class="viewGameFish" gameIndex="${game.index}">${game_score || ''}</b>
               </div>
            </div>
         </div>
      `;
  game.points.forEach((point: any) => {
    html += pointEntry(
      point,
      players,
      // game.complete && index == game.points.length - 1 ? game.score.join('-') : undefined
    );
  });
  return html;
}

function getPlayerInitials(point: any, players: any[]): string {
  const shotByIndex = WINNER_RESULTS.includes(point.result) ? point.winner : 1 - point.winner;
  return players[shotByIndex].participantName
    .split(' ')
    .map((name: string) => name[0])
    .join('');
}

function formatPointDescription(point: any, players: any[]): string {
  if (!point.result) return '';
  const initials = getPlayerInitials(point, players);
  const hand = point.hand ? point.hand + ' ' : '';
  return `${initials}: ${hand}${point.result}`;
}

function formatTiebreakScore(point_score: string, isServer: boolean): string {
  return isServer ? `&nbsp;${point_score}*` : `*${point_score}&nbsp;`;
}

function pointEntry(point: any, players: any[]) {
  const evenodd = point.index % 2 ? 'even' : 'odd';
  let point_score = !point.tiebreak && point.server ? point.score.split('-').reverse().join('-') : point.score;
  const point_description = formatPointDescription(point, players);
  point_score = point_score == '0-0' ? 'GAME' : point_score;
  if (point.tiebreak) point_score = formatTiebreakScore(point_score, point.server);
  const rally = point.rallyLength ? point.rallyLength : '';
  return `
    <div class='flexrows ph_episode' pointIndex="${point.index}">
        <div class='ph_point_${evenodd} flexrows'>
          <div class='viewEditPoint ph_result'>${point_description}</div>
          <div class='viewEditPoint ph_score'>${point_score} </div>
          <div class='viewEditPoint ph_score'>${rally}</div>
        </div>
    </div>
    `;
}

function matchDuration() {
  const points = env.engine.getState().history?.points || [];

  // Filter out points without valid timestamps
  const timestamps = points
    .map((p: any) => p.uts)
    .filter((t: any) => t !== undefined && t !== null && !isNaN(t));

  // If no valid timestamps, return 00:00:00
  if (timestamps.length < 2) {
    return '00:00:00';
  }

  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);
  const seconds = (end - start) / 1000.0;

  // Return 00:00:00 if calculation results in invalid number
  if (isNaN(seconds) || seconds < 0) {
    return '00:00:00';
  }

  return HHMMSS(seconds);
}

function HHMMSS(s: any) {
  const sec_num = parseInt(s, 10); // don't forget the second param
  let hours: any = Math.floor(sec_num / 3600);
  let minutes: any = Math.floor((sec_num - hours * 3600) / 60);
  let seconds: any = sec_num - hours * 3600 - minutes * 60;

  if (hours < 10) {
    hours = '0' + hours;
  }
  if (minutes < 10) {
    minutes = '0' + minutes;
  }
  if (seconds < 10) {
    seconds = '0' + seconds;
  }
  return hours + ':' + minutes + ':' + seconds;
}
