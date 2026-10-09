/** Whether the lab opens presenting its one trial. `?bare` is what embeds of
 *  the lab already link to; labkit itself answers `?present`. */
export function startsPresenting(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('bare') || params.has('present');
}
