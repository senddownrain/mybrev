const cell = (value) => {
  const text = Array.isArray(value) ? value.join('; ') : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text; // spreadsheet formula injection
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function toCsv(rows, columns = rows[0] ? Object.keys(rows[0]) : []) {
  return `${[columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\n')}\n`;
}
