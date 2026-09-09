import { forwardRef } from 'react';
import { SvgIcon } from '../icons';
import type { WeatherInfo } from '../utils/weather';

interface Props {
  weather: WeatherInfo | null;
  loading: boolean;
  cityHint?: string;
  dateStr?: string;
}

const SKELETON_UPCOMING = [0, 1, 2, 3];

const WeatherCard = forwardRef<HTMLElement, Props>(function WeatherCard(
  { weather, loading, cityHint, dateStr },
  ref,
) {
  const todayHigh = weather?.forecast[0]?.high;
  const todayLow = weather?.forecast[0]?.low;
  const rangeText =
    todayHigh != null && todayLow != null
      ? `${Math.round(todayLow)}℃~${Math.round(todayHigh)}℃`
      : todayHigh != null
        ? `${Math.round(todayHigh)}℃`
        : todayLow != null
          ? `${Math.round(todayLow)}℃`
          : '';
  const upcoming = weather ? weather.forecast.slice(1, 5) : [];
  const displayCity = weather?.city || cityHint || '天气';
  const isSkeleton = loading || !weather;

  return (
    <section className="weather-card" ref={ref}>
      <header className="weather-header">
        <h2 className="section-title">
          <span className="section-title-icon">
            <SvgIcon name="sun" size={20} />
          </span>
          {displayCity} · 今日天气
        </h2>
        {dateStr && (
          <span className="weather-date">
            <SvgIcon name="calendar" size={13} />
            <span>{dateStr}</span>
          </span>
        )}
      </header>

      {isSkeleton ? (
        <div className="weather-skeleton" aria-hidden>
          <div className="weather-main">
            <div className="weather-icon">
              <span className="sk sk-circle sk-icon-lg" />
            </div>
            <div className="weather-info">
              <span className="sk sk-line sk-temp" />
              <span className="sk sk-line sk-desc" />
              <div className="weather-meta">
                <span className="sk sk-line sk-meta" />
                <span className="sk sk-line sk-meta" />
                <span className="sk sk-line sk-meta" />
              </div>
            </div>
          </div>
          <div className="forecast-strip forecast-strip-4">
            {SKELETON_UPCOMING.map(i => (
              <div className="forecast-item" key={i}>
                <span className="sk sk-line sk-fc-day" />
                <span className="sk sk-circle sk-fc-icon" />
                <span className="sk sk-line sk-fc-desc" />
                <span className="sk sk-line sk-fc-temp" />
              </div>
            ))}
          </div>
          <div className="weather-updated">
            <span className="sk sk-line sk-updated" />
          </div>
        </div>
      ) : (
        <>
          {weather.stale && (
            <div className="weather-stale-tip">
              <SvgIcon name="bulb" size={14} />
              <span>天气服务暂不可用,以下为占位数据,请勿参考</span>
            </div>
          )}
          <div
            className={`weather-main${weather.stale ? ' weather-main-stale' : ''}`}
          >
            <div className="weather-icon">
              <SvgIcon name={weather.icon} size={72} />
            </div>
            <div className="weather-info">
              <div className="weather-temp">{weather.tempC}℃</div>
              <div className="weather-desc">
                {weather.city} · {weather.description}
                {rangeText && ` · ${rangeText}`}
              </div>
              <div className="weather-meta">
                <span className="meta-item">
                  <SvgIcon name="droplet" size={14} /> {weather.humidity}%
                </span>
                <span className="meta-item">
                  <SvgIcon name="wind" size={14} /> {weather.windText || '风力平稳'}
                </span>
                <span className="meta-item">
                  <SvgIcon name="thermometer" size={14} /> 体感 {weather.feelsLikeC}℃
                </span>
              </div>
            </div>
          </div>

          {upcoming.length > 0 && (
            <div className="forecast-strip forecast-strip-4">
              {upcoming.map(day => (
                <div className="forecast-item" key={day.date}>
                  <div className="forecast-day">{day.weekdayLabel}</div>
                  <div className="forecast-icon">
                    <SvgIcon name={day.icon} size={30} />
                  </div>
                  <div className="forecast-desc">{day.dayInfo || day.nightInfo}</div>
                  <div className="forecast-temp">
                    {day.high != null && day.low != null ? (
                      <>
                        {Math.round(day.high)}℃
                        <span className="forecast-low">/{Math.round(day.low)}℃</span>
                      </>
                    ) : day.high != null ? (
                      `${Math.round(day.high)}℃`
                    ) : day.low != null ? (
                      `${Math.round(day.low)}℃`
                    ) : (
                      '--'
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="weather-footer">
            <span className="weather-updated">
              <SvgIcon name="refresh" size={12} />
              更新时间 {weather.updatedAt}
            </span>
            <span className="weather-source">
              {weather.stale ? '数据获取失败' : '数据来源:中央气象台'}
            </span>
          </div>
        </>
      )}
    </section>
  );
});

export default WeatherCard;
