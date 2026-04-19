/**
 * Stubs for visualization support checks removed from @tennisvisuals/scoring-visualizations.
 * These guard whether certain chart types are available for a given match format.
 * Default to true until the upstream package re-exports or replaces them.
 */
export const supportsGameVisualizations = (_format: any): boolean => true;
export const supportsPointsToVisualization = (_format: any): boolean => true;
