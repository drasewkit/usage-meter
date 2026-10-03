import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

// How often the countdown is redrawn between measurements.
const TICK_MS = 30_000

// A window at or past this share is drawn as a warning.
const WARN_PERCENT = 90

type Window = { percentUsed: number; resetsAt?: string }
type Windows = { fiveHour?: Window; sevenDay?: Window }

export type Language = 'en' | 'ja'

// One part of the meter line; a warning part is drawn in the warning color.
export type Part = { text: string; warn: boolean }

// Every word the meter line shows, per display language.
const TEXT = {
  en: {
    fiveHour: '5h',
    sevenDay: 'Week',
    used: (percent: number) => `${percent}% used`,
    left: (left: string) => `${left} left`,
    resetsAt: (at: string) => `resets ${at}`,
    day: (at: Date) =>
      `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getDay()]} ${at.getMonth() + 1}/${at.getDate()}`,
    fiveHourReset: '5h: reset (updates on next reply)',
    sevenDayReset: 'Week: reset',
    label: (name: string) => `${name}:`,
    effort: (level: string) => `Effort: ${level}`,
  },
  ja: {
    fiveHour: '5h枠',
    sevenDay: '週',
    used: (percent: number) => `${percent}%使用`,
    left: (left: string) => `残り${left}`,
    resetsAt: (at: string) => `${at}リセット`,
    day: (at: Date) => `${at.getMonth() + 1}/${at.getDate()}(${'日月火水木金土'[at.getDay()]})`,
    fiveHourReset: '5h枠 リセット済み (次の応答で更新)',
    sevenDayReset: '週 リセット済み',
    label: (name: string) => name,
    effort: (level: string) => `effort ${level}`,
  },
} satisfies Record<Language, unknown>

type Text = (typeof TEXT)[Language]

let windows: Windows = {}
// The effort the main loop's last request asked for; until the first request,
// the one the settings name for the session's model.
let effort: string | undefined
// The effort the settings named when last read: a change there (`/effort`,
// `/model`) is the person's and is shown at once.
let settingsLevel: string | undefined
let language: Language = 'en'

type EffortSettings = {
  effortLevel?: unknown
  modelSettings?: Record<string, { effortLevel?: unknown } | undefined>
}

// The settings' effort for a model: its own entry first, then the general one.
export const settingsEffort = (settings: EffortSettings, model: string) => {
  const level = settings.modelSettings?.[model]?.effortLevel ?? settings.effortLevel
  return typeof level === 'string' ? level : undefined
}

const pick = (limits: SessionRateLimit[]): Windows => ({
  fiveHour: limits.find(limit => limit.kind === 'five_hour'),
  sevenDay: limits.find(limit => limit.kind === 'seven_day'),
})

const pad = (n: number) => String(n).padStart(2, '0')

const clockOf = (at: Date) => `${pad(at.getHours())}:${pad(at.getMinutes())}`

// The parts every window shares: the warning flag, the used share and the reset time.
const parse = (window: Window, text: Text) => {
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : NaN
  // Judged on the share as shown, so a window shown at 90% is always marked.
  const percent = Math.round(window.percentUsed)
  const warn = percent >= WARN_PERCENT
  return {
    warn,
    mark: warn ? '⚠ ' : '',
    used: text.used(percent),
    resetsAt: Number.isNaN(resetsAt) ? undefined : resetsAt,
  }
}

const fiveHourPart = (window: Window, now: number, text: Text): Part => {
  const { warn, mark, used, resetsAt } = parse(window, text)
  const label = text.label(text.fiveHour)
  if (resetsAt === undefined) return { text: `${mark}${label} ${used}`, warn }

  const leftMs = resetsAt - now
  if (leftMs <= 0) return { text: text.fiveHourReset, warn: false }

  const minutes = Math.ceil(leftMs / 60_000)
  const left =
    minutes >= 60 ? `${Math.floor(minutes / 60)}h${pad(minutes % 60)}m` : `${minutes}m`

  return {
    text: `${mark}${label} ${text.left(left)} · ${used} · ${text.resetsAt(clockOf(new Date(resetsAt)))}`,
    warn,
  }
}

const sevenDayPart = (window: Window, now: number, text: Text): Part => {
  const { warn, mark, used, resetsAt } = parse(window, text)
  const label = text.label(text.sevenDay)
  if (resetsAt === undefined) return { text: `${mark}${label} ${used}`, warn }
  if (resetsAt <= now) return { text: text.sevenDayReset, warn: false }

  const at = new Date(resetsAt)
  return { text: `${mark}${label} ${used} · ${text.resetsAt(`${text.day(at)} ${clockOf(at)}`)}`, warn }
}

export const parts = (
  { fiveHour, sevenDay }: Windows,
  level: string | undefined,
  now: number,
  lang: Language,
): Part[] => {
  const text = TEXT[lang]
  return [
    fiveHour && fiveHourPart(fiveHour, now, text),
    sevenDay && sevenDayPart(sevenDay, now, text),
    level === undefined ? undefined : { text: text.effort(level), warn: false },
  ].filter(part => part !== undefined)
}

// The meter line as plain text, its parts joined as drawn.
export const format = (shown: Part[]) =>
  shown.length > 0 ? shown.map(part => part.text).join(' | ') : undefined

// Reads the settings' effort for the session's model; when it changed, shows it.
const syncSettings = async ($: EngineInterface) => {
  const level = settingsEffort(
    (await $.settings.read()) as EffortSettings,
    await $.session.model(),
  )
  if (level === settingsLevel) return

  settingsLevel = level
  effort = level
  redraw($)
}

// Asks for the hint line again, so it draws the latest figures and the time left.
const redraw = ($: EngineInterface) => $.ui.invalidate('ui.render')

export const register: Register = (on, options) => {
  language = options.language === 'ja' ? 'ja' : 'en'

  on('session.start', async ($, e, next) => {
    const result = await next(e)

    windows = pick((await $.session.usage()).rateLimits)
    await syncSettings($)
    redraw($)
    $.clock.every(TICK_MS, async () => {
      await syncSettings($)
      redraw($)
    })

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      windows = pick(e.rateLimits)
      redraw($)
    }

    return next(e)
  })

  // `/effort` and `/model` write the settings as they finish: show the new level now,
  // not at the next request.
  on('command.run', async ($, e, next) => {
    const result = await next(e)
    if (e.command === 'effort' || e.command === 'model') await syncSettings($)

    return result
  })

  on('turn.step', async function* ($, e, next) {
    const level = e.effort === undefined ? undefined : String(e.effort)
    if (e.agentId === undefined && level !== effort) {
      effort = level
      redraw($)
    }

    return yield* next(e)
  })

  // The meter line goes under the engine's hint line (`auto mode on`, `esc to interrupt`).
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const hint = await next(e)
    const shown = parts(windows, effort, await $.clock.now(), language)
    if (shown.length === 0) return hint

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {hint}
        <Text wrap="truncate-end">
          {shown.flatMap((part, index) => [
            ...(index > 0 ? [<Text key={`gap-${index}`} dimColor>{' | '}</Text>] : []),
            part.warn ? (
              <Text key={`part-${index}`} color="warning">{part.text}</Text>
            ) : (
              <Text key={`part-${index}`} dimColor>{part.text}</Text>
            ),
          ])}
        </Text>
      </Box>
    )
  })
}
