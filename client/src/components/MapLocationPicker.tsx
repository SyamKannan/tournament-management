import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import {
  MapPin, Search,
  Check, Compass, LocateFixed, ExternalLink
} from 'lucide-react';

// Vite bundles Leaflet's default marker images under hashed URLs, which breaks
// the library's built-in lookup — point it at the imported assets instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

export interface VenueLocation {
  venueName: string;
  address: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
}

interface MapLocationPickerProps {
  initialLocation?: Partial<VenueLocation>;
  onSelectLocation: (loc: VenueLocation) => void;
  onClose?: () => void;
}

// Popular Kerala & South India Sports Stadiums & Grounds for 1-click fast selection
const POPULAR_SPORTS_VENUES: VenueLocation[] = [
  {
    venueName: 'EMS Corporation Stadium',
    address: 'Pavamani Road, Tazhekkod, Kozhikode, Kerala 673004',
    district: 'Kozhikode',
    state: 'Kerala',
    latitude: 11.2588,
    longitude: 75.7804,
    googleMapsUrl: 'https://maps.google.com/?q=11.2588,75.7804'
  },
  {
    venueName: 'Malappuram District Sports Complex (Payyanad Stadium)',
    address: 'Payyanad, Manjeri, Malappuram, Kerala 676122',
    district: 'Malappuram',
    state: 'Kerala',
    latitude: 11.1271,
    longitude: 76.1311,
    googleMapsUrl: 'https://maps.google.com/?q=11.1271,76.1311'
  },
  {
    venueName: 'Kottappadi Football Stadium',
    address: 'Kottappadi, Down Hill, Malappuram, Kerala 676519',
    district: 'Malappuram',
    state: 'Kerala',
    latitude: 11.0722,
    longitude: 76.0714,
    googleMapsUrl: 'https://maps.google.com/?q=11.0722,76.0714'
  },
  {
    venueName: 'Jawaharlal Nehru International Stadium (Kaloor)',
    address: 'Banerji Road, Kaloor, Kochi, Kerala 682017',
    district: 'Ernakulam',
    state: 'Kerala',
    latitude: 9.9984,
    longitude: 76.3000,
    googleMapsUrl: 'https://maps.google.com/?q=9.9984,76.3000'
  },
  {
    venueName: 'Greenfield International Stadium',
    address: 'Kariavattom, Thiruvananthapuram, Kerala 695581',
    district: 'Thiruvananthapuram',
    state: 'Kerala',
    latitude: 8.5670,
    longitude: 76.8837,
    googleMapsUrl: 'https://maps.google.com/?q=8.5670,76.8837'
  },
  {
    venueName: 'Calicut Beach Football Arena',
    address: 'Beach Road, Vellayil, Kozhikode, Kerala 673032',
    district: 'Kozhikode',
    state: 'Kerala',
    latitude: 11.2650,
    longitude: 75.7690,
    googleMapsUrl: 'https://maps.google.com/?q=11.2650,75.7690'
  },
  {
    venueName: 'Thrissur Corporation Stadium',
    address: 'Palace Road, Chembukkav, Thrissur, Kerala 680020',
    district: 'Thrissur',
    state: 'Kerala',
    latitude: 10.5276,
    longitude: 76.2144,
    googleMapsUrl: 'https://maps.google.com/?q=10.5276,76.2144'
  },
  {
    venueName: 'M. Chinnaswamy Stadium',
    address: 'MG Road, Bengaluru, Karnataka 560001',
    district: 'Bengaluru',
    state: 'Karnataka',
    latitude: 12.9788,
    longitude: 77.5996,
    googleMapsUrl: 'https://maps.google.com/?q=12.9788,77.5996'
  }
];

// Standard OSM-family tiles only render village/hamlet/local-ground labels from
// about this zoom level up — anything wider and small places are blank space.
const LOCAL_DETAIL_ZOOM = 16;

