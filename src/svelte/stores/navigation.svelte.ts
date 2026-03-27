import type { BreadcrumbItem, NavContext, NavAction as NavActionType } from '../types';

let context = $state<NavContext>('archive');
let breadcrumbs = $state<BreadcrumbItem[]>([]);
let tournamentId = $state<string | undefined>(undefined);
let eventId = $state<string | undefined>(undefined);
let tournamentName = $state('');
let eventName = $state('');

const bottomNavItems = $derived<NavActionType[]>([]);

export function getNavigationState() {
  return {
    get context() {
      return context;
    },
    get breadcrumbs() {
      return breadcrumbs;
    },
    get tournamentId() {
      return tournamentId;
    },
    get eventId() {
      return eventId;
    },
    get tournamentName() {
      return tournamentName;
    },
    get eventName() {
      return eventName;
    },
    get bottomNavItems() {
      return bottomNavItems;
    },
  };
}

export function setArchiveContext() {
  context = 'archive';
  tournamentId = undefined;
  eventId = undefined;
  tournamentName = '';
  eventName = '';
  breadcrumbs = [{ label: 'Archive', path: '/archive', active: true }];
}

export function setTournamentContext(tid: string, name: string) {
  context = 'tournament';
  tournamentId = tid;
  eventId = undefined;
  tournamentName = name;
  eventName = '';
  breadcrumbs = [
    { label: 'Archive', path: '/archive', active: false },
    { label: name, path: `/tournament/${tid}`, active: true },
  ];
}

export function setEventContext(tid: string, eid: string, tName: string, eName: string) {
  context = 'event';
  tournamentId = tid;
  eventId = eid;
  tournamentName = tName;
  eventName = eName;
  breadcrumbs = [
    { label: 'Archive', path: '/archive', active: false },
    { label: tName, path: `/tournament/${tid}`, active: false },
    { label: eName, path: `/tournament/${tid}/event/${eid}`, active: true },
  ];
}
