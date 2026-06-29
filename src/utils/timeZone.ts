export type TimeZoneOption = {
    value: string;
    label: string;
};

export const defaultTimeZone = "America/Los_Angeles";

export const timeZoneOptions: TimeZoneOption[] = [
    { value: "America/Los_Angeles", label: "North America — Pacific Time (Los Angeles, Vancouver)" },
    { value: "America/Denver", label: "North America — Mountain Time (Denver, Calgary)" },
    { value: "America/Phoenix", label: "North America — Arizona Time (Phoenix)" },
    { value: "America/Chicago", label: "North America — Central Time (Chicago, Mexico City)" },
    { value: "America/New_York", label: "North America — Eastern Time (New York, Toronto)" },
    { value: "America/Halifax", label: "North America — Atlantic Time (Halifax)" },
    { value: "America/St_Johns", label: "North America — Newfoundland Time (St. John's)" },
    { value: "America/Anchorage", label: "North America — Alaska Time (Anchorage)" },
    { value: "Pacific/Honolulu", label: "North America — Hawaii Time (Honolulu)" },

    { value: "America/Tijuana", label: "Mexico — Tijuana" },
    { value: "America/Mexico_City", label: "Mexico — Mexico City" },
    { value: "America/Cancun", label: "Mexico — Cancun" },

    { value: "America/Guatemala", label: "Central America — Guatemala City" },
    { value: "America/Costa_Rica", label: "Central America — San José" },
    { value: "America/Panama", label: "Central America — Panama City" },

    { value: "America/Bogota", label: "South America — Bogotá, Lima, Quito" },
    { value: "America/Caracas", label: "South America — Caracas" },
    { value: "America/Santiago", label: "South America — Santiago" },
    { value: "America/Argentina/Buenos_Aires", label: "South America — Buenos Aires" },
    { value: "America/Sao_Paulo", label: "South America — São Paulo" },

    { value: "UTC", label: "UTC — Coordinated Universal Time" },
    { value: "Atlantic/Reykjavik", label: "Europe — Reykjavik" },
    { value: "Europe/Dublin", label: "Europe — Dublin" },
    { value: "Europe/London", label: "Europe — London" },
    { value: "Europe/Lisbon", label: "Europe — Lisbon" },
    { value: "Europe/Madrid", label: "Europe — Madrid" },
    { value: "Europe/Paris", label: "Europe — Paris" },
    { value: "Europe/Brussels", label: "Europe — Brussels" },
    { value: "Europe/Amsterdam", label: "Europe — Amsterdam" },
    { value: "Europe/Berlin", label: "Europe — Berlin" },
    { value: "Europe/Rome", label: "Europe — Rome" },
    { value: "Europe/Zurich", label: "Europe — Zurich" },
    { value: "Europe/Stockholm", label: "Europe — Stockholm" },
    { value: "Europe/Oslo", label: "Europe — Oslo" },
    { value: "Europe/Copenhagen", label: "Europe — Copenhagen" },
    { value: "Europe/Warsaw", label: "Europe — Warsaw" },
    { value: "Europe/Prague", label: "Europe — Prague" },
    { value: "Europe/Vienna", label: "Europe — Vienna" },
    { value: "Europe/Budapest", label: "Europe — Budapest" },
    { value: "Europe/Athens", label: "Europe — Athens" },
    { value: "Europe/Helsinki", label: "Europe — Helsinki" },
    { value: "Europe/Istanbul", label: "Europe — Istanbul" },
    { value: "Europe/Moscow", label: "Europe — Moscow" },

    { value: "Africa/Casablanca", label: "Africa — Casablanca" },
    { value: "Africa/Lagos", label: "Africa — Lagos" },
    { value: "Africa/Cairo", label: "Africa — Cairo" },
    { value: "Africa/Johannesburg", label: "Africa — Johannesburg" },
    { value: "Africa/Nairobi", label: "Africa — Nairobi" },

    { value: "Asia/Jerusalem", label: "Middle East — Jerusalem" },
    { value: "Asia/Amman", label: "Middle East — Amman" },
    { value: "Asia/Beirut", label: "Middle East — Beirut" },
    { value: "Asia/Riyadh", label: "Middle East — Riyadh" },
    { value: "Asia/Dubai", label: "Middle East — Dubai" },
    { value: "Asia/Qatar", label: "Middle East — Doha" },
    { value: "Asia/Tehran", label: "Middle East — Tehran" },

    { value: "Asia/Karachi", label: "Asia — Karachi" },
    { value: "Asia/Kolkata", label: "Asia — India Time (Mumbai, Delhi, Bengaluru)" },
    { value: "Asia/Dhaka", label: "Asia — Dhaka" },
    { value: "Asia/Bangkok", label: "Asia — Bangkok, Hanoi" },
    { value: "Asia/Jakarta", label: "Asia — Jakarta" },
    { value: "Asia/Singapore", label: "Asia — Singapore" },
    { value: "Asia/Kuala_Lumpur", label: "Asia — Kuala Lumpur" },
    { value: "Asia/Manila", label: "Asia — Manila" },
    { value: "Asia/Hong_Kong", label: "Asia — Hong Kong" },
    { value: "Asia/Shanghai", label: "Asia — China Time (Shanghai, Beijing)" },
    { value: "Asia/Taipei", label: "Asia — Taipei" },
    { value: "Asia/Seoul", label: "Asia — Seoul" },
    { value: "Asia/Tokyo", label: "Asia — Tokyo" },
    { value: "Asia/Vladivostok", label: "Asia — Vladivostok" },

    { value: "Australia/Perth", label: "Australia — Perth" },
    { value: "Australia/Darwin", label: "Australia — Darwin" },
    { value: "Australia/Adelaide", label: "Australia — Adelaide" },
    { value: "Australia/Brisbane", label: "Australia — Brisbane" },
    { value: "Australia/Sydney", label: "Australia — Sydney, Melbourne" },
    { value: "Pacific/Auckland", label: "Oceania — Auckland" },
    { value: "Pacific/Fiji", label: "Oceania — Fiji" },
    { value: "Pacific/Guam", label: "Oceania — Guam" }
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
