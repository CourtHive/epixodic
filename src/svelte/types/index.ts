export type NavContext = 'archive' | 'tournament' | 'event' | 'scoring';

export interface BreadcrumbItem {
  label: string;
  path: string;
  active: boolean;
}

export interface Participant {
  participantId: string;
  participantName: string;
  participantType: 'INDIVIDUAL' | 'PAIR' | 'TEAM' | 'GROUP';
  person?: {
    standardGivenName?: string;
    standardFamilyName?: string;
  };
  individualParticipants?: Participant[];
}

export interface MatchUpSide {
  sideNumber: number;
  participantId?: string;
  participant?: Participant;
  lineUp?: LineUp;
}

export interface HydratedMatchUp {
  matchUpId: string;
  matchUpType?: string;
  matchUpStatus?: string;
  matchUpFormat?: string;
  sides?: MatchUpSide[];
  score?: {
    sets?: any[];
    points?: any[];
    scoreStringSide1?: string;
    scoreStringSide2?: string;
  };
  schedule?: {
    scheduledDate?: string;
    scheduledTime?: string;
    courtName?: string;
  };
  readyToScore?: boolean;
  winningSide?: number;
  tieMatchUps?: HydratedMatchUp[];
  tieFormat?: TieFormat;
  collectionId?: string;
  collectionPosition?: number;
  structureId?: string;
  drawId?: string;
  eventId?: string;
  tournamentId?: string;
  _appData?: Record<string, any>;
}

export interface EventInfo {
  eventId: string;
  eventName: string;
  eventType?: string;
  category?: {
    categoryName?: string;
    ageCategoryCode?: string;
  };
  drawsData?: any[];
}

export interface TournamentInfo {
  tournamentId: string;
  tournamentName: string;
  startDate?: string;
  endDate?: string;
  eventInfo?: EventInfo[];
}

export interface NavAction {
  label: string;
  icon?: string;
  action: () => void;
}

// Tie format types for TEAM matchUps
export interface TieFormat {
  tieFormatName?: string;
  winCriteria?: WinCriteria;
  collectionDefinitions?: CollectionDefinition[];
  collectionGroups?: CollectionGroup[];
}

export interface CollectionDefinition {
  collectionId: string;
  collectionName?: string;
  collectionOrder?: number;
  matchUpType?: string;
  matchUpFormat?: string;
  matchUpCount?: number;
  matchUpValue?: number;
  scoreValue?: number;
  setValue?: number;
  collectionValue?: number;
  collectionValueProfiles?: any[];
  winCriteria?: WinCriteria;
}

export interface CollectionGroup {
  groupName?: string;
  groupOrder?: number;
  groupValue?: number;
  collectionIds?: string[];
  winCriteria?: WinCriteria;
}

export interface WinCriteria {
  valueGoal?: number;
  aggregateValue?: boolean;
  tallyDirectives?: any;
}

// Future team support stubs
export interface CollectionAssignment {
  collectionId: string;
  drawPosition?: number;
  participantId?: string;
  previousParticipantId?: string;
}

export interface LineUp {
  participantId?: string;
  collectionAssignments?: CollectionAssignment[];
}
