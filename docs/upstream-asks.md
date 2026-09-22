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
