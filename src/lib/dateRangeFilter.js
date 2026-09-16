// Filtro de período compartilhado pelas abas do centro de comando da Gestão.
export const localDay = (date = new Date()) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const firstDayOfMonth = () => `${localDay().slice(0, 7)}-01`;

export const addDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDay(date);
};

export const defaultDateRange = () => ({ start: firstDayOfMonth(), end: localDay() });

// Aceita qualquer registro: usa o primeiro campo de data disponível.
export const recordDay = (record, fields = []) => {
  const value = [...fields, 'created_date'].map((field) => record?.[field]).find(Boolean);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : localDay(date);
};

export const filterByDateRange = (records = [], range, fields = []) => {
  if (!range?.start && !range?.end) return records;
  return records.filter((record) => {
    const day = recordDay(record, fields);
    if (!day) return true;
    if (range.start && day < range.start) return false;
    if (range.end && day > range.end) return false;
    return true;
  });
};