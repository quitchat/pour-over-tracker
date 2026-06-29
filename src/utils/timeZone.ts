export type TimeZoneOption = {
    value: string;
    label: string;
};

export const defaultTimeZone = "America/Los_Angeles";

export const timeZoneOptions: TimeZoneOption[] = [
    { value: "America/Los_Angeles", label: "Pacific Time" },
    { value: "America/Denver", label: "Mountain Time" },
    { value: "America/Chicago", label: "Central Time" },
    { value: "America/New_York", label: "Eastern Time" },
    { value: "America/Anchorage", label: "Alaska Time" },
    { value: "Pacific/Honolulu", label: "Hawaii Time" },
    { value: "UTC", label: "UTC" }
];

export function isValidTimeZone(timeZone: string): boolean {
    const normalizedTimeZone = String(timeZone || "").trim();

    if (!normalizedTimeZone) {
        return false;
    }

    try {
        new Intl.DateTimeFormat("en-US", {
            timeZone: normalizedTimeZone
        }).format(new Date());

        return true;
    } catch (error) {
        return false;
    }
}

export function normalizeTimeZone(timeZone: string | null | undefined): string {
    const normalizedTimeZone = String(timeZone || "").trim();

    if (isValidTimeZone(normalizedTimeZone)) {
        return normalizedTimeZone;
    }

    return defaultTimeZone;
}

export function getTimeZoneOptions(): TimeZoneOption[] {
    return timeZoneOptions;
}

export function getTimeZoneLabel(timeZone: string | null | undefined): string {
    const normalizedTimeZone = normalizeTimeZone(timeZone);
    const match = timeZoneOptions.find(function (option) {
        return option.value === normalizedTimeZone;
    });

    if (match) {
        return match.label;
    }

    return normalizedTimeZone;
}
