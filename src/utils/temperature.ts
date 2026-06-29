import { Prisma } from "@prisma/client";

export type TemperatureUnit = "C" | "F";

export function normalizeTemperatureUnit(value: unknown): TemperatureUnit {
    return value === "F" ? "F" : "C";
}

export function getTemperatureUnitLabel(unit: TemperatureUnit): string {
    return unit === "F" ? "°F" : "°C";
}

export function celsiusToFahrenheit(value: number): number {
    return (value * 9 / 5) + 32;
}

export function fahrenheitToCelsius(value: number): number {
    return (value - 32) * 5 / 9;
}

export function convertCelsiusToUserTemperature(value: number, unit: TemperatureUnit): number {
    if (unit === "F") {
        return celsiusToFahrenheit(value);
    }

    return value;
}

export function convertUserTemperatureToCelsius(value: number, unit: TemperatureUnit): number {
    if (unit === "F") {
        return fahrenheitToCelsius(value);
    }

    return value;
}

export function roundTemperature(value: number): number {
    return Math.round(value * 10) / 10;
}

export function formatTemperatureNumber(value: number | null | undefined, unit: TemperatureUnit): string {
    if (value === null || typeof value === "undefined") {
        return "";
    }

    const convertedValue = roundTemperature(convertCelsiusToUserTemperature(value, unit));

    if (Number.isInteger(convertedValue)) {
        return String(convertedValue);
    }

    return convertedValue.toFixed(1);
}

export function formatTemperatureWithUnit(value: number | null | undefined, unit: TemperatureUnit): string {
    const formattedValue = formatTemperatureNumber(value, unit);

    if (!formattedValue) {
        return "";
    }

    return `${formattedValue}${getTemperatureUnitLabel(unit)}`;
}

export function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
    if (value === null || typeof value === "undefined") {
        return null;
    }

    if (typeof value === "number") {
        return value;
    }

    return Number(value.toString());
}

export function formatTemperatureDecimalForInput(value: Prisma.Decimal | number | null | undefined, unit: TemperatureUnit): string {
    const numericValue = decimalToNumber(value);

    return formatTemperatureNumber(numericValue, unit);
}

export function parseTemperatureInputToCelsiusDecimal(value: string, unit: TemperatureUnit): Prisma.Decimal | null {
    const trimmedValue = String(value || "").trim();

    if (!trimmedValue) {
        return null;
    }

    const numericValue = Number(trimmedValue);

    if (Number.isNaN(numericValue)) {
        return null;
    }

    const celsiusValue = convertUserTemperatureToCelsius(numericValue, unit);

    return new Prisma.Decimal(roundTemperature(celsiusValue).toFixed(1));
}

export function isValidTemperatureUnit(value: string): value is TemperatureUnit {
    return value === "C" || value === "F";
}
