import { useState, useEffect, useRef } from "react";
import { Search, Star, Phone, Mail, MapPin, CreditCard, Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdvancedPermissionGuard, PageGuard } from "@/components/rbac/advanced-permission-guard";
import { RateTechnicianModal } from "@/components/modals/rate-technician-modal";
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Technician } from "@shared/schema";

// Geographic search interface
interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

// Geographic search component
const GeographicSearch = ({ onLocationSelect, mapInstance }: {
  onLocationSelect: (lat: number, lon: number, name: string) => void;
  mapInstance: L.Map | null;
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const searchLocation = async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      // Use Nominatim (OpenStreetMap's free geocoding service)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'TechnicianMapApp/1.0'
          }
        }
      );
      
      if (response.ok) {
        const results = await response.json();
        setSearchResults(results);
        setShowResults(results.length > 0);
      }
    } catch (error) {
      console.error('Geocoding search failed:', error);
      setSearchResults([]);
    }
    setIsSearching(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      searchLocation(value);
    }, 500);
  };

  const handleResultSelect = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    onLocationSelect(lat, lon, result.display_name);
    setShowResults(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
        <Input
          placeholder="Search city, country, address..."
          value={searchQuery}
          onChange={handleSearchChange}
          className="pl-10 pr-8 w-80"
        />
        {(searchQuery || isSearching) && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      
      {/* Search Results Dropdown */}
      {showResults && searchResults.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-50 mt-1 max-h-60 overflow-y-auto">
          {searchResults.map((result, index) => (
            <button
              key={index}
              onClick={() => handleResultSelect(result)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-sm"
            >
              <div className="font-medium text-gray-900 truncate">
                {result.display_name}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Interactive Leaflet Map Component with accurate positioning
const MapComponent = ({ technicians, onMarkerClick, searchTerm }: {
  technicians: Technician[];
  onMarkerClick: (technician: Technician) => void;
  searchTerm: string;
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const searchMarkerRef = useRef<L.Marker | null>(null);

  const filteredTechnicians = technicians.filter(tech => {
    const fullName = `${tech.firstName} ${tech.lastName}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase()) ||
           (tech.location && tech.location.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  // Filter technicians with valid coordinates
  const techsWithCoords = filteredTechnicians.filter(tech => 
    tech.latitude && tech.longitude && 
    !isNaN(parseFloat(tech.latitude)) && !isNaN(parseFloat(tech.longitude))
  );

  // Handler for geographic search location selection
  const handleLocationSelect = (lat: number, lon: number, name: string) => {
    if (!mapInstanceRef.current) return;
    
    // Remove existing search marker
    if (searchMarkerRef.current) {
      mapInstanceRef.current.removeLayer(searchMarkerRef.current);
    }
    
    // Create search location marker
    const searchIcon = L.divIcon({
      className: 'custom-search-marker',
      html: `
        <div class="bg-blue-500 text-white rounded-full shadow-lg border-2 border-white text-xs font-bold flex items-center justify-center" 
             style="width: 36px; height: 36px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
    
    searchMarkerRef.current = L.marker([lat, lon], { icon: searchIcon })
      .addTo(mapInstanceRef.current)
      .bindPopup(`
        <div class="p-2">
          <h3 class="font-semibold text-blue-600">Search Location</h3>
          <p class="text-sm text-gray-700">${name}</p>
        </div>
      `);
    
    // Pan to the searched location
    mapInstanceRef.current.setView([lat, lon], 12);
    
    // Show popup briefly
    searchMarkerRef.current.openPopup();
    setTimeout(() => {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.closePopup();
      }
    }, 3000);
  };

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map if not already created
    if (!mapInstanceRef.current) {
      // Fix default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      const center = techsWithCoords.length > 0 
        ? [
            techsWithCoords.reduce((sum: number, tech: any) => sum + parseFloat(tech.latitude!), 0) / techsWithCoords.length,
            techsWithCoords.reduce((sum: number, tech: any) => sum + parseFloat(tech.longitude!), 0) / techsWithCoords.length
          ] as [number, number]
        : [40.7128, -74.0060] as [number, number]; // Default to NYC

      mapInstanceRef.current = L.map(mapRef.current).setView(center, 5);

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapInstanceRef.current);
    }

    // Clear existing markers
    markersRef.current.forEach(marker => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];

    // Add markers for technicians
    techsWithCoords.forEach((tech: any) => {
      if (!mapInstanceRef.current) return;

      const lat = parseFloat(tech.latitude!);
      const lng = parseFloat(tech.longitude!);

      // Create custom marker icon
      const customIcon = L.divIcon({
        className: 'custom-technician-marker',
        html: `
          <div class="bg-red-500 text-white rounded-full shadow-lg border-2 border-white text-xs font-bold flex items-center justify-center" 
               style="width: 32px; height: 32px;">
            ${tech.firstName.charAt(0)}${tech.lastName.charAt(0)}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([lat, lng], { icon: customIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div class="p-2">
            <h3 class="font-semibold">${tech.firstName} ${tech.lastName}</h3>
            <p class="text-sm text-gray-600">${tech.specialization}</p>
            ${tech.location ? `<p class="text-xs text-gray-500">${tech.location}</p>` : ''}
            <button onclick="window.selectTechnician(${tech.id})" 
                    class="mt-2 bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600">
              View Details
            </button>
          </div>
        `);

      markersRef.current.push(marker);
    });

    // Fit map to show all markers
    if (techsWithCoords.length > 1 && mapInstanceRef.current) {
      const group = new L.FeatureGroup(markersRef.current);
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }

    // Global function for popup buttons
    (window as any).selectTechnician = (id: number) => {
      const tech = techsWithCoords.find((t: any) => t.id === id);
      if (tech) onMarkerClick(tech);
    };

    return () => {
      // Cleanup function
      if (mapInstanceRef.current) {
        markersRef.current.forEach(marker => {
          mapInstanceRef.current!.removeLayer(marker);
        });
        markersRef.current = [];
      }
    };
  }, [techsWithCoords, onMarkerClick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-full relative rounded-lg overflow-hidden border" style={{ zIndex: 0, isolation: 'isolate' }}>
      <div ref={mapRef} className="h-full w-full min-h-[600px]" style={{ height: '100%' }} />
      
      {/* Geographic Search Component */}
      <div className="absolute top-4 left-4 z-[1000] pointer-events-auto">
        <div className="flex gap-2">
          <GeographicSearch 
            onLocationSelect={handleLocationSelect}
            mapInstance={mapInstanceRef.current}
          />
          <Button
            onClick={() => {
              if (mapInstanceRef.current && techsWithCoords.length > 0) {
                // Remove search marker
                if (searchMarkerRef.current) {
                  mapInstanceRef.current.removeLayer(searchMarkerRef.current);
                  searchMarkerRef.current = null;
                }
                // Fit map to show all technicians
                const group = new L.FeatureGroup(markersRef.current);
                mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
              }
            }}
            variant="outline"
            size="sm"
            className="h-10"
            title="Show all technicians"
          >
            <MapPin className="h-4 w-4" />
            Reset View
          </Button>
        </div>
      </div>
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 pointer-events-auto z-[1000]">
        <div className="text-sm font-medium text-gray-900 mb-2">Map Legend</div>
        <div className="space-y-1">
          <div className="flex items-center text-xs text-gray-600">
            <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
            Technicians ({techsWithCoords.length})
          </div>
          <div className="flex items-center text-xs text-gray-600">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
            Search Location
          </div>
        </div>
      </div>
      
      {/* Info overlay when no coordinates available */}
      {techsWithCoords.length === 0 && (
        <div className="absolute inset-0 bg-white/95 flex items-center justify-center z-[1001]">
          <div className="text-center p-6">
            <MapPin className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">Interactive Map View</h3>
            <p className="text-sm text-gray-500 mb-4">
              {filteredTechnicians.length > 0 
                ? `${filteredTechnicians.length} technician(s) found but no location coordinates available`
                : "No technicians match your search criteria"
              }
            </p>
            
            {/* Show technicians without coordinates as a list */}
            {filteredTechnicians.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-md mx-auto">
                {filteredTechnicians.slice(0, 6).map((tech) => (
                  <Button
                    key={tech.id}
                    variant="outline"
                    size="sm"
                    onClick={() => onMarkerClick(tech)}
                    className="text-xs justify-start"
                  >
                    <MapPin className="h-3 w-3 mr-2" />
                    <div className="text-left">
                      <div className="font-medium">{tech.firstName} {tech.lastName}</div>
                      {tech.location && (
                        <div className="text-gray-500 text-xs truncate">{tech.location}</div>
                      )}
                    </div>
                  </Button>
                ))}
                {filteredTechnicians.length > 6 && (
                  <div className="col-span-2 text-xs text-gray-500 text-center">
                    +{filteredTechnicians.length - 6} more technicians
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function TechnicianMapPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  const { data: technicians, isLoading } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const parsePaymentMethods = (methods: string | null) => {
    if (!methods) return [];
    
    try {
      // Handle JSON string format
      if (methods.startsWith('[') || methods.startsWith('{')) {
        return JSON.parse(methods);
      }
      
      // Handle comma-separated string format
      return methods.split(',').map(m => m.trim()).filter(Boolean);
    } catch (error) {
      console.error('Error parsing payment methods:', error);
      return [];
    }
  };

  const formatPaymentMethod = (method: string) => {
    const methodNames: { [key: string]: string } = {
      paypal: "PayPal",
      credit_card: "Credit Card", 
      cash: "Cash",
      bank_transfer: "Bank Transfer",
      venmo: "Venmo",
      cashapp: "Cash App",
      zelle: "Zelle",
      check: "Check"
    };
    return methodNames[method] || method;
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 -mx-4 -mt-4 md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8 mb-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Technician Map</h1>
              <p className="text-sm text-gray-600">
                Search locations worldwide and find nearby technicians
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Filter technicians by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-80"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="w-full" style={{ height: 'calc(100vh - 14rem)' }}>
        <div className="h-full max-w-7xl mx-auto">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading technicians...</p>
              </div>
            </div>
          ) : (
            <MapComponent
              technicians={technicians || []}
              onMarkerClick={setSelectedTechnician}
              searchTerm={searchTerm}
            />
          )}
        </div>
      </div>

      {/* Technician Details Modal */}
      <Dialog open={!!selectedTechnician} onOpenChange={() => setSelectedTechnician(null)}>
        <DialogContent className="max-w-md z-[9999]" aria-describedby="technician-details-description">
          <DialogHeader>
            <DialogTitle>Technician Details</DialogTitle>
          </DialogHeader>
          <p id="technician-details-description" className="sr-only">
            View detailed information about the selected technician including contact details, specialization, and payment methods.
          </p>
          {selectedTechnician && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {selectedTechnician.firstName} {selectedTechnician.lastName}
                </h3>
                <p className="text-gray-600">{selectedTechnician.specialization}</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-sm">
                  <Phone className="h-4 w-4 mr-3 text-gray-400" />
                  <span className="font-medium">Phone:</span>
                  <a href={`tel:${selectedTechnician.phone}`} className="ml-2 text-blue-600 hover:underline">
                    {selectedTechnician.phone}
                  </a>
                </div>

                {selectedTechnician.email && (
                  <div className="flex items-center text-sm">
                    <Mail className="h-4 w-4 mr-3 text-gray-400" />
                    <span className="font-medium">Email:</span>
                    <a href={`mailto:${selectedTechnician.email}`} className="ml-2 text-blue-600 hover:underline">
                      {selectedTechnician.email}
                    </a>
                  </div>
                )}

                {selectedTechnician.location && (
                  <div className="flex items-start text-sm">
                    <MapPin className="h-4 w-4 mr-3 text-gray-400 mt-0.5" />
                    <div>
                      <span className="font-medium">Location:</span>
                      <p className="text-gray-700 mt-1">{selectedTechnician.location}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Specialization */}
              {selectedTechnician.specialization && (
                <div className="text-sm">
                  <span className="font-medium">Specialization:</span>
                  <span className="ml-2 text-gray-700">{selectedTechnician.specialization}</span>
                </div>
              )}

              {/* Experience and Rating */}
              <div className="flex items-center space-x-4 text-sm">
                <div>
                  <span className="font-medium">Experience:</span>
                  <span className="ml-2 text-gray-700">{selectedTechnician.experience} years</span>
                </div>
                {selectedTechnician.averageRating && (
                  <div className="flex items-center">
                    <Star className="h-4 w-4 text-yellow-400 mr-1" />
                    <span>{parseFloat(selectedTechnician.averageRating.toString()).toFixed(1)}</span>
                    <span className="text-gray-500 ml-1">
                      ({selectedTechnician.totalRatings} reviews)
                    </span>
                  </div>
                )}
              </div>

              {/* Payment Methods */}
              {selectedTechnician.paymentMethods && (
                <div>
                  <div className="flex items-center text-sm font-medium text-gray-700 mb-2">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Payment Methods
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {parsePaymentMethods(selectedTechnician.paymentMethods).map((method: string, index: number) => (
                      <Badge key={index} variant="outline">
                        {formatPaymentMethod(method)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <AdvancedPermissionGuard permission="technicians.rate">
                  <Button
                    onClick={() => setShowRatingModal(true)}
                    className="flex-1"
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Rate Technician
                  </Button>
                </AdvancedPermissionGuard>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rating Modal */}
      {selectedTechnician && (
        <RateTechnicianModal
          isOpen={showRatingModal}
          onClose={() => setShowRatingModal(false)}
          technician={selectedTechnician}
        />
      )}
    </div>
  );
}