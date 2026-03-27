import { stateChangeEvent, visibleButtons } from '../display/displayUpdate';
import { resetButton, resetStyles } from './events';
import { checkMatchEnd } from '../engine/checkMatchEnd';
import { buttons, env, settings, engineEvents } from '../state/env';
import { strokeSlider } from './strokeSlider';
import {
  ACE,
  WINNER,
  DOUBLE_FAULT,
  UNFORCED_ERROR,
  FORCED_ERROR,
  PENALTY,
  NO_DECORATION_RESULTS,
  FAULT_DECORATION_RESULTS,
} from '../utils/constants';
import { pointLogger } from '../services/pointLogger';

const toggles: any = {};

export function classAction(element: any) {
  const action: string = element.getAttribute('action');
  let side: number = parseInt(element.getAttribute('side') ?? 0);
  const service: string = element.getAttribute('service');
  const playerRole: string = element.getAttribute('role');

  if (checkMatchEnd()) return;
  const slider_side = side ? 'right' : 'left';
  if (env.swap_sides && ['server', 'receiver'].indexOf(playerRole) < 0) side = 1 - side;
  resetStyles();

  function changeValue(classes: any, value: any) {
    const objs = Array.from(document.querySelectorAll(classes));
    objs.forEach((element) => (element.innerHTML = value));
  }

  function rallyMode() {
    env.rally_mode = true;
    Array.from(document.querySelectorAll('.modeforce')).forEach((div: any) => (div.style.display = 'flex'));
    changeValue('.vs_action_button.winner', 'Winner');
    changeValue('.vs_action_button.fault', 'UFE');
    changeValue('.vs_action_button.forced', 'Forced');
    Array.from(document.querySelectorAll('.vs_mode_button')).forEach((button) => {
      if (['Serve', 'Return', '2nd Serve'].indexOf(button.innerHTML) >= 0) button.innerHTML = 'Base Line';
    });
  }

  const actions: any = {
    firstServe() {
      env.serve2nd = false;
    },
    secondServe() {
      env.serve2nd = !toggles.serve2nd;
      toggles.serve2nd = !toggles.serve2nd;
    },
    fault(side: number) {
      if (side != env.serving) return undefined;
      if (env.serve2nd) return { winner: 1 - side, result: DOUBLE_FAULT, code: 'D' };
      const player_side = env.swap_sides ? 1 - side : side;
      changeValue(`.fault.display_${player_side}_serving`, DOUBLE_FAULT);
      changeValue(`.fault.modeerr_player${player_side}`, DOUBLE_FAULT);
      const server_side = env.swap_sides ? 1 - env.serving : env.serving;
      const server_mode = `.modeaction_player${server_side}`;
      Array.from(document.querySelectorAll(server_mode)).forEach((div) => (div.innerHTML = '2nd Serve'));
      env.serve2nd = true;
    },
    doubleFault(side: number) {
      return side != env.serving ? undefined : { winner: 1 - side, result: DOUBLE_FAULT, code: 'd' };
    },
    ace(side: number) {
      return side != env.serving ? undefined : { winner: side, result: ACE, code: env.serve2nd ? 'a' : 'A' };
    },
    winner(side: number) {
      return { winner: side, result: WINNER };
    },
    unforced(side: number) {
      return { winner: 1 - side, result: UNFORCED_ERROR };
    },
    forced(side: number) {
      return { winner: 1 - side, result: FORCED_ERROR };
    },
    point(side: number) {
      return { winner: side };
    },
    penalty(side: number) {
      return {
        winner: 1 - side,
        result: PENALTY,
        code: side == env.serving ? 'P' : 'Q',
      };
    },

    modewin(side: number, point: any) {
      const action = element.innerHTML;
      if (action == 'Ace') return actions.ace(side, point);
      if (action == 'Winner') return actions.winner(side, point);
    },
    modeerr(side: number, point: any) {
      const action = element.innerHTML;
      if (action == 'Fault' || action == DOUBLE_FAULT) return actions.fault(side, point);
      if (action == 'UFE') return actions.unforced(side, point);
      if (action == 'Forced') return actions.forced(side, point);
      if (action == 'Let') return actions.let(side, point);
    },
    modeaction() {
      const action = element.innerHTML;
      if (['Serve', '2nd Serve', 'Return'].indexOf(action) >= 0) {
        rallyMode();
      }
      if (action == 'Serve' || action == 'Return') {
        rallyMode();
      }
      if (action == 'Net') {
        element.innerHTML = 'Base Line';
      }
      if (action == 'Base Line') {
        element.innerHTML = 'Net';
      }
    },
    rally() {
      const action = element.innerHTML;
      env.rally = parseInt((action.match(/\d+/g) || ['0']).join(''));
      env.rally += 1;
      changeValue(`.rally`, `Rally: ${env.rally}`);
      if (env.rally == 1) rallyMode();
    },
    game(side: number) {
      engineEvents.gameJustCompleted = false;
      engineEvents.setJustCompleted = false;
      engineEvents.matchJustCompleted = false;
      engineEvents.gameWinner = undefined;
      env.engine.addGame({ winner: side });
      const score = [...(env.engine.getScore().games || [0, 0])];
      const setIndex = (env.engine.getState().score?.sets || []).length;
      env.directActions.push({ type: 'game', winner: side, score, setIndex });
      stateChangeEvent();
      checkMatchEnd();
    },
    set(side: number) {
      engineEvents.gameJustCompleted = false;
      engineEvents.setJustCompleted = false;
      engineEvents.matchJustCompleted = false;
      engineEvents.gameWinner = undefined;
      const side1Score = side === 0 ? 6 : 0;
      const side2Score = side === 1 ? 6 : 0;
      const winningSide = (side + 1) as 1 | 2;
      const setIndex = (env.engine.getState().score?.sets || []).length;
      env.engine.addSet({ side1Score, side2Score, winningSide });
      env.directActions.push({ type: 'set', winner: side, side1Score, side2Score, setIndex });
      stateChangeEvent();
      checkMatchEnd();
    },
    let() {
      // Broadcasting removed
      env.lets += 1;
      // reset serve clock
    },
  };

  playClickSound();
  if (element.id) styleButton(element.id);
  if (service && service == 'second_service') env.serve2nd = true;
  if (Object.keys(actions).indexOf(action) < 0) return undefined;
  const player_position = ['server', 'receiver'].indexOf(playerRole);
  if (player_position >= 0) side = player_position ? env.receiving : env.serving;
  const point: any = env.serve2nd ? { first_serve: { error: 'Error', serves: ['0e'] } } : {};
  const result = actions[action](side, point);
  if (result) {
    processPoint(point, result, slider_side);
  }
  visibleButtons();
}

