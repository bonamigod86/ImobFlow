"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Leaflet map (client-only). Renders a marker for the listing coordinates.
 * The map itself is progressively loaded only when coordinates exist.
 */
export function ListingMap({ latitude, longitude, title }: { latitude: number; longitude: number; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom: 15,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const icon = L.divIcon({
      className: "listing-marker",
      html:
        '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#4f46e5;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);margin-left:-9px;margin-top:-9px;"></div>',
      iconSize: [18, 18],
      iconAnchor: [0, 18],
    });

    L.marker([latitude, longitude], { icon, title }).addTo(map).bindPopup(`<b>${title}</b>`);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, title]);

  return <div ref={containerRef} className="h-80 w-full rounded-2xl border border-slate-200" aria-label="Localização no mapa" />;
}

export default ListingMap;