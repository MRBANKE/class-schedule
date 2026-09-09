import { useEffect, useState } from 'react';
import { fetchWeather, DEFAULT_STATION, DEFAULT_CITY } from '../utils/weather';
import type { WeatherInfo } from '../utils/weather';

export function useWeather(stationId?: string, fallbackCity?: string) {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const station = stationId || DEFAULT_STATION;
    const city = fallbackCity || DEFAULT_CITY;
    const load = () => {
      setLoading(true);
      fetchWeather(station, city).then(data => {
        if (!cancelled) {
          setWeather(data);
          setLoading(false);
        }
      });
    };
    load();
    const timer = setInterval(load, 30 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [stationId, fallbackCity]);

  return { weather, loading };
}
