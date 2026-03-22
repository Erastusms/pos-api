/**
 * Convert a string to a URL-friendly slug.
 * Handles Indonesian characters (spasi → strip, huruf khusus → dibuang).
 *
 * @example
 * slugify('Nasi & Mie Goreng') // → 'nasi-mie-goreng'
 * slugify('Kopi & Teh')        // → 'kopi-teh'
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g,   'e')
    .replace(/[ìíîï]/g,   'i')
    .replace(/[òóôõö]/g,  'o')
    .replace(/[ùúûü]/g,   'u')
    .replace(/[^a-z0-9\s-]/g, '') // hapus karakter non-alphanumeric (termasuk &)
    .replace(/\s+/g, '-')          // spasi → strip
    .replace(/-+/g, '-')           // strip berulang → satu strip
    .replace(/^-|-$/g, '')         // trim strip di awal/akhir
}
