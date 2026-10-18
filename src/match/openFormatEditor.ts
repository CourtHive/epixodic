import { FORMAT_NAMES } from '../services/matchObject/formatMigration';
import { env, resetEngine, updateMatchArchive } from '../state/env';
import { getMatchUpFormatModal } from 'courthive-components';
import { updateScore } from '../display/displayUpdate';

export function openFormatEditor() {
  const currentFormat = env.engine.getFormat();

  getMatchUpFormatModal({
    existingMatchUpFormat: currentFormat,
    callback: (format: string) => {
      if (!format) return; // User cancelled

      const pointsPlayed = (env.engine.getState().history?.points || []).length;

      if (pointsPlayed === 0) {
        resetEngine(format);
      } else {
        console.warn('[HVE] Format change mid-match not supported');
        return;
      }

      // Update UI
      const knownName = FORMAT_NAMES[format];
      const formatDisplay = knownName ? `${knownName} (${format})` : format;
      const matchFormat = document.getElementById('md_format');
      if (matchFormat) matchFormat.textContent = formatDisplay;
      const matchDescription = document.getElementById('match_description');
      if (matchDescription) matchDescription.textContent = formatDisplay;

      updateMatchArchive();
      updateScore();
    },
  });
}
