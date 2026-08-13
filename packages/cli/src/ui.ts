const useColor =
  process.env["NO_COLOR"] === undefined &&
  process.env["TERM"] !== "dumb" &&
  process.stdout.isTTY === true;

const ESC = "";

const wrap =
  (code: string) =>
  (text: string): string =>
    useColor ? `${ESC}[${code}m${text}${ESC}[0m` : text;

export const bold = wrap("1");
export const dim = wrap("2");
export const red = wrap("31");
export const green = wrap("32");
export const yellow = wrap("33");
export const blue = wrap("36");

export function heading(text: string): string {
  return `\n${bold(text)}`;
}

/** ตัดรายการยาว ๆ ให้พอดีจอ แล้วบอกว่าเหลืออีกเท่าไร */
export function capped<T>(items: T[], limit: number, render: (item: T) => string): string[] {
  const shown = items.slice(0, limit).map(render);
  if (items.length > limit) {
    shown.push(dim(`  … และอีก ${items.length - limit} รายการ`));
  }
  return shown;
}

export function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}
