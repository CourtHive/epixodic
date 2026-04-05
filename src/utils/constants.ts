// Point result constants (match factory PointResult type)
export const ACE = 'Ace';
export const WINNER = 'Winner';
export const DOUBLE_FAULT = 'Double Fault';
export const UNFORCED_ERROR = 'Unforced Error';
export const FORCED_ERROR = 'Forced Error';
export const PENALTY = 'Penalty';

// Hand constants (match factory hand type)
export const FOREHAND = 'Forehand';
export const BACKHAND = 'Backhand';

// Convenience arrays
export const WINNER_RESULTS: string[] = [WINNER, ACE];
export const NO_DECORATION_RESULTS: string[] = [PENALTY, ACE];
export const FAULT_DECORATION_RESULTS: string[] = [DOUBLE_FAULT];
export const FAULT_TYPES = ['Long', 'Wide', 'Net'];

// INTENNSE-specific result constants
export const TOUCH = 'Touch';
export const FAULT = 'Fault';
export const CAUGHT = 'Caught';
export const INTENNSE_FAULT_TYPES = ['Long', 'Wide', 'Net', 'Caught'];

export const CENTER = 'center';
export const RIGHT = 'right';
export const LEFT = 'left';
