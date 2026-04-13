/**
 * INTENNSE demo template — creates a fully-populated team matchUp
 * with realistic player names, jersey numbers, and the standard
 * INTENNSE tieFormat (2MS + 2WS + 1MD + 1WD + 1XD, aggregate scoring).
 *
 * Each call generates fresh UUIDs so multiple demos can coexist.
 */
import { tools } from 'tods-competition-factory';

const SINGLES_FORMAT = 'SET2XA-S:T10';
const DOUBLES_FORMAT = 'SET1A-S:T10';

interface DemoPlayer {
  id: string;
  firstName: string;
  lastName: string;
  sex: string;
  jerseyNumber: string;
}

function makePlayers(roster: { firstName: string; lastName: string; sex: string }[]): DemoPlayer[] {
  return roster.map((p, i) => ({
    id: tools.UUID(),
    firstName: p.firstName,
    lastName: p.lastName,
    sex: p.sex,
    jerseyNumber: String(i + 1),
  }));
}

function toParticipant(p: DemoPlayer, teamId?: string, teamName?: string) {
  return {
    participantId: p.id,
    participantName: `${p.firstName} ${p.lastName}`,
    participantType: 'INDIVIDUAL' as const,
    person: {
      standardGivenName: p.firstName,
      standardFamilyName: p.lastName,
      sex: p.sex,
      biographicalInformation: {
        teamAttributes: [
          {
            jerseyNumber: p.jerseyNumber,
            jerseyName: p.lastName.toUpperCase(),
            teamId,
            teamName,
          },
        ],
      },
    },
  };
}

function makeTieMatchUp(
  parentId: string,
  collectionId: string,
  collectionPosition: number,
  matchUpType: 'SINGLES' | 'DOUBLES',
  format: string,
  side1Players: DemoPlayer[],
  side2Players: DemoPlayer[],
  side1Team: { id: string; name: string },
  side2Team: { id: string; name: string },
) {
  const matchUpId = `${parentId}-${collectionId}-TMU-${collectionPosition}`;
  return {
    matchUpId,
    matchUpType,
    matchUpFormat: format,
    matchUpStatus: 'TO_BE_PLAYED',
    collectionId,
    collectionPosition,
    sides: [
      {
        sideNumber: 1,
        ...(matchUpType === 'DOUBLES'
          ? {
              participant: {
                participantId: tools.UUID(),
                participantName: side1Players.map((p) => p.lastName).join('/'),
                participantType: 'PAIR' as const,
                individualParticipants: side1Players.map((p) => toParticipant(p, side1Team.id, side1Team.name)),
              },
            }
          : {
              participant: toParticipant(side1Players[0], side1Team.id, side1Team.name),
            }),
      },
      {
        sideNumber: 2,
        ...(matchUpType === 'DOUBLES'
          ? {
              participant: {
                participantId: tools.UUID(),
                participantName: side2Players.map((p) => p.lastName).join('/'),
                participantType: 'PAIR' as const,
                individualParticipants: side2Players.map((p) => toParticipant(p, side2Team.id, side2Team.name)),
              },
            }
          : {
              participant: toParticipant(side2Players[0], side2Team.id, side2Team.name),
            }),
      },
    ],
    score: { scoreStringSide1: '', scoreStringSide2: '' },
  };
}

