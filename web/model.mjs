// Keep transformations separate from the DOM so they can be tested directly.
export function cleanLines(text) {
  if (typeof text !== 'string') throw new TypeError('Expected text');
  const lines = text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);
  const unique = [...new Set(lines)];
  return { text: unique.join('\n'), count: unique.length, removed: lines.length - unique.length };
}
