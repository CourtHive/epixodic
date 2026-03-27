import { newMatch } from '../match/displayMatchArchive';
import { eventManager } from './eventManager';
import { strokeAction } from './strokeAction';
import { faultAction } from './faultAction';
import { classAction } from './classAction';
import { exportMatch } from '../match/exportMatch';
import { toggleChart } from '../display/toggleChart';
import { updateStats } from '../match/updateStats';
import { editPlayer } from '../player/editPlayer';
import {
  outcomeEntry,
  matchArchive,
  settings,
  mainMenu,
  swapAction,
  undoAction,
  redoAction,
  changeServer,
  viewStats,
  viewPointHistory,
  viewMomentum,
  viewGameTree,
  viewMatchFormat,
  viewGameFish,
  viewEditPoint,
} from './clickActions';

export function registerEvents() {
  eventManager
    .register('toggleChart', 'tap', toggleChart)
    .register('newMatch', 'tap', newMatch)
    .register('exportMatch', 'tap', exportMatch)
    .register('settings', 'tap', settings)
    .register('outcomeEntry', 'tap', outcomeEntry)
    .register('matchArchive', 'tap', matchArchive)
    .register('mainMenu', 'tap', mainMenu)
    .register('updateStats', 'tap', updateStats)
    .register('strokeAction', 'tap', strokeAction)
    .register('faultAction', 'tap', faultAction)
    .register('swapAction', 'tap', swapAction)
    .register('undoAction', 'tap', undoAction)
    .register('redoAction', 'tap', redoAction)
    .register('changeServer', 'tap', changeServer)
    .register('editPlayer', 'tap', editPlayer)
    .register('viewGameFish', 'tap', viewGameFish)
    .register('viewStats', 'tap', viewStats)
    .register('viewGameTree', 'tap', viewGameTree)
    .register('viewMomentum', 'tap', viewMomentum)
    .register('viewEditPoint', 'tap', viewEditPoint)
    .register('viewMatchFormat', 'tap', viewMatchFormat)
    .register('viewPointHistory', 'tap', viewPointHistory)
    .register('classAction', 'tap', classAction);
}
