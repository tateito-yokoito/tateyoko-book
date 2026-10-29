export const BOOK_PHOTO_PLACEMENTS = Object.freeze({
  OPENER: "opener",
  AFTER_FULL: "after_full",
  AFTER_HALF: "after_half",
  EXCLUDED: "excluded"
});

const validPlacements = new Set(Object.values(BOOK_PHOTO_PLACEMENTS));

export function photoBookLayout(photo, index = 0) {
  const saved = photo?.bookLayout || photo?.meta_json?.book_layout || {};
  return {
    placement: validPlacements.has(saved.placement)
      ? saved.placement
      : index === 0 ? BOOK_PHOTO_PLACEMENTS.OPENER : BOOK_PHOTO_PLACEMENTS.AFTER_FULL,
    fit: saved.fit === "cover" ? "cover" : "contain",
    positionX: Math.min(100, Math.max(0, Number(saved.positionX ?? 50) || 0)),
    positionY: Math.min(100, Math.max(0, Number(saved.positionY ?? 50) || 0))
  };
}

export function bookPhotoSlots(photos = []) {
  const placed = photos.map((photo, index) => ({ ...photo, bookLayout: photoBookLayout(photo, index) }));
  const opener = placed.find(photo => photo.bookLayout.placement === BOOK_PHOTO_PLACEMENTS.OPENER) || null;
  // Old or malformed records may contain more than one opener. Keep every
  // image in the printed work; only the first can occupy the question page.
  return {
    opener,
    afterFull: placed.filter(photo => photo.bookLayout.placement === BOOK_PHOTO_PLACEMENTS.AFTER_FULL
      || photo !== opener && photo.bookLayout.placement === BOOK_PHOTO_PLACEMENTS.OPENER),
    afterHalf: placed.filter(photo => photo.bookLayout.placement === BOOK_PHOTO_PLACEMENTS.AFTER_HALF),
    excluded: placed.filter(photo => photo.bookLayout.placement === BOOK_PHOTO_PLACEMENTS.EXCLUDED)
  };
}

export function canPlaceBookPhoto(photos, placement, movingId = null) {
  if (!validPlacements.has(placement)) return false;
  // Existing excluded photos remain readable, but new exclusions are no longer offered.
  if (placement === BOOK_PHOTO_PLACEMENTS.EXCLUDED) return false;
  const others = photos.filter(photo => photo.id !== movingId);
  const slots = bookPhotoSlots(others);
  if (placement === BOOK_PHOTO_PLACEMENTS.OPENER) return !slots.opener;
  if (placement === BOOK_PHOTO_PLACEMENTS.AFTER_FULL) return !slots.afterFull.length && !slots.afterHalf.length;
  return !slots.afterFull.length && slots.afterHalf.length < 2;
}
