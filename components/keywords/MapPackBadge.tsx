import React from 'react';

type MapPackBadgeProps = {
   /** In the map pack top three: green badge */
   inMapPack: boolean,
   /** Day (YYYY-MM-DD) the keyword dropped out of the map pack: red badge while it is not in the map pack */
   removedAt?: string | null,
};

/** The MAP badge under a keyword's country flag: green in the map pack, red after dropping out of it. */
const MapPackBadge = ({ inMapPack, removedAt = null }: MapPackBadgeProps) => {
   if (inMapPack) {
      return <span className="fflag fflag-map-pack w-[18px] h-[12px]" role="img" aria-label="Map pack top three" />;
   }
   if (removedAt) {
      const label = `Dropped out of the map pack on ${removedAt}`;
      return <span className="fflag fflag-map-pack-removed w-[18px] h-[12px]" role="img" aria-label={label} title={label} />;
   }
   return null;
};

export default MapPackBadge;
