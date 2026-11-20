/// <reference types="google.maps" />
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Box,
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Star,
  X,
} from 'lucide-react';
import { SportCategory, Venue } from '../types/courtsync';

interface BandungVenueMapProps {
  selectedSport: 'Semua' | SportCategory;
  venues: Venue[];
  onSelectCourtSyncVenue: (venueId: string) => void;
  onOpen3DForSport: (sport: SportCategory) => void;
}

interface LivePlaceResult {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating?: number | null;
  userRatingCount?: number | null;
  googleMapsURI?: string | null;
  sportHint: SportCategory;
}

const BANDUNG_CENTER = { lat: -6.9175, lng: 107.6191 };

const SPORT_QUERY_MAP: Record<'Semua' | SportCategory, string> = {
  Semua: 'GOR lapangan badminton futsal padel mini soccer Bandung',
  Badminton: 'GOR Badminton Bandung',
  Futsal: 'Lapangan Futsal Bandung',
  'Mini Soccer': 'Lapangan Mini Soccer Bandung',
  Padel: 'Padel Court Bandung',
};

function inferSportFromName(name: string, fallback: 'Semua' | SportCategory): SportCategory {
  if (fallback !== 'Semua') return fallback;
  const lower = name.toLowerCase();
  if (lower.includes('padel')) return 'Padel';
  if (lower.includes('mini soccer') || lower.includes('minisoccer') || lower.includes('soccer')) {
    return 'Mini Soccer';
  }
  if (lower.includes('futsal')) return 'Futsal';
  return 'Badminton';
}

