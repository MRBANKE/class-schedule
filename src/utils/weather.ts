import type { IconName } from '../icons';

export interface DailyForecast {
  date: string;
  weekdayLabel: string;
  dayInfo: string;
  nightInfo: string;
  icon: IconName;
  high: number | null;
  low: number | null;
}

export interface WeatherInfo {
  city: string;
  description: string;
  icon: IconName;
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windText: string;
  publishTime: string;
  chanceOfRainHint: boolean;
  forecast: DailyForecast[];
  updatedAt: string;
  /**
   * true 表示这是取数失败后的占位数据,不是真实天气。
   * /api/nmc 由自家后端反代(server/upstream.mjs),但家庭网络断网、
   * 中国天气网抖动时仍会取不到数;若不透出,家长会照着"多云 18℃"给孩子穿衣。
   */
  stale?: boolean;
}

interface NmcReal {
  station: { code: string; city: string; province: string };
  publish_time: string;
  weather: {
    temperature: number;
    humidity: number;
    info: string;
    img: string;
    feelst: number;
    rain: number;
  };
  wind: { direct: string; power: string; speed: number };
}

interface NmcDayNight {
  weather: { info: string; temperature: string; img: string };
  wind?: { direct: string; power: string };
}

interface NmcPredictDetail {
  date: string;
  pt?: string;
  day: NmcDayNight;
  night: NmcDayNight;
}

interface NmcResponse {
  msg: string;
  code: number;
  data?: {
    real: NmcReal;
    predict?: { detail: NmcPredictDetail[] };
  };
}

const NMC_ICON_MAP: Record<string, IconName> = {
  '0': 'sun',
  '1': 'partlycloudy',
  '2': 'cloud',
  '3': 'drizzle',
  '4': 'thunder',
  '5': 'thunder',
  '6': 'snow',
  '7': 'drizzle',
  '8': 'rain',
  '9': 'rain',
  '10': 'rain',
  '11': 'rain',
  '12': 'rain',
  '13': 'snow',
  '14': 'snow',
  '15': 'snow',
  '16': 'snow',
  '17': 'snow',
  '18': 'fog',
  '19': 'drizzle',
  '20': 'fog',
  '29': 'fog',
  '30': 'fog',
  '31': 'fog',
  '53': 'fog',
};

const iconFromImg = (raw: string | number | undefined): IconName | null => {
  if (isMissing(raw)) return null;
  const key = String(raw).replace(/\D/g, '');
  if (!key) return null;
  return NMC_ICON_MAP[key] ?? NMC_ICON_MAP[String(Number.parseInt(key, 10))] ?? null;
};

const iconFromInfo = (info: string): IconName | null => {
  if (!info) return null;
  if (info.includes('雷')) return 'thunder';
  if (info.includes('雪')) return 'snow';
  if (info.includes('雾') || info.includes('霾') || info.includes('沙')) return 'fog';
  if (info.includes('阵雨') || info.includes('小雨') || info.includes('毛毛雨')) return 'drizzle';
  if (info.includes('雨')) return 'rain';
  if (info.includes('晴') && info.includes('云')) return 'partlycloudy';
  if (info.includes('多云')) return 'partlycloudy';
  if (info.includes('阴')) return 'cloud';
  if (info.includes('晴')) return 'sun';
  return null;
};

const pickIcon = (
  img: string | number | undefined,
  info: string | undefined,
  fallback: IconName = 'rainbow',
): IconName => iconFromImg(img) ?? iconFromInfo(cleanText(info)) ?? fallback;

const parseTemp = (t: string | number | undefined | null): number | null => {
  if (isMissing(t)) return null;
  const n = Number.parseFloat(String(t));
  if (!Number.isFinite(n)) return null;
  if (n >= 9999 || n <= -9999) return null;
  return n;
};

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

const weekdayLabel = (date: string, index: number): string => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return index === 0 ? '今天' : `第${index + 1}天`;
  if (index === 0) return '今天';
  if (index === 1) return '明天';
  if (index === 2) return '后天';
  return WEEKDAY_LABELS[d.getDay()];
};

const nowClock = () =>
  new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

const buildMock = (city: string): WeatherInfo => ({
  city,
  description: '暂无数据',
  icon: 'partlycloudy',
  tempC: 18,
  feelsLikeC: 17,
  humidity: 55,
  windText: '微风',
  publishTime: '',
  chanceOfRainHint: false,
  forecast: [],
  updatedAt: nowClock(),
  stale: true,
});

export const DEFAULT_STATION = 'RfjCI';
export const DEFAULT_CITY = '西安';

/**
 * 中央气象台接口的基地址。
 *
 * nmc 三个接口(rest/weather、rest/province/all、rest/province/:code)都返回
 * `access-control-allow-origin: *`,浏览器可以直连,不需要服务端代理。
 * 这样天气在纯静态托管(CDN / Pages / Docker 里的 nginx)下同样可用 ——
 * 此前写成相对路径 `/api/nmc`,只有 vite dev server 的 proxy 能命中,
 * 生产环境必然 404 并降级成占位数据。
 *
 * 如果将来 nmc 收紧 CORS 或需要走内网出口,把 VITE_NMC_BASE 配成自己的反代
 * 前缀(例如 `/api/nmc`)即可,无需改代码。
 */
const NMC_BASE: string =
  import.meta.env.VITE_NMC_BASE?.replace(/\/+$/, '') || 'https://www.nmc.cn';

const isMissing = (v: unknown): boolean => {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  return s === '' || s === '-' || s === '9999';
};

const cleanText = (v: string | undefined): string => (isMissing(v) ? '' : String(v).trim());

