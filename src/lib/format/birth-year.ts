/** "2007" → "’07" for narrow (mobile) result tables; anything else is returned unchanged. */
export function shortBirthYear(year: string): string {
  return /^\d{4}$/.test(year) ? `’${year.slice(2)}` : year;
}
