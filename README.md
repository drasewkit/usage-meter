# Usage Meter

A Claude Code plugin that keeps your subscription usage in view: the time left in the 5-hour window, the weekly usage, and the effort level the session is running at, on one quiet line under the prompt that updates by itself.

```
⏵⏵ auto mode on (shift+tab to cycle)
5h: 2h14m left · 63% used · resets 13:14 | Week: 41% used · resets Thu 10/8 09:00 | Effort: medium
```

- **5h**: time until the 5-hour window resets, the share used and the reset time. Counts down every 30 seconds.
- **Week**: the share of the weekly limit used and when it resets.
- **Effort**: the effort level of the main conversation's last request. Before the first request it shows the level your settings name for the session's model (`modelSettings.<model>.effortLevel`, then `effortLevel`).
- The line is dim. A window at 90% or more turns into a warning: `⚠` and the warning color, on that window alone.
- On a narrow terminal the line is cut at its end rather than wrapped.

## Requirements

- Claude Code **2.1.287 or later** (plugin hooks modules).
- A Claude subscription (Pro or Max). The usage windows come from the rate-limit figures Claude Code receives on a subscription; with an API key there are none, and only the effort is shown.

## Install

```sh
claude plugin marketplace add drasewkit/usage-meter
claude plugin install usage-meter@drasewkit
```

Start a new session and the line appears under the prompt.

## Settings

| Option | Type | Default |
| --- | --- | --- |
| `japanese` (日本語で表示) | on / off | off (English) |

Turn it on from `/config` (the **日本語で表示 (Japanese)** row). The Japanese display looks like this:

```
5h枠 残り2h14m · 63%使用 · 13:14リセット | 週 41%使用 · 10/8(木) 09:00リセット | effort medium
```

## What it hooks

| Hook | Why |
| --- | --- |
| `session.start` | Reads the usage windows, the model and your settings' effort once the session starts, then redraws every 30 seconds. |
| `session.measure` | Picks up new usage figures as Claude Code receives them. |
| `turn.step` | Reads the effort of each main-conversation request. It passes every request on unchanged. |
| `command.run` | After `/effort` or `/model` finishes, re-reads the settings so a new effort shows at once. It passes every command on unchanged and changes nothing in its output. |
| `ui.render` (`PromptHint`) | Draws the meter line under Claude Code's own hint line, which it keeps as drawn. |

## Privacy

Usage Meter sends nothing anywhere and makes no network requests. It starts no processes and writes nothing to disk.

It reads only what Claude Code already has in the running session:

- the rate-limit figures (share used and reset time of the 5-hour and weekly windows);
- the session's model name;
- the effort of each main-conversation request;
- your settings, to show the effort before the first request and after `/effort` or `/model`. Claude Code hands a plugin the settings whole; Usage Meter uses only `effortLevel` and `modelSettings.<model>.effortLevel` from them and keeps nothing else.

These values live in the session's memory while it runs and are gone when it ends. No personal data (names, email addresses, conversation content) is read or kept.

## Development

```sh
claude plugin validate --strict .
claude plugin test .
claude --plugin-dir .
```

## License

[MIT](LICENSE)
