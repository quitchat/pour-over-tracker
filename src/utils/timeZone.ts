export type TimeZoneOption = {
    value: string;
    label: string;
    group: string;
};

export type TimeZoneGroup = {
    label: string;
    options: TimeZoneOption[];
};

type TimeZoneDefinition = {
    value: string;
    name: string;
    cities: string;
};

export const defaultTimeZone = "America/Los_Angeles";

const timeZoneDefinitions: TimeZoneDefinition[] = [
    { value: "Pacific/Pago_Pago", name: "Samoa Standard Time", cities: "Pago Pago" },
    { value: "Pacific/Honolulu", name: "Hawaii Time", cities: "Honolulu" },
    { value: "America/Anchorage", name: "Alaska Time", cities: "Anchorage" },
    { value: "America/Los_Angeles", name: "Pacific Time", cities: "Los Angeles, Vancouver, Seattle" },
    { value: "America/Vancouver", name: "Pacific Time", cities: "Vancouver" },
    { value: "America/Tijuana", name: "Pacific Mexico Time", cities: "Tijuana" },
    { value: "America/Denver", name: "Mountain Time", cities: "Denver, Salt Lake City" },
    { value: "America/Phoenix", name: "Arizona Time", cities: "Phoenix" },
    { value: "America/Chicago", name: "Central Time", cities: "Chicago, Dallas, Winnipeg" },
    { value: "America/Mexico_City", name: "Mexico Central Time", cities: "Mexico City" },
    { value: "America/New_York", name: "Eastern Time", cities: "New York, Toronto, Miami" },
    { value: "America/Toronto", name: "Eastern Canada Time", cities: "Toronto" },
    { value: "America/Lima", name: "Peru Time", cities: "Lima" },
    { value: "America/Bogota", name: "Colombia Time", cities: "Bogotá" },
    { value: "America/Halifax", name: "Atlantic Time", cities: "Halifax" },
    { value: "America/Puerto_Rico", name: "Caribbean Time", cities: "San Juan, Santo Domingo" },
    { value: "America/Santiago", name: "Chile Time", cities: "Santiago" },
    { value: "America/St_Johns", name: "Newfoundland Time", cities: "St. John's" },
    { value: "America/Argentina/Buenos_Aires", name: "Argentina Time", cities: "Buenos Aires" },
    { value: "America/Sao_Paulo", name: "Brazil Time", cities: "São Paulo, Rio de Janeiro" },
    { value: "America/Montevideo", name: "Uruguay Time", cities: "Montevideo" },
    { value: "Atlantic/Azores", name: "Azores Time", cities: "Ponta Delgada" },
    { value: "UTC", name: "Coordinated Universal Time", cities: "UTC" },
    { value: "Europe/London", name: "Greenwich Mean Time", cities: "London" },
    { value: "Europe/Dublin", name: "Ireland Time", cities: "Dublin" },
    { value: "Europe/Lisbon", name: "Portugal Time", cities: "Lisbon" },
    { value: "Atlantic/Reykjavik", name: "Iceland Time", cities: "Reykjavik" },
    { value: "Europe/Paris", name: "Central European Time", cities: "Paris" },
    { value: "Europe/Berlin", name: "Central European Time", cities: "Berlin" },
    { value: "Europe/Rome", name: "Central European Time", cities: "Rome" },
    { value: "Europe/Madrid", name: "Central European Time", cities: "Madrid" },
    { value: "Europe/Amsterdam", name: "Central European Time", cities: "Amsterdam" },
    { value: "Europe/Zurich", name: "Central European Time", cities: "Zurich" },
    { value: "Europe/Warsaw", name: "Central European Time", cities: "Warsaw" },
    { value: "Europe/Vienna", name: "Central European Time", cities: "Vienna" },
    { value: "Africa/Lagos", name: "West Africa Time", cities: "Lagos" },
    { value: "Africa/Casablanca", name: "Morocco Time", cities: "Casablanca" },
    { value: "Europe/Athens", name: "Eastern European Time", cities: "Athens" },
    { value: "Europe/Helsinki", name: "Eastern European Time", cities: "Helsinki" },
    { value: "Europe/Bucharest", name: "Eastern European Time", cities: "Bucharest" },
    { value: "Africa/Johannesburg", name: "South Africa Time", cities: "Johannesburg, Cape Town" },
    { value: "Africa/Cairo", name: "Egypt Time", cities: "Cairo" },
    { value: "Asia/Jerusalem", name: "Israel Time", cities: "Tel Aviv, Jerusalem" },
    { value: "Europe/Istanbul", name: "Turkey Time", cities: "Istanbul" },
    { value: "Asia/Riyadh", name: "Arabia Time", cities: "Riyadh, Doha, Kuwait City" },
    { value: "Asia/Dubai", name: "Gulf Time", cities: "Dubai, Abu Dhabi, Muscat" },
    { value: "Africa/Nairobi", name: "East Africa Time", cities: "Nairobi, Addis Ababa" },
    { value: "Europe/Moscow", name: "Moscow Time", cities: "Moscow" },
    { value: "Asia/Tehran", name: "Iran Time", cities: "Tehran" },
    { value: "Asia/Baku", name: "Caucasus Time", cities: "Baku" },
    { value: "Asia/Yerevan", name: "Armenia Time", cities: "Yerevan" },
    { value: "Asia/Tbilisi", name: "Georgia Time", cities: "Tbilisi" },
    { value: "Asia/Kabul", name: "Afghanistan Time", cities: "Kabul" },
    { value: "Asia/Karachi", name: "Pakistan Time", cities: "Karachi, Islamabad" },
    { value: "Asia/Tashkent", name: "Uzbekistan Time", cities: "Tashkent" },
    { value: "Asia/Kolkata", name: "India Time", cities: "Mumbai, Delhi, Bengaluru, Chennai" },
    { value: "Asia/Kathmandu", name: "Nepal Time", cities: "Kathmandu" },
    { value: "Asia/Dhaka", name: "Bangladesh Time", cities: "Dhaka" },
    { value: "Asia/Almaty", name: "Kazakhstan Time", cities: "Almaty" },
    { value: "Asia/Yangon", name: "Myanmar Time", cities: "Yangon" },
    { value: "Asia/Bangkok", name: "Indochina Time", cities: "Bangkok, Hanoi, Phnom Penh" },
    { value: "Asia/Jakarta", name: "Western Indonesia Time", cities: "Jakarta" },
    { value: "Asia/Shanghai", name: "China Time", cities: "Beijing, Shanghai" },
    { value: "Asia/Singapore", name: "Singapore Time", cities: "Singapore" },
    { value: "Asia/Hong_Kong", name: "Hong Kong Time", cities: "Hong Kong" },
    { value: "Asia/Taipei", name: "Taiwan Time", cities: "Taipei" },
    { value: "Asia/Kuala_Lumpur", name: "Malaysia Time", cities: "Kuala Lumpur" },
    { value: "Asia/Manila", name: "Philippines Time", cities: "Manila" },
    { value: "Australia/Perth", name: "Western Australia Time", cities: "Perth" },
    { value: "Asia/Tokyo", name: "Japan Time", cities: "Tokyo, Osaka" },
    { value: "Asia/Seoul", name: "Korea Time", cities: "Seoul" },
    { value: "Australia/Darwin", name: "Central Australia Time", cities: "Darwin" },
    { value: "Australia/Adelaide", name: "Central Australia Time", cities: "Adelaide" },
    { value: "Australia/Sydney", name: "Eastern Australia Time", cities: "Sydney, Melbourne" },
    { value: "Australia/Brisbane", name: "Eastern Australia Time", cities: "Brisbane" },
    { value: "Pacific/Port_Moresby", name: "Papua New Guinea Time", cities: "Port Moresby" },
    { value: "Pacific/Guadalcanal", name: "Solomon Islands Time", cities: "Honiara" },
    { value: "Pacific/Auckland", name: "New Zealand Time", cities: "Auckland, Wellington" },
    { value: "Pacific/Fiji", name: "Fiji Time", cities: "Suva" },
    { value: "Pacific/Tongatapu", name: "Tonga Time", cities: "Nukuʻalofa" }
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

function getTimeZoneOffsetMinutes(timeZone: string, date: Date): number {
    if (timeZone === "UTC") {
        return 0;
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    });

    const parts = formatter.formatToParts(date);
    const values: Record<string, string> = {};

    parts.forEach(function (part) {
        if (part.type !== "literal") {
            values[part.type] = part.value;
        }
    });

    const asUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute),
        Number(values.second)
    );

    return Math.round((asUtc - date.getTime()) / 60000);
}