function playClickSound() {
  const sound: any = document.getElementById('click');
  if (sound && settings.audible_clicks) {
    sound.play().catch(() => {
      /* Autoplay blocked - expected behavior */
    });
  }
}

function processPoint(point: any, result: any, slider_side: string) {
  checkStartTime();
  Object.assign(point, result);
  if (env.rally) point.rally = env.rally;
  const point_location = getPointLocation(point);
  if (point_location) point.location = point_location;

  // Reset event flags before addPoint (eventHandlers set them during addPoint)
  engineEvents.gameJustCompleted = false;
  engineEvents.setJustCompleted = false;
  engineEvents.matchJustCompleted = false;
  engineEvents.gameWinner = undefined;

  // Add point via ScoringEngine (returns void)
  // Always pass the current server so every point records the correct value.
  const addPointOpts: any = { winner: point.winner, result: point.result, server: env.serving };
  if (point.rally) addPointOpts.rallyLength = point.rally;
  if (point.location) addPointOpts.location = point.location;
  if (point.first_serve) addPointOpts.first_serve = point.first_serve;
  env.engine.addPoint(addPointOpts);

  const matchContinues = !env.engine.isComplete();
  const gameJustCompleted = engineEvents.gameJustCompleted;

  pointLogger.log(point);

  const isFaultResult = FAULT_DECORATION_RESULTS.includes(point.result);
  if (settings.track_shot_types && matchContinues && point.result && !NO_DECORATION_RESULTS.includes(point.result)) {
    const mode = isFaultResult ? 'fault' : 'stroke';
    strokeSlider(slider_side, point.result, () => checkMatchEnd({ game: { complete: gameJustCompleted } }), mode);
  } else {
    checkMatchEnd({ game: { complete: gameJustCompleted } });
  }

  env.rally = 0;
  env.lets = 0;

  stateChangeEvent();
}

function styleButton(id: string) {
  const button = document.getElementById(id);
  if (!button) return;
  if (buttons[id].type == 'flash') {
    button.style.backgroundColor = buttons[id].color;
    button.style.color = 'white';
    setTimeout(() => resetStyles(), 300);
  } else if (buttons[id].type == 'toggle') {
    if (button.style.backgroundColor == 'white') {
      env.serve2nd = id == 'second_serve';
      button.style.backgroundColor = buttons[id].color;
      button.style.color = 'white';
    } else {
      env.serve2nd = false;
      button.style.backgroundColor = 'white';
      button.style.color = buttons[id].color;
    }
    const toggle_ids = Object.keys(buttons).filter((f) => buttons[f].type == 'toggle');
    toggle_ids.filter((f) => f != id).forEach((id: string) => resetButton(id));
  }
}

function checkStartTime() {
  const points = env.engine.getState().history?.points || [];
  if (points.length == 0) {
    // if no points, define new start time
    const date = new Date();
    Object.assign(env.metadata.match, { date: date.valueOf() });
  }
}

function isPlayerAtNet(playerIndex: number): boolean {
  const selector = `.modeaction_player${playerIndex}`;
  return document.querySelectorAll(selector)[0]?.innerHTML == 'Net';
}

function getPointLocation(point: any) {
  const p0net = isPlayerAtNet(0);
  const p1net = isPlayerAtNet(1);
  if (!p0net && !p1net) return undefined;

  const isError = point.result == UNFORCED_ERROR || point.result == FORCED_ERROR;
  const isWinner = point.result == WINNER;

  // For errors, the loser (non-winner) was at net; for winners, the winner was at net
  const netPlayer = isError ? 1 - point.winner : isWinner ? point.winner : -1;
  if (netPlayer === 0 && p0net) return 'Net';
  if (netPlayer === 1 && p1net) return 'Net';
}
