const fields = ['name','phone','email','city','requirement','monthly_bill','message','source_page','created_at'];

/** Import a private backup only through authenticated admin; preserve dates and skip exact duplicates. */
export async function importEnquiries(file, env) {
  if (!file || typeof file.text !== 'function' || !file.size || file.size > 1024 * 1024) {
    throw new Error('Choose an enquiry JSON backup up to 1 MB.');
  }
  let rows;
  try { rows = JSON.parse(await file.text()); } catch { throw new Error('Invalid enquiry JSON backup.'); }
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('Backup must contain 1–500 enquiries.');
  const statements = rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid enquiry at row ${index + 1}.`);
    const values = fields.map(key => {
      const value = row[key];
      if (value == null && ['email','monthly_bill','message'].includes(key)) return null;
      if (typeof value !== 'string' || value.length > 10000) throw new Error(`Invalid ${key} at row ${index + 1}.`);
      return value;
    });
    if (!row.name.trim() || !row.phone.trim() || !row.city.trim() || !row.requirement.trim() ||
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.created_at) || Number.isNaN(Date.parse(row.created_at.replace(' ','T')+'Z'))) {
      throw new Error(`Incomplete enquiry at row ${index + 1}.`);
    }
    const emailSent = Number(row.email_sent ?? 0);
    if (![0,1].includes(emailSent)) throw new Error(`Invalid email status at row ${index + 1}.`);
    const match = fields.map(key => `COALESCE(${key},'')=COALESCE(?,'')`).join(' AND ');
    return env.DB.prepare(`INSERT INTO enquiries (${fields.join(',')},email_sent) SELECT ${fields.map(()=>'?').join(',')},? WHERE NOT EXISTS (SELECT 1 FROM enquiries WHERE ${match})`).bind(...values,emailSent,...values);
  });
  const results = await env.DB.batch(statements);
  const imported = results.reduce((sum, result) => sum + Number(result.meta.changes || 0), 0);
  return { imported, skipped: rows.length - imported };
}
