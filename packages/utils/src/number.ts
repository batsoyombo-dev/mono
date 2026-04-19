import numeral from "numeral";

import { MEASURE_UNIT, type MeasureUnitType } from "./constants";

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

const MEASURE_UNIT_MN: Record<MeasureUnitType, string> = {
    [MEASURE_UNIT.G]: "гм",
    [MEASURE_UNIT.KG]: "кг",
    [MEASURE_UNIT.ML]: "мл",
    [MEASURE_UNIT.L]: "л",
    [MEASURE_UNIT.UNIT]: "ширхэг",
};

export function formatWeight(weight: number, unit: MeasureUnitType | string): string {
    if (weight == null || isNaN(weight)) return "";

    const label = (u: MeasureUnitType | string) =>
        u in MEASURE_UNIT_MN ? MEASURE_UNIT_MN[u as MeasureUnitType] : u;

    switch (unit) {
        case MEASURE_UNIT.G:
            if (weight >= 1000) {
                return `${(weight / 1000).toFixed(2).replace(/\.00$/, "")} ${label(MEASURE_UNIT.KG)}`;
            }
            return `${weight} ${label(MEASURE_UNIT.G)}`;

        case MEASURE_UNIT.KG:
            if (weight < 1) {
                return `${Math.round(weight * 1000)} ${label(MEASURE_UNIT.G)}`;
            }
            return `${weight} ${label(MEASURE_UNIT.KG)}`;

        case MEASURE_UNIT.ML:
            if (weight >= 1000) {
                return `${(weight / 1000).toFixed(2).replace(/\.00$/, "")} ${label(MEASURE_UNIT.L)}`;
            }
            return `${weight} ${label(MEASURE_UNIT.ML)}`;

        case MEASURE_UNIT.L:
            if (weight < 1) {
                return `${Math.round(weight * 1000)} ${label(MEASURE_UNIT.ML)}`;
            }
            return `${weight} ${label(MEASURE_UNIT.L)}`;

        default:
            return `${weight} ${label(unit)}`;
    }
}