// Soft bias (not a hard filter — bounded=0) so Nominatim prefers Kerala results
// without breaking searches for venues elsewhere in India, like the Bengaluru preset above.
const KERALA_VIEWBOX = '74.8,12.8,77.6,8.1'; // west,north,east,south

/** Recenters the live map whenever the picked coordinates change from outside a drag/click (search, preset, GPS). */
const RecenterOnChange: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), LOCAL_DETAIL_ZOOM), { duration: 0.7 });
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

/** Lets the organizer click anywhere on the tile layer to drop the pin there. */
const ClickToPlacePin: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

export const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  initialLocation,
  onSelectLocation,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [venueName, setVenueName] = useState(initialLocation?.venueName || 'Malappuram Sports Complex');
  const [address, setAddress] = useState(initialLocation?.address || 'Payyanad, Manjeri, Malappuram');
  const [district, setDistrict] = useState(initialLocation?.district || 'Malappuram');
  const [state, setState] = useState(initialLocation?.state || 'Kerala');
  const [lat, setLat] = useState<number>(initialLocation?.latitude || 11.1271);
  const [lng, setLng] = useState<number>(initialLocation?.longitude || 76.1311);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const reverseGeocodeSeq = useRef(0);

  const googleMapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

  const handleSelectPreset = (preset: VenueLocation) => {
    setVenueName(preset.venueName);
    setAddress(preset.address);
    setDistrict(preset.district);
    setState(preset.state);
    setLat(preset.latitude);
    setLng(preset.longitude);
    setSearchResults([]);
    setSearchQuery('');
  };

  // OpenStreetMap Nominatim Free Geocoding Search
  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setIsSearching(true);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}` +
          `&limit=8&addressdetails=1&countrycodes=in&viewbox=${KERALA_VIEWBOX}&bounded=0`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      setSearchResults(data || []);
      if (data.length > 0) {
        const first = data[0];
        setLat(parseFloat(first.lat));
        setLng(parseFloat(first.lon));
        setVenueName(first.name || searchQuery);
        setAddress(first.display_name);
      }
    } catch (err) {
      console.error('Failed to search location', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Reverse-geocode a dropped/dragged pin so the address field stays accurate
  // without the organizer having to type it. Stale responses (an earlier pin
  // that resolves after a later one) are dropped via the sequence guard.
  const reverseGeocode = async (nextLat: number, nextLng: number) => {
    const seq = ++reverseGeocodeSeq.current;
    try {
      setIsResolvingAddress(true);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${nextLat}&lon=${nextLng}&zoom=17`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (seq !== reverseGeocodeSeq.current) return; // a newer pin drop superseded this lookup

      if (data?.display_name) {
        setAddress(data.display_name);
      }
      const addr = data?.address || {};
      const resolvedDistrict = addr.state_district || addr.county || addr.city_district || addr.city;
      if (resolvedDistrict) setDistrict(resolvedDistrict);
      if (addr.state) setState(addr.state);
    } catch (err) {
      console.error('Failed to reverse-geocode pin location', err);
    } finally {
      if (seq === reverseGeocodeSeq.current) setIsResolvingAddress(false);
    }
  };

  const handlePinMoved = (nextLat: number, nextLng: number) => {
    setLat(nextLat);
    setLng(nextLng);
    reverseGeocode(nextLat, nextLng);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        handlePinMoved(pos.coords.latitude, pos.coords.longitude);
        setVenueName('Current GPS Location Stadium');
      },
      (err) => {
        setIsLocating(false);
        console.error(err);
      }
    );
  };

  const handleConfirm = () => {
    onSelectLocation({
      venueName,
      address,
      district,
      state,
      latitude: lat,
      longitude: lng,
      googleMapsUrl: `https://maps.google.com/?q=${lat},${lng}`
    });
    if (onClose) onClose();
  };

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <form onSubmit={handleSearchLocation} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input aria-label="Search city, ground, stadium (e.g. Kozhikode, Manjeri, Kaloor)"
            type="text"
            placeholder="Search city, ground, stadium (e.g. Kozhikode, Manjeri, Kaloor)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching}
          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all shrink-0 disabled:opacity-60"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={isLocating}
          title="Use My Current GPS Location"
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-all shrink-0 disabled:opacity-60"
        >
          <LocateFixed className={`w-4 h-4 text-cyan-400 ${isLocating ? 'animate-pulse' : ''}`} />
        </button>
      </form>

      {/* Search Autocomplete Results */}
      {searchResults.length > 0 && (
        <div className="p-2 rounded-2xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
          <div className="px-2 py-1 text-xs font-bold text-slate-400 uppercase">Search Results:</div>
          {searchResults.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setLat(parseFloat(r.lat));
                setLng(parseFloat(r.lon));
                setVenueName(r.name || searchQuery);
                setAddress(r.display_name);
                setSearchResults([]);
              }}
              className="w-full text-left p-2 rounded-xl hover:bg-slate-900 text-slate-300 hover:text-white flex items-start gap-2 transition-colors"
            >
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="truncate">
                <div className="font-bold text-white">{r.name || 'Location Match'}</div>
                <div className="text-xs text-slate-400 truncate">{r.display_name}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Interactive Click-to-Pin Leaflet Map */}
      <div className="space-y-1.5">
        <div className="relative w-full h-80 sm:h-[26rem] rounded-2xl overflow-hidden border border-slate-800 shadow-inner bg-slate-950 z-0">
          <MapContainer
            center={[lat, lng]}
            zoom={LOCAL_DETAIL_ZOOM}
            scrollWheelZoom
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            <Marker
              position={[lat, lng]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const pos = (e.target as L.Marker).getLatLng();
                  handlePinMoved(pos.lat, pos.lng);
                }
              }}
            />
            <ClickToPlacePin onPick={handlePinMoved} />
            <RecenterOnChange lat={lat} lng={lng} />
          </MapContainer>

          {/* Overlay Pin Badge */}
          <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 shadow-lg pointer-events-none z-[1000]">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white truncate max-w-[200px]">{venueName}</span>
          </div>

          {/* Live Coordinates Pill */}
          <div className="absolute bottom-3 right-3 bg-slate-950/90 backdrop-blur-md border border-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-cyan-400 font-bold flex items-center gap-1.5 pointer-events-none z-[1000]">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span>Click anywhere on the map, or drag the pin, to set the exact venue location.</span>
          {isResolvingAddress && <span className="text-cyan-400">Resolving address…</span>}
        </p>
      </div>

      {/* Quick Venue Presets (Famous Kerala Sports Stadiums) */}
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Quick Select Famous Stadiums:</span>
          <span className="text-xs text-slate-500 font-normal">1-Click Auto-Fill</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-28 overflow-y-auto pr-1">
          {POPULAR_SPORTS_VENUES.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelectPreset(v)}
              className={`p-2 rounded-xl text-left border text-xs transition-all ${
                venueName === v.venueName
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                  : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <div className="truncate text-white font-semibold text-xs">{v.venueName}</div>
              <div className="text-xs text-slate-500 truncate">{v.district}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Editable Venue Details */}
      <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="maplocationpicker-venue-stadium-name" className="block text-slate-400 text-xs font-semibold mb-1">Venue / Stadium Name *</label>
            <input id="maplocationpicker-venue-stadium-name"
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="maplocationpicker-district" className="block text-slate-400 text-xs font-semibold mb-1">District</label>
            <input id="maplocationpicker-district"
              type="text"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="maplocationpicker-full-ground-address-directions" className="block text-slate-400 text-xs font-semibold mb-1">Full Ground Address & Directions</label>
          <input id="maplocationpicker-full-ground-address-directions"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Preview in Google Maps Directions ↗</span>
          </a>

          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply Selected Venue</span>
          </button>
        </div>
      </div>
    </div>
  );
};