export function createIntennseDemoMatchUp() {
  const team1Roster = makePlayers([
    { firstName: 'Emmanuel', lastName: 'Cummings', sex: 'MALE' },
    { firstName: 'Julian', lastName: 'Shepard', sex: 'MALE' },
    { firstName: 'William', lastName: 'Peet', sex: 'MALE' },
    { firstName: 'Mary', lastName: 'Swift', sex: 'FEMALE' },
    { firstName: 'Elizabeth', lastName: 'Bauers', sex: 'FEMALE' },
    { firstName: 'Meg', lastName: 'Moore', sex: 'FEMALE' },
  ]);

  const team2Roster = makePlayers([
    { firstName: 'Constantine', lastName: 'Ripley', sex: 'MALE' },
    { firstName: 'Masanobu', lastName: 'Constant', sex: 'MALE' },
    { firstName: 'Italo', lastName: 'Wirt', sex: 'MALE' },
    { firstName: 'Virginia', lastName: 'Bonaparte', sex: 'FEMALE' },
    { firstName: 'Ada', lastName: 'Kingsnorth', sex: 'FEMALE' },
    { firstName: 'Zoe', lastName: 'Escher', sex: 'FEMALE' },
  ]);

  const t1Males = team1Roster.filter((p) => p.sex === 'MALE');
  const t1Females = team1Roster.filter((p) => p.sex === 'FEMALE');
  const t2Males = team2Roster.filter((p) => p.sex === 'MALE');
  const t2Females = team2Roster.filter((p) => p.sex === 'FEMALE');

  const matchUpId = tools.UUID();
  const team1Id = tools.UUID();
  const team2Id = tools.UUID();
  const team1Name = 'The Authentics';
  const team2Name = 'Cauldron';

  const t1 = { id: team1Id, name: team1Name };
  const t2 = { id: team2Id, name: team2Name };

  const tieMatchUps = [
    makeTieMatchUp(matchUpId, 'intennse-ms', 1, 'SINGLES', SINGLES_FORMAT, [t1Males[0]], [t2Males[0]], t1, t2),
    makeTieMatchUp(matchUpId, 'intennse-ms', 2, 'SINGLES', SINGLES_FORMAT, [t1Males[1]], [t2Males[1]], t1, t2),
    makeTieMatchUp(matchUpId, 'intennse-ws', 1, 'SINGLES', SINGLES_FORMAT, [t1Females[0]], [t2Females[0]], t1, t2),
    makeTieMatchUp(matchUpId, 'intennse-ws', 2, 'SINGLES', SINGLES_FORMAT, [t1Females[1]], [t2Females[1]], t1, t2),
    makeTieMatchUp(
      matchUpId,
      'intennse-md',
      1,
      'DOUBLES',
      DOUBLES_FORMAT,
      [t1Males[0], t1Males[2]],
      [t2Males[0], t2Males[2]],
      t1,
      t2,
    ),
    makeTieMatchUp(
      matchUpId,
      'intennse-wd',
      1,
      'DOUBLES',
      DOUBLES_FORMAT,
      [t1Females[0], t1Females[2]],
      [t2Females[0], t2Females[2]],
      t1,
      t2,
    ),
    makeTieMatchUp(
      matchUpId,
      'intennse-xd',
      1,
      'DOUBLES',
      DOUBLES_FORMAT,
      [t1Males[1], t1Females[1]],
      [t2Males[1], t2Females[1]],
      t1,
      t2,
    ),
  ];

  return {
    matchUpId,
    matchUpType: 'TEAM',
    matchUpStatus: 'TO_BE_PLAYED',
    sides: [
      {
        sideNumber: 1,
        drawPosition: 1,
        participant: {
          participantId: team1Id,
          participantName: team1Name,
          useOtherName: false,
          participantType: 'TEAM' as const,
          individualParticipants: team1Roster.map((p) => toParticipant(p, team1Id, team1Name)),
        },
        lineUp: team1Roster.map((p) => ({
          participantId: p.id,
          collectionAssignments: [],
        })),
      },
      {
        sideNumber: 2,
        drawPosition: 2,
        participant: {
          participantId: team2Id,
          participantName: team2Name,
          useOtherName: false,
          participantType: 'TEAM' as const,
          individualParticipants: team2Roster.map((p) => toParticipant(p, team2Id, team2Name)),
        },
        lineUp: team2Roster.map((p) => ({
          participantId: p.id,
          collectionAssignments: [],
        })),
      },
    ],
    tieMatchUps,
    tieFormat: {
      tieFormatName: 'INTENNSE',
      winCriteria: { aggregateValue: true },
      collectionDefinitions: [
        {
          collectionId: 'intennse-ms',
          collectionName: "Men's Singles",
          matchUpType: 'SINGLES',
          matchUpCount: 2,
          matchUpFormat: SINGLES_FORMAT,
          scoreValue: 1,
          gender: 'MALE',
          category: { categoryName: 'MS' },
          collectionOrder: 1,
        },
        {
          collectionId: 'intennse-ws',
          collectionName: "Women's Singles",
          matchUpType: 'SINGLES',
          matchUpCount: 2,
          matchUpFormat: SINGLES_FORMAT,
          scoreValue: 1,
          gender: 'FEMALE',
          category: { categoryName: 'WS' },
          collectionOrder: 2,
        },
        {
          collectionId: 'intennse-md',
          collectionName: "Men's Doubles",
          matchUpType: 'DOUBLES',
          matchUpCount: 1,
          matchUpFormat: DOUBLES_FORMAT,
          scoreValue: 1,
          gender: 'MALE',
          category: { categoryName: 'MD' },
          collectionOrder: 3,
        },
        {
          collectionId: 'intennse-wd',
          collectionName: "Women's Doubles",
          matchUpType: 'DOUBLES',
          matchUpCount: 1,
          matchUpFormat: DOUBLES_FORMAT,
          scoreValue: 1,
          gender: 'FEMALE',
          category: { categoryName: 'WD' },
          collectionOrder: 4,
        },
        {
          collectionId: 'intennse-xd',
          collectionName: 'Mixed Doubles',
          matchUpType: 'DOUBLES',
          matchUpCount: 1,
          matchUpFormat: DOUBLES_FORMAT,
          scoreValue: 1,
          gender: 'MIXED',
          category: { categoryName: 'XD' },
          collectionOrder: 5,
        },
      ],
    },
    score: { scoreStringSide1: '', scoreStringSide2: '' },
  };
}
