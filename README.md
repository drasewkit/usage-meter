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

| Option | Values | Default |
| --- | --- | --- |
| `language` | `en`, `ja` | `en` |

Change it from `/config` (the **Display language** row). The Japanese display looks like this:

```
5h枠 残り2h14m · 63%使用 · 13:14リセット | 週 41%使用 · 10/8(木) 09:00リセット | effort medium
```

## Privacy

Usage Meter sends nothing anywhere and makes no network requests. It reads only what Claude Code already has in the running session: the rate-limit figures, the model name, the effort of each request and your settings' effort levels. Nothing is written to disk.

## Development

```sh
claude plugin validate --strict .
claude plugin test .
claude --plugin-dir .
```

## License

[MIT](LICENSE)
