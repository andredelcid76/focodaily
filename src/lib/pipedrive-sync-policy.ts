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