# agnew TODO

Open work for agnew. Finished work is deleted, not ticked: `git log` is the archive.
When work merges, retire its entry here in the same change.

Priority tags:
- **(P1)** — a curve or a look agnew can't make today
- **(P2)** — broad reach, or likely to cause friction
- **(P3)** — specialized, or resting on a foundation not built yet

Owner tags, after the priority:
- **[agent]** — an agent can take it alone, making any engineering call inside it
- **[maintainer]** — needs the maintainer: a look, name or feel he reserved, hands-on tuning, a ruling
  to revisit, or hardware or an account only he has
- **[recheck]** — unsure which; the next pass settles it
- **[waiting]** — nothing to do until something outside happens

---

- **Behind on blits.** It pins a blits 0.x release (agnew 0.8.1, fiddy 0.14.0, read 2026-11-25) against the current 1.4.0, a real migration rather than a bump. agnew is also not registered with alpo. Closes when it builds on blits 1.x.

## Use labkit's hash links and bare view

weasel's labkit is gaining `@weasel-js/labkit/link` and `bareOf` (weasel batch 2026-11-26, unreleased).
- `packLink`/`unpackLink`/`useHashLink` keep a lab's state in the URL hash. They're versioned: a link
  from a newer version is refused with a report of what was dropped, and an older one goes through
  `migrate`. The codec is JSON or a binary one you supply. Writing the hash never creates undo steps.
- `bareOf` reads `?bare`, `?bare=still[=<ms>]` and `bg` (3, 4, 6 or 8 hex digits), beside labkit's
  `still` and `present`.

Old links with no version prefix read as version 0 and go through `migrate`, so existing shared links
can keep working. Once a weasel release carries this, drop this repo's own copy: `apps/lab/src/state.ts` and the encode/decode in `packages/agnew/src/codec.ts`. Its v1/v2 design versions map onto `migrate`. Closes when the
lab uses labkit's.

## Describe params as weasel's `ParamShape`

weasel added a plain-JSON param description (weasel batch 2026-11-26, unreleased).
- `ParamShape` lives in `@weasel-js/prefs-schema`, which a runtime library can import without labkit.
- `f.params` in labkit compiles one to a config schema.

Moving over means these renames:

| Was | Now |
|---|---|
| `type` | `kind` |
| `hint` | `description` |
| `choice` | `enum` |
| `startAuto` | `auto: { on: true }` |
| keyed arrays | records |

Drop the converter in `apps/lab/src/schema.ts`. Closes when the hand-written converter is gone.
