export function formatDateUs(value: Date | string | null | undefined): string {
    if (!value) {
        return "";
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();

    return `${month}/${day}/${year}`;
}

export function formatDateTimeUs(value: Date | string | null | undefined): string {
    if (!value) {
        return "";
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const dateText = formatDateUs(date);
    const hour = date.getHours();
    const minute = String(date.getMinutes()).padStart(2, "0");
    const amPm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;

    return `${dateText} ${displayHour}:${minute} ${amPm}`;
}

export function formatDateForInput(value: Date | string | null | undefined): string {
    if (!value) {
        return "";
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();

    return `${year}-${month}-${day}`;
}


export function getTodayDateForInput(timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const year = parts.find(function (part) { return part.type === "year"; })?.value || "";
    const month = parts.find(function (part) { return part.type === "month"; })?.value || "";
    const day = parts.find(function (part) { return part.type === "day"; })?.value || "";

    if (!year || !month || !day) {
        return new Date().toISOString().substring(0, 10);
    }

    return `${year}-${month}-${day}`;
}

export function parseDateOnlyToUtcDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
}

export function parseDateOnlyToUtcEndOfDay(value: string): Date {
    return new Date(`${value}T23:59:59.999Z`);
}

export function formatDateOnlyUs(value: Date | string | null | undefined): string {
    if (!value) {
        return "";
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const year = date.getUTCFullYear();

    return `${month}/${day}/${year}`;
}

export function formatDateOnlyForInput(value: Date | string | null | undefined): string {
    if (!value) {
        return "";
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const year = date.getUTCFullYear();

    return `${year}-${month}-${day}`;
}

export function formatMonthKeyFromDateOnly(value: Date | string | null | undefined): string {
    if (!value) {
        return "";
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");

    return `${year}-${month}`;
}

export function buildLastMonthKeys(count: number, timeZone: string): string[] {
    const todayDateText = getTodayDateForInput(timeZone);
    const year = Number(todayDateText.substring(0, 4));
    const monthIndex = Number(todayDateText.substring(5, 7)) - 1;
    const result: string[] = [];

    for (let index = count - 1; index >= 0; index--) {
        const date = new Date(Date.UTC(year, monthIndex - index, 1));
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        result.push(`${date.getUTCFullYear()}-${month}`);
    }

    return result;
}

export function getTodayPacificDateForInput(): string {
    return getTodayDateForInput("America/Los_Angeles");
}

export function buildLastPacificMonthKeys(count: number): string[] {
    return buildLastMonthKeys(count, "America/Los_Angeles");
}