export async function fetchWeather(
  stationId: string = DEFAULT_STATION,
  fallbackCity: string = DEFAULT_CITY,
): Promise<WeatherInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${NMC_BASE}/rest/weather?stationid=${stationId}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`nmc ${res.status}`);
    const data = (await res.json()) as NmcResponse;
    if (data.code !== 0 || !data.data) throw new Error('nmc invalid response');
    const real = data.data.real;
    const details = data.data.predict?.detail ?? [];

    const forecast: DailyForecast[] = details.slice(0, 5).map((d, idx) => {
      const dayInfo = cleanText(d.day.weather.info);
      const nightInfo = cleanText(d.night.weather.info);
      const primaryInfo = dayInfo || nightInfo;
      const icon = pickIcon(
        !isMissing(d.day.weather.img) ? d.day.weather.img : d.night.weather.img,
        primaryInfo,
      );
      const dayTemp = parseTemp(d.day.weather.temperature);
      const nightTemp = parseTemp(d.night.weather.temperature);
      return {
        date: d.date,
        weekdayLabel: weekdayLabel(d.date, idx),
        dayInfo,
        nightInfo,
        icon,
        high: dayTemp,
        low: nightTemp,
      };
    });

    const firstDay = details[0];
    const dayNow = new Date().getHours() >= 18 || new Date().getHours() < 6
      ? firstDay?.night
      : firstDay?.day;

    const currentInfo =
      cleanText(real.weather.info) ||
      cleanText(dayNow?.weather.info) ||
      cleanText(firstDay?.day.weather.info) ||
      cleanText(firstDay?.night.weather.info) ||
      '未知';

    const currentIcon = pickIcon(
      !isMissing(real.weather.img) ? real.weather.img : dayNow?.weather.img,
      currentInfo,
    );

    const realTemp = parseTemp(real.weather.temperature);
    const realFeels = parseTemp(real.weather.feelst);
    const humidity = isMissing(real.weather.humidity)
      ? NaN
      : Number(real.weather.humidity);
    const humidityValid = Number.isFinite(humidity) && humidity < 9999;

    const windPower = cleanText(real.wind.power);
    const windText = windPower;

    const chanceOfRainHint = forecast
      .slice(0, 2)
      .some(f => /雨|雷/.test(`${f.dayInfo}${f.nightInfo}`));

    const tempFallback =
      forecast.find(f => f.high != null || f.low != null) ??
      null;
    const tempC =
      realTemp ??
      tempFallback?.high ??
      tempFallback?.low ??
      0;
    const feelsLikeC = realFeels ?? tempC;

    return {
      city: real.station.city || fallbackCity,
      description: currentInfo,
      icon: currentIcon,
      tempC: Math.round(tempC),
      feelsLikeC: Math.round(feelsLikeC),
      humidity: humidityValid ? Math.round(humidity) : 0,
      windText: windText || '风力平稳',
      publishTime: cleanText(real.publish_time),
      chanceOfRainHint,
      forecast,
      updatedAt: nowClock(),
    };
  } catch {
    return { ...buildMock(fallbackCity), updatedAt: nowClock() };
  } finally {
    clearTimeout(timer);
  }
}

export interface NmcProvince {
  code: string;
  name: string;
  url?: string;
}

export interface NmcCity {
  code: string;
  name: string;
  province?: string;
}

const provinceCache = new Map<string, NmcCity[]>();
let provincesCache: NmcProvince[] | null = null;

export async function fetchProvinces(): Promise<NmcProvince[]> {
  if (provincesCache) return provincesCache;
  try {
    const res = await fetch(`${NMC_BASE}/rest/province/all`);
    if (!res.ok) throw new Error(`nmc ${res.status}`);
    const list = (await res.json()) as Array<{
      code: string;
      name: string;
      url?: string;
    }>;
    const out = list.map(p => ({ code: p.code, name: p.name, url: p.url }));
    provincesCache = out;
    return out;
  } catch {
    return [];
  }
}

export async function fetchCities(provinceCode: string): Promise<NmcCity[]> {
  const cached = provinceCache.get(provinceCode);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${NMC_BASE}/rest/province/${encodeURIComponent(provinceCode)}`,
    );
    if (!res.ok) throw new Error(`nmc ${res.status}`);
    const list = (await res.json()) as Array<{
      code: string;
      city?: string;
      station?: string;
      province?: string;
    }>;
    const out = list.map(c => ({
      code: c.code,
      name: c.city || c.station || c.code,
      province: c.province,
    }));
    provinceCache.set(provinceCode, out);
    return out;
  } catch {
    return [];
  }
}

export interface ComfortInfo {
  icon: IconName;
  text: string;
}

export function computeComfort(weather: WeatherInfo): ComfortInfo {
  const t = Number.isFinite(weather.feelsLikeC)
    ? weather.feelsLikeC
    : weather.tempC;
  const h = Number.isFinite(weather.humidity) ? weather.humidity : 50;

  if (t <= 5) return { icon: 'gauge', text: '舒适度：寒冷' };
  if (t < 12) return { icon: 'gauge', text: '舒适度：较冷' };
  if (t < 18) return { icon: 'gauge', text: '舒适度：微凉宜人' };
  if (t < 24) {
    if (h >= 80) return { icon: 'gauge', text: '舒适度：温暖略闷' };
    return { icon: 'gauge', text: '舒适度：温暖，较舒适' };
  }
  if (t < 30) {
    if (h >= 70) return { icon: 'gauge', text: '舒适度：湿热较闷' };
    return { icon: 'gauge', text: '舒适度：偏热' };
  }
  if (h >= 70) return { icon: 'gauge', text: '舒适度：炎热闷湿' };
  return { icon: 'gauge', text: '舒适度：炎热' };
}

