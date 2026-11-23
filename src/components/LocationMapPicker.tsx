/// <reference types="google.maps" />
import React, { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Check, Loader2, MapPin, Search, X } from 'lucide-react';

interface LocationMapPickerProps {
  value: string;
  onSelectLocation: (locationLabel: string, coords?: { lat: number; lng: number }) => void;
  onClose?: () => void;
}

const BANDUNG_CENTER = { lat: -6.9175, lng: 107.6191 };

function compactLocationLabel(primary: string, address?: string): string {
  const cleanPrimary = primary.trim();
  const cleanAddress = (address || '').trim();
  if (cleanPrimary && cleanAddress) {
    // Keep concise & within 80-char Firestore user profile venueArea limit
    const shortAddr = cleanAddress
      .replace(/,?\s*Indonesia$/i, '')
      .replace(/,?\s*Jawa Barat\s*\d*/i, '')
      .trim();
    const combined = shortAddr.toLowerCase().includes(cleanPrimary.toLowerCase())
      ? shortAddr
      : `${cleanPrimary}, ${shortAddr}`;
    return combined.slice(0, 80);
  }
  return (cleanPrimary || cleanAddress || 'Bandung').slice(0, 80);
}

const InnerMapPicker: React.FC<LocationMapPickerProps> = ({
  value,
  onSelectLocation,
  onClose,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  const [pinPos, setPinPos] = useState<{ lat: number; lng: number }>(BANDUNG_CENTER);
  const [pickedLabel, setPickedLabel] = useState<string>(value);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingPin, setIsResolvingPin] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Modern Places API (New) Autocomplete with session token
  useEffect(() => {
    if (!placesLib) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        }
        const { suggestions: res } =
          await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: trimmed,
            sessionToken: sessionTokenRef.current,
            includedRegionCodes: ['id'],
            locationBias: {
              center: BANDUNG_CENTER,
              radius: 25000,
            },
            language: 'id',
            region: 'ID',
          });
        setSuggestions(res.slice(0, 5));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Quota') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => window.clearTimeout(timer);
  }, [placesLib, searchQuery]);

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;
    setIsResolvingPin(true);
    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      sessionTokenRef.current = null;
      setSuggestions([]);

      const label = compactLocationLabel(
        place.displayName || prediction.mainText?.text || '',
        place.formattedAddress || prediction.secondaryText?.text || ''
      );
      setPickedLabel(label);
      setSearchQuery(label);

      if (place.location) {
        const coords = { lat: place.location.lat(), lng: place.location.lng() };
        setPinPos(coords);
        map?.panTo(coords);
        map?.setZoom(15);
        onSelectLocation(label, coords);
      } else {
        onSelectLocation(label);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Quota') || msg.includes('OVER_QUERY_LIMIT')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } finally {
      setIsResolvingPin(false);
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    const coords = { lat, lng };
    setPinPos(coords);
    map?.panTo(coords);

    const fallbackCoordLabel = `Bandung (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    setPickedLabel(fallbackCoordLabel);
    onSelectLocation(fallbackCoordLabel, coords);

    if (!placesLib) return;
    setIsResolvingPin(true);
    try {
      const { Place } = placesLib;
      const nearby = await Place.searchNearby({
        fields: ['displayName', 'formattedAddress'],
        locationRestriction: {
          center: coords,
          radius: 300,
        },
        maxResultCount: 1,
        language: 'id',
        region: 'ID',
      });
      const first = nearby.places?.[0];
      if (first) {
        const resolved = compactLocationLabel(
          first.displayName || '',
          first.formattedAddress || ''
        );
        if (resolved) {
          setPickedLabel(resolved);
          onSelectLocation(resolved, coords);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Quota') || msg.includes('OVER_QUERY_LIMIT')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } finally {
      setIsResolvingPin(false);
    }
  };

  return (
    <div className="mt-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
      {/* Places Search Bar inside Maps Picker */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari alamat, jalan, atau nama GOR di Google Maps..."
          className="w-full pl-8 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {isSearching && (
          <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
        )}
        {!isSearching && searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSuggestions([]);
            }}
            aria-label="Hapus pencarian peta"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-30 overflow-hidden divide-y divide-slate-100">
            {suggestions.map((sug, idx) => {
              const pred = sug.placePrediction;
              if (!pred) return null;
              return (
                <button
                  key={pred.placeId || idx}
                  type="button"
                  onClick={() => void handleSelectSuggestion(sug)}
                  className="w-full px-3 py-2 text-left hover:bg-emerald-50 transition-colors flex items-start gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {pred.mainText?.text || pred.text?.text}
                    </p>
                    {pred.secondaryText?.text && (
                      <p className="text-[11px] text-slate-500 truncate">
                        {pred.secondaryText.text}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive Google Map Canvas (explicit height prevents collapse) */}
      <div className="w-full h-[220px] rounded-lg overflow-hidden border border-slate-200 bg-slate-100 relative">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={BANDUNG_CENTER}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI={false}
          streetViewControl={false}
          mapTypeControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          onClick={(ev) => {
            const latLng = ev.detail?.latLng;
            if (latLng) {
              void handleMapClick(latLng.lat, latLng.lng);
            }
          }}
        >
          <AdvancedMarker position={pinPos} title={pickedLabel || 'Lokasi GOR'}>
            <Pin
              background="#10B981"
              borderColor="#047857"
              glyphColor="#FFFFFF"
              scale={1.1}
            />
          </AdvancedMarker>
        </GoogleMap>
      </div>

      {/* Footer status & confirm */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-slate-600 min-w-0 flex-1">
          {isResolvingPin ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
              <span>Mengambil nama lokasi dari Google Maps...</span>
            </>
          ) : (
            <>
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate font-medium text-slate-800">
                {pickedLabel || 'Klik titik lokasi pada peta atau cari alamat di atas'}
              </span>
            </>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0F172A] hover:bg-slate-800 text-white font-semibold shrink-0 transition-colors"
          >
            <Check className="w-3 h-3 text-emerald-400" />
            <span>Gunakan Lokasi</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const LocationMapPicker: React.FC<LocationMapPickerProps> = (props) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  if (!apiKey) {
    return (
      <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
        Google Maps API key belum aktif di environment ini. Anda tetap dapat mengetik lokasi GOR secara manual di kolom atas.
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
      <InnerMapPicker {...props} />
    </APIProvider>
  );
};
