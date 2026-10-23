/** Weather from Open-Meteo: free, no key, no account. */
const WMO = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle',
  55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers',
  82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' }

module.exports = {
  id: 'weather',
  name: 'Weather',
  icon: 'weather',
  blurb: 'Temperature now and the next few hours. No account needed.',
  every: 15 * 60_000,
  fields: [{ key: 'place', label: 'City', placeholder: 'Your city' }],
  async poll(ctx) {
    const place = (ctx.config.place || '').trim()
    if (!place) throw new Error('Add your city.')
    if (ctx.memo.place !== place) {
      const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place)}`)).json()
      const hit = g.results?.[0]
      if (!hit) throw new Error(`Could not find "${place}".`)
      Object.assign(ctx.memo, { place, lat: hit.latitude, lon: hit.longitude, label: hit.name })
    }
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ctx.memo.lat}&longitude=${ctx.memo.lon}` +
      '&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&forecast_hours=12&timezone=auto')).json()
    const c = w.current
    const hours = (w.hourly?.time || []).map((t, i) => ({ t, temp: w.hourly.temperature_2m[i], code: w.hourly.weather_code[i] }))
    return {
      value: `${Math.round(c.temperature_2m)}°`,
      caption: `${WMO[c.weather_code] || 'Now'} in ${ctx.memo.label}`,
      urgency: 'calm',
      items: hours.filter((_, i) => i % 3 === 2).map((h) => ({
        title: `${Math.round(h.temp)}°  ${WMO[h.code] || ''}`, meta: h.t.slice(11, 16),
      })),
    }
  },
}
