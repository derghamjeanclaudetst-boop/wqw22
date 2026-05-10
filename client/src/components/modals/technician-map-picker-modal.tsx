import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, MapPin, Phone, Mail, Star, CheckCircle, X, FileText, AlertCircle, Clock } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Technician } from "@shared/schema";

interface TechnicianMapPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (technician: Technician) => void;
}

const MapPicker = ({
  technicians,
  searchTerm,
  onPick,
  onConfirm,
  highlighted,
}: {
  technicians: Technician[];
  searchTerm: string;
  onPick: (t: Technician) => void;
  onConfirm: (t: Technician) => void;
  highlighted: Technician | null;
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  const filtered = technicians.filter((t) => {
    const name = `${t.firstName} ${t.lastName}`.toLowerCase();
    const s = searchTerm.toLowerCase();
    return name.includes(s) || (t.location && t.location.toLowerCase().includes(s));
  });

  const withCoords = filtered.filter(
    (t) => t.latitude && t.longitude && !isNaN(parseFloat(t.latitude)) && !isNaN(parseFloat(t.longitude))
  );

  const makeIcon = (tech: Technician, isHighlighted: boolean) =>
    L.divIcon({
      className: "custom-pick-marker",
      html: `<div style="width:34px;height:34px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.35);background:${isHighlighted ? "#2563eb" : "#ef4444"};">
        ${tech.firstName.charAt(0)}${tech.lastName.charAt(0)}
      </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });

      const center: [number, number] =
        withCoords.length > 0
          ? [
              withCoords.reduce((s, t) => s + parseFloat(t.latitude!), 0) / withCoords.length,
              withCoords.reduce((s, t) => s + parseFloat(t.longitude!), 0) / withCoords.length,
            ]
          : [39.5, -98.35];

      mapInstanceRef.current = L.map(mapRef.current).setView(center, 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(mapInstanceRef.current);
    }

    // Clear old markers
    markersRef.current.forEach((m) => mapInstanceRef.current?.removeLayer(m));
    markersRef.current.clear();

    withCoords.forEach((tech) => {
      if (!mapInstanceRef.current) return;
      const lat = parseFloat(tech.latitude!);
      const lng = parseFloat(tech.longitude!);
      const isHighlighted = highlighted?.id === tech.id;

      const marker = L.marker([lat, lng], { icon: makeIcon(tech, isHighlighted) })
        .addTo(mapInstanceRef.current)
        .on("click", () => onPick(tech))
        .on("dblclick", (e) => {
          L.DomEvent.stopPropagation(e);
          onConfirm(tech);
        });

      markersRef.current.set(tech.id, marker);
    });

    if (withCoords.length > 1 && mapInstanceRef.current) {
      const group = new L.FeatureGroup(Array.from(markersRef.current.values()));
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }

    (window as any)._mapPickerSelect = (id: number) => {
      const t = technicians.find((x) => x.id === id);
      if (t) onPick(t);
    };
  }, [withCoords.length, searchTerm]);

  // Re-render marker colors when highlighted changes without re-initializing whole map
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const tech = technicians.find((t) => t.id === id);
      if (tech) {
        marker.setIcon(makeIcon(tech, highlighted?.id === id));
      }
    });

    if (highlighted && mapInstanceRef.current) {
      const marker = markersRef.current.get(highlighted.id);
      if (marker) {
        const latlng = marker.getLatLng();
        mapInstanceRef.current.panTo(latlng);
      }
    }
  }, [highlighted]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative rounded-lg overflow-hidden border" style={{ height: 360, zIndex: 0, isolation: "isolate" }}>
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />

      {withCoords.length === 0 && (
        <div className="absolute inset-0 bg-white/95 dark:bg-gray-900/95 flex items-center justify-center z-10">
          <div className="text-center p-6">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {filtered.length > 0
                ? "These technicians have no GPS coordinates set"
                : "No technicians match your search"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const w9Badge = (tech: Technician) => {
  if (!tech.w9Status || !tech.w9FileName)
    return (
      <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">
        <AlertCircle className="h-2.5 w-2.5 mr-1" />No W9
      </Badge>
    );
  if (tech.w9Status === "verified")
    return (
      <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">
        <CheckCircle className="h-2.5 w-2.5 mr-1" />W9 Verified
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-200 bg-yellow-50">
      <Clock className="h-2.5 w-2.5 mr-1" />W9 Pending
    </Badge>
  );
};

export function TechnicianMapPickerModal({ isOpen, onClose, onSelect }: TechnicianMapPickerModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [highlighted, setHighlighted] = useState<Technician | null>(null);

  const { data: technicians = [], isLoading } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setHighlighted(null);
    }
  }, [isOpen]);

  const filtered = (technicians as Technician[]).filter((t) => {
    const name = `${t.firstName} ${t.lastName}`.toLowerCase();
    const s = searchTerm.toLowerCase();
    return name.includes(s) || (t.location && t.location.toLowerCase().includes(s)) || (t.specialization && t.specialization.toLowerCase().includes(s));
  });

  const handleConfirm = () => {
    if (highlighted) {
      onSelect(highlighted);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            Select Technician from Map
          </DialogTitle>
          <DialogDescription>
            Single-click a marker or name to preview. Double-click to select immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-0 overflow-hidden" style={{ height: "calc(90vh - 120px)" }}>
          {/* Search bar */}
          <div className="px-6 py-3 border-b">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Search by name, specialization, or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: technician list */}
            <div className="w-64 border-r overflow-y-auto shrink-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No results</div>
              ) : (
                filtered.map((tech) => (
                  <button
                    key={tech.id}
                    onClick={() => setHighlighted(tech)}
                    onDoubleClick={() => { onSelect(tech); onClose(); }}
                    title="Double-click to select immediately"
                    className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 ${
                      highlighted?.id === tech.id ? "bg-blue-50 dark:bg-blue-950/30 border-l-4 border-l-blue-600" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {tech.firstName} {tech.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{tech.specialization}</p>
                        {tech.location && (
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />{tech.location}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 mt-0.5">{w9Badge(tech)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Right: map */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 p-3">
                <MapPicker
                  technicians={technicians as Technician[]}
                  searchTerm={searchTerm}
                  onPick={setHighlighted}
                  onConfirm={(tech) => { onSelect(tech); onClose(); }}
                  highlighted={highlighted}
                />
              </div>

              {/* Selected technician preview */}
              {highlighted && (
                <Card className="mx-3 mb-3 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">
                            {highlighted.firstName} {highlighted.lastName}
                          </p>
                          {w9Badge(highlighted)}
                        </div>
                        <p className="text-xs text-muted-foreground">{highlighted.specialization}</p>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {highlighted.phone && (
                            <span className="flex items-center text-xs text-muted-foreground gap-1">
                              <Phone className="h-3 w-3" />{highlighted.phone}
                            </span>
                          )}
                          {highlighted.email && (
                            <span className="flex items-center text-xs text-muted-foreground gap-1">
                              <Mail className="h-3 w-3" />{highlighted.email}
                            </span>
                          )}
                          {highlighted.hourlyRate && (
                            <span className="text-xs font-medium text-green-600">${highlighted.hourlyRate}/hr</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => setHighlighted(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                        <Button size="sm" onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700 text-white">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Select
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!highlighted && (
                <div className="mx-3 mb-3 p-3 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
                  Single-click to preview · Double-click to select immediately
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