function formatOffset(minutes: number): string {
    const sign = minutes < 0 ? "-" : "+";
    const absoluteMinutes = Math.abs(minutes);
    const hours = Math.floor(absoluteMinutes / 60);
    const remainingMinutes = absoluteMinutes % 60;

    return `UTC${sign}${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}`;
}

function buildTimeZoneOption(definition: TimeZoneDefinition, date: Date): TimeZoneOption & { offsetMinutes: number } {
    const offsetMinutes = getTimeZoneOffsetMinutes(definition.value, date);

    return {
        value: definition.value,
        label: `${formatOffset(offsetMinutes)} — ${definition.name} — ${definition.cities}`,
        group: "Popular worldwide timezones",
        offsetMinutes: offsetMinutes
    };
}

export function getTimeZoneOptions(): TimeZoneOption[] {
    const today = new Date();

    return timeZoneDefinitions
        .map(function (definition) {
            return buildTimeZoneOption(definition, today);
        })
        .sort(function (left, right) {
            if (left.offsetMinutes !== right.offsetMinutes) {
                return left.offsetMinutes - right.offsetMinutes;
            }

            return left.label.localeCompare(right.label);
        })
        .map(function (option) {
            return {
                value: option.value,
                label: option.label,
                group: option.group
            };
        });
}

export function getTimeZoneGroups(): TimeZoneGroup[] {
    return [
        {
            label: "Popular worldwide timezones",
            options: getTimeZoneOptions()
        }
    ];
}

export function getTimeZoneLabel(timeZone: string | null | undefined): string {
    const normalizedTimeZone = normalizeTimeZone(timeZone);
    const match = timeZoneDefinitions.find(function (definition) {
        return definition.value === normalizedTimeZone;
    });

    if (match) {
        const option = buildTimeZoneOption(match, new Date());
        return `${option.label} (${option.value})`;
    }

    return normalizedTimeZone;
}
