// The gateway keeps the most recent reading in memory. Its age lets us avoid
// presenting an old owner's cached reading to a newly claimed account.
export function readingBelongsToCurrentTenure(item, registration, now = Date.now()) {
  if (!registration?.claimedAt || !registration?.ownershipEpoch) return true;
  if (!item || !Number.isFinite(item.ageSeconds)) return false;
  const claimedAt = new Date(registration.claimedAt).getTime();
  if (!Number.isFinite(claimedAt)) return false;
  return now - item.ageSeconds * 1000 >= claimedAt + 1000;
}
