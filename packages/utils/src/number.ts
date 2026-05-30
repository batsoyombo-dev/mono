import numeral from "numeral";

export function formatCurrency(number: string | number) {
    return `${numeral(number).format("0,0")}₮`;
}

export function formatPercent(number: number) {
    return numeral(number / 100).format("0.0%");
}

export function formatNumber(number: string | number) {
    return numeral(number).format();
}

export function formatShortenNumber(number: string | number) {
    return numeral(number).format("0.00a").replace(".00", "");
}

export function formatData(number: string | number) {
    return numeral(number).format("0.0 b");
}
