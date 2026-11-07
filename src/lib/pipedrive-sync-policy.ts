export const MAX_PIPEDRIVE_MISSING = 5;
export const allowPipedriveSweep = (missingCount: number) => missingCount <= MAX_PIPEDRIVE_MISSING;
/** Finish all probes before permitting callers to apply *any* changes. */
export async function probePipedriveActivities(
  activities: { taskId: string; activityId: number }[],
  fetchActivity: (activityId: number) => Promise<Response>,
) {
  const missing: string[] = [];
  const inactive: string[] = [];
  for (const { taskId, activityId } of activities) {
    try {
      const response = await fetchActivity(activityId);
      if (response.status === 404) {
        missing.push(taskId);
        if (!allowPipedriveSweep(missing.length)) return { aborted: true, missing: [], inactive: [] };
      } else if (response.ok) {
        const json = await response.json() as { data?: { active_flag?: boolean } };
        if (json.data?.active_flag === false) inactive.push(taskId);
      }
    } catch { /* Preserve existing per-probe network failure handling. */ }
  }
  return { aborted: false, missing, inactive };
}
export const PIPEDRIVE_404_REASON = "Pipedrive activity lookup returned HTTP 404; task preserved.";
export const PIPEDRIVE_INACTIVE_REASON = "atividade desativada no Pipedrive";
/** Missing and deactivated activities are both preserved as flagged tasks; nothing is deleted. */
export function pipedriveMissingMarks(result: { missing: string[]; inactive: string[] }) {
  return [
    ...result.missing.map(id => ({ id, patch: { pipedrive_missing: true, pipedrive_missing_reason: PIPEDRIVE_404_REASON } })),
    ...result.inactive.map(id => ({ id, patch: { pipedrive_missing: true, pipedrive_missing_reason: PIPEDRIVE_INACTIVE_REASON } })),
  ];
}
