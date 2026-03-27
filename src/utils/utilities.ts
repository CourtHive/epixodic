export function isJSON(str: any) {
  try {
    JSON.parse(str);
  } catch {
    return false;
  }
  return true;
}


export function firstAndLast(value: string) {
  const parts = value.split(' ');
  let display = parts[0];
  if (parts.length > 1) display += ' ' + parts[parts.length - 1];
  return display;
}

export function getOpponents(match: any) {
  const format = match.format;
  const sides = match.sides;
  return 'singles' === format
    ? sides.map(function (e: any) {
        return firstAndLast(e[0]);
      })
    : sides.map(teamName);
}

function teamName(side: any[]) {
  return side[0].last_name + '/' + side[1].last_name;
}

export function attemptJSONparse(data: string) {
  if (!data) return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export function formatDate(date: string, separator = '-', format = 'YMD') {
  if (!date) return '';

  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  if (format == 'DMY') return [day, month, year].join(separator);
  if (format == 'MDY') return [month, day, year].join(separator);
  if (format == 'YDM') return [year, day, month].join(separator);
  if (format == 'DYM') return [day, year, month].join(separator);
  if (format == 'MYD') return [month, year, day].join(separator);
  return [year, month, day].join(separator);
}

export function generateRange(start: number, end: number) {
  return Array.from({ length: end - start }, (_, k) => k + start);
}

export function findUpClass(el: any, class_name: string) {
  while (el.parentNode) {
    el = el.parentNode;
    if (el.classList && Array.from(el.classList).indexOf(class_name) >= 0) return el;
  }
  return null;
}
