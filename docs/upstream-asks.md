# Upstream asks

What this repo works around in its dependencies, and what will replace the
workaround.

## `@weasel-js/labkit` — a shell that fills its page

`LabShell` pads its body with `--lk-workspace-pad`, which suits a workspace of
tiles but shows as a margin around a lab that is one full-bleed picture. The
lab zeroes that variable on `.lk-root`.

**Fixed upstream, waiting on a release** (weasel changeset
`labkit-shell-body-no-pad`: the viewport stops padding its contents and the
property is removed). The override is inert once that ships — delete it when
the lab takes the new labkit.

## `@weasel-js/*` — linked to the local weasel checkout

The lab takes its `@weasel-js` packages as `file:` dependencies on
`~/src/weasel/packages/*`, for the loupe over a WebGL canvas
(`<TrialLoupe source>`) and top-aligned property rows, neither released yet
(weasel changesets `loupe-any-canvas`, `prop-rows-top`). It runs that
checkout's built `dist`, so rebuild a weasel package after changing it.

**CI cannot install these, so the Pages deploy fails until they go back to
npm versions.** Once weasel releases, set the four deps in
`apps/lab/package.json` back to `^<release>` and `npm install`; the vite
plugin in `apps/lab/weasel.vite.ts` turns itself off on npm's copy.
