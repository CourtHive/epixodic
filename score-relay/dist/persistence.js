import axios from 'axios';
let factoryServerUrl;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
export function configurePersistence(url) {
    factoryServerUrl = url;
}
/**
 * Push match history to competition-factory-server for persistence.
 * Retries up to 3 times with exponential backoff.
 * This is a fire-and-forget operation — failures are logged but do not
 * block the relay from broadcasting.
 */
export async function persistMatchHistory(history) {
    if (!factoryServerUrl)
        return;
    const payload = {
        params: {
            tournamentId: history.tournamentId,
            matchUpId: history.matchUpId,
            matchUpFormat: history.matchUpFormat,
            points: history.points,
            score: history.score,
        },
    };
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await axios.post(`${factoryServerUrl}/factory/matchup/score`, payload);
            return;
        }
        catch (err) {
            const isLastAttempt = attempt === MAX_RETRIES;
            if (isLastAttempt) {
                console.error(`[persist] Failed to persist match ${history.matchUpId} after ${MAX_RETRIES} attempts: ${err.message}`);
            }
            else {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
                console.warn(`[persist] Attempt ${attempt} failed for ${history.matchUpId}, retrying in ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
}