const PlacesBandungController: React.FC<{
  selectedSport: 'Semua' | SportCategory;
  venues: Venue[];
  onSelectCourtSyncVenue: (venueId: string) => void;
  onOpen3DForSport: (sport: SportCategory) => void;
}> = ({ selectedSport, venues, onSelectCourtSyncVenue, onOpen3DForSport }) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  const [places, setPlaces] = useState<LivePlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<LivePlaceResult | null>(null);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Live Places API (New) Autocomplete state with session token
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const runLiveBandungSearch = useCallback(
    async (queryText: string, sportScope: 'Semua' | SportCategory) => {
      if (!placesLib) return;
      setIsLoadingPlaces(true);
      setSearchError(null);
      try {
        const { Place } = placesLib;
        const response = await Place.searchByText({
          textQuery: queryText,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'googleMapsURI',
          ],
          locationBias: {
            center: BANDUNG_CENTER,
            radius: 12000,
          },
          maxResultCount: 10,
          language: 'id',
          region: 'ID',
        });

        const mapped: LivePlaceResult[] = (response.places ?? [])
          .filter((p) => Boolean(p.location))
          .map((p) => {
            const loc = p.location!;
            const name = p.displayName || 'Venue Olahraga Bandung';
            return {
              id: p.id || `${loc.lat()}-${loc.lng()}`,
              name,
              address: p.formattedAddress || 'Bandung, Jawa Barat',
              location: { lat: loc.lat(), lng: loc.lng() },
              rating: p.rating ?? null,
              userRatingCount: p.userRatingCount ?? null,
              googleMapsURI: p.googleMapsURI ?? null,
              sportHint: inferSportFromName(name, sportScope),
            };
          });

        setPlaces(mapped);
        setSelectedPlace(mapped[0] ?? null);

        if (map && mapped.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          mapped.forEach((m) => bounds.extend(m.location));
          map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Quota') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSearchError(
          'Gagal memuat lokasi live dari Google Places API. Coba ganti kata kunci atau ulangi pencarian.'
        );
      } finally {
        setIsLoadingPlaces(false);
      }
    },
    [placesLib, map]
  );

  // Trigger live Bandung sports venue search when sport filter changes
  useEffect(() => {
    if (!placesLib) return;
    void runLiveBandungSearch(SPORT_QUERY_MAP[selectedSport], selectedSport);
  }, [placesLib, selectedSport, runLiveBandungSearch]);

  // Modern AutocompleteSuggestion with AutocompleteSessionToken
  useEffect(() => {
    if (!placesLib) return;
    const trimmed = searchText.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setIsSearchingSuggestions(true);
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: `${trimmed} Bandung`,
          sessionToken: sessionTokenRef.current,
          locationBias: {
            center: BANDUNG_CENTER,
            radius: 15000,
          },
          includedRegionCodes: ['id'],
          language: 'id',
        });
        if (!cancelled) {
          setSuggestions(res.suggestions ?? []);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setIsSearchingSuggestions(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, searchText]);

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!placesLib || !suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'rating',
          'userRatingCount',
          'googleMapsURI',
        ],
      });

      // Reset session token after fetchFields per GMP billing best practice
      sessionTokenRef.current = null;
      setSuggestions([]);
      setSearchText(place.displayName || '');

      if (place.location) {
        const nextPlace: LivePlaceResult = {
          id: place.id || `place-${Date.now()}`,
          name: place.displayName || 'Lokasi Bandung',
          address: place.formattedAddress || 'Bandung, Jawa Barat',
          location: { lat: place.location.lat(), lng: place.location.lng() },
          rating: place.rating ?? null,
          userRatingCount: place.userRatingCount ?? null,
          googleMapsURI: place.googleMapsURI ?? null,
          sportHint: inferSportFromName(place.displayName || '', selectedSport),
        };
        setPlaces((prev) => {
          const filtered = prev.filter((p) => p.id !== nextPlace.id);
          return [nextPlace, ...filtered];
        });
        setSelectedPlace(nextPlace);
        map?.panTo(nextPlace.location);
        map?.setZoom(15);
      }
    } catch {
      setSearchError('Tidak dapat mengambil detail lokasi terpilih.');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    if (!q) return;
    setSuggestions([]);
    void runLiveBandungSearch(`${q} Bandung`, selectedSport);
  };

  const findMatchingPartnerVenue = (sport: SportCategory): Venue | undefined => {
    return venues.find((v) => v.sport === sport) ?? venues[0];
  };

  return (
    <div className="space-y-4">
      {/* Live Places Search Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Cari GOR, jalan, atau area di Bandung (Google Places Live)..."
            className="w-full pl-10 pr-24 py-2.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                setSuggestions([]);
              }}
              aria-label="Hapus pencarian peta"
              className="absolute right-16 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-semibold bg-[#0F172A] hover:bg-slate-800 text-white rounded-lg transition-colors"
          >
            Cari
          </button>

          {/* Autocomplete Dropdown */}
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-30 divide-y divide-slate-100 overflow-hidden">
              {suggestions.slice(0, 5).map((s, idx) => (
                <li key={s.placePrediction?.placeId ?? idx}>
                  <button
                    type="button"
                    onClick={() => void handleSelectSuggestion(s)}
                    className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-emerald-50 flex items-center gap-2 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate text-slate-800 font-medium">
                      {s.placePrediction?.text.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          {isLoadingPlaces || isSearchingSuggestions ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Memuat venue live Bandung...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Compass className="w-3.5 h-3.5 text-emerald-600" />
              {places.length} lokasi olahraga ditemukan di Bandung
            </span>
          )}
        </div>
      </div>

      {searchError && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          {searchError}
        </div>
      )}

      {/* Split Map + Live Venue List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Explicit-Height Google Map Canvas */}
        <div className="lg:col-span-8 h-[460px] sm:h-[520px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 relative">
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={BANDUNG_CENTER}
            defaultZoom={12}
            gestureHandling="greedy"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            {places.map((place) => {
              const isSelected = selectedPlace?.id === place.id;
              return (
                <AdvancedMarker
                  key={place.id}
                  position={place.location}
                  title={place.name}
                  zIndex={isSelected ? 20 : 1}
                  onClick={() => {
                    setSelectedPlace(place);
                    map?.panTo(place.location);
                  }}
                >
                  <Pin
                    background={isSelected ? '#10B981' : '#0F172A'}
                    borderColor={isSelected ? '#047857' : '#334155'}
                    glyphColor="#FFFFFF"
                    scale={isSelected ? 1.25 : 1.0}
                  />
                </AdvancedMarker>
              );
            })}

            {selectedPlace && (
              <InfoWindow
                position={selectedPlace.location}
                onCloseClick={() => setSelectedPlace(null)}
                maxWidth={280}
              >
                <div className="p-1 space-y-2 text-slate-900">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      {selectedPlace.sportHint} · Google Maps Live
                    </p>
                    <h4 className="font-display font-bold text-sm text-slate-900 leading-snug mt-0.5">
                      {selectedPlace.name}
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {selectedPlace.address}
                    </p>
                  </div>

                  {typeof selectedPlace.rating === 'number' && (
                    <div className="flex items-center gap-1 text-xs font-mono font-semibold text-slate-800">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{selectedPlace.rating.toFixed(1)}</span>
                      {typeof selectedPlace.userRatingCount === 'number' && (
                        <span className="text-slate-500 font-sans font-normal">
                          ({selectedPlace.userRatingCount} ulasan Google)
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {(() => {
                      const partner = findMatchingPartnerVenue(selectedPlace.sportHint);
                      return partner ? (
                        <button
                          type="button"
                          onClick={() => onSelectCourtSyncVenue(partner.id)}
                          className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold text-[11px] rounded-lg transition-colors"
                        >
                          Booking {partner.sport}
                        </button>
                      ) : null;
                    })()}
                    <button
                      type="button"
                      onClick={() => onOpen3DForSport(selectedPlace.sportHint)}
                      className="px-2.5 py-1.5 bg-[#0F172A] hover:bg-slate-800 text-white font-semibold text-[11px] rounded-lg inline-flex items-center gap-1 transition-colors"
                    >
                      <Box className="w-3 h-3 text-emerald-400" />
                      Tur 3D
                    </button>
                    {selectedPlace.googleMapsURI && (
                      <a
                        href={selectedPlace.googleMapsURI}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded-lg inline-flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Rute
                      </a>
                    )}
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>

        {/* Live Bandung Results Side Panel */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl flex flex-col max-h-[520px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900">
                Hasil Lokasi Bandung
              </h3>
              <p className="text-[11px] text-slate-500">
                Data lokasi real-time via Google Places API
              </p>
            </div>
            <Navigation className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>

          <div className="flex-1 overflow-y-auto thin-scrollbar divide-y divide-slate-100">
            {places.length === 0 && !isLoadingPlaces ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                <p>Belum ada lokasi yang ditampilkan.</p>
                <button
                  type="button"
                  onClick={() => void runLiveBandungSearch(SPORT_QUERY_MAP[selectedSport], selectedSport)}
                  className="px-3 py-1.5 bg-[#0F172A] text-white font-semibold rounded-lg"
                >
                  Muat Ulang Peta Bandung
                </button>
              </div>
            ) : (
              places.map((place) => {
                const isSelected = selectedPlace?.id === place.id;
                const partner = findMatchingPartnerVenue(place.sportHint);
                return (
                  <div
                    key={place.id}
                    onClick={() => {
                      setSelectedPlace(place);
                      map?.panTo(place.location);
                      map?.setZoom(15);
                    }}
                    className={`p-3.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display font-bold text-xs text-slate-900 leading-snug">
                        {place.name}
                      </p>
                      {typeof place.rating === 'number' && (
                        <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-bold text-slate-800 shrink-0">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {place.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {place.address}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {place.sportHint}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {partner && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCourtSyncVenue(partner.id);
                            }}
                            className="text-[11px] font-semibold text-slate-900 hover:text-emerald-700 underline underline-offset-2"
                          >
                            Cek Slot Mitra
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const BandungVenueMap: React.FC<BandungVenueMapProps> = (props) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  if (!apiKey) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
        <MapPin className="w-7 h-7 text-slate-400 mx-auto" />
        <p className="font-display font-bold text-sm text-slate-900">
          Kunci Google Maps API belum tersedia di environment preview.
        </p>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Pastikan <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> terkonfigurasi agar peta interaktif GOR Bandung dapat dimuat.
        </p>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      language="id"
      region="ID"
      libraries={['marker', 'places']}
    >
      <PlacesBandungController {...props} />
    </APIProvider>
  );
};
