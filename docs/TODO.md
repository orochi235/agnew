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

- **(P3) [agent] The lab opens a shared link without saying what it couldn't load.** `sanitizeDesign`
  in `packages/agnew/src/codec.ts` drops unknown block kinds, wrongly typed params and motions, and
  blocks past `MAX_BLOCKS`, and returns `null` for an unknown design version; `restore` in
  `apps/lab/src/state.ts` then shows whatever survived, or the first preset, with no notice. Fresh
  block ids on load are not a loss: `portableDesign` strips ids on purpose.
  Closes when opening a link with an unknown kind, a bad param, or `version: 3` shows a notice
  naming what was dropped or refused.
