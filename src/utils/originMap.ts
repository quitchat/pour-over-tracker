type CountryCoordinate = {
    canonicalName: string;
    code: string;
    aliases: string[];
    lat: number;
    lng: number;
    regions: RegionCoordinate[];
};

type RegionCoordinate = {
    name: string;
    aliases: string[];
    lat: number;
    lng: number;
};

export type OriginMapPoint = {
    country: string;
    countryCode: string;
    region: string | null;
    lat: number;
    lng: number;
    matchLevel: "REGION" | "COUNTRY";
};

const originCoordinateData: CountryCoordinate[] = [
    {
        canonicalName: "Bolivia",
        code: "bo",
        aliases: ["bolivia"],
        lat: -16.2902,
        lng: -63.5887,
        regions: [
            { name: "Caranavi", aliases: ["caranavi"], lat: -15.8167, lng: -67.55 }
        ]
    },
    {
        canonicalName: "Brazil",
        code: "br",
        aliases: ["brazil", "brasil"],
        lat: -14.235,
        lng: -51.9253,
        regions: [
            { name: "Cerrado Mineiro", aliases: ["cerrado", "cerrado mineiro"], lat: -18.75, lng: -47.85 },
            { name: "Minas Gerais", aliases: ["minas", "minas gerais", "mantiqueira"], lat: -18.5122, lng: -44.555 },
            { name: "Mogiana", aliases: ["mogiana"], lat: -21.1833, lng: -47.8 }
        ]
    },
    {
        canonicalName: "Burundi",
        code: "bi",
        aliases: ["burundi"],
        lat: -3.3731,
        lng: 29.9189,
        regions: [
            { name: "Kayanza", aliases: ["kayanza"], lat: -2.9221, lng: 29.6293 },
            { name: "Ngozi", aliases: ["ngozi"], lat: -2.9081, lng: 29.8269 }
        ]
    },
    {
        canonicalName: "China",
        code: "cn",
        aliases: ["china"],
        lat: 35.8617,
        lng: 104.1954,
        regions: [
            { name: "Yunnan", aliases: ["yunnan"], lat: 24.8801, lng: 102.8329 }
        ]
    },
    {
        canonicalName: "Colombia",
        code: "co",
        aliases: ["colombia"],
        lat: 4.5709,
        lng: -74.2973,
        regions: [
            { name: "Antioquia", aliases: ["antioquia"], lat: 6.2442, lng: -75.5812 },
            { name: "Cauca", aliases: ["cauca"], lat: 2.7049, lng: -76.826 },
            { name: "Huila", aliases: ["huila"], lat: 2.5359, lng: -75.5277 },
            { name: "Nariño", aliases: ["narino", "nariño"], lat: 1.2892, lng: -77.3579 },
            { name: "Tolima", aliases: ["tolima"], lat: 4.0925, lng: -75.1545 }
        ]
    },
    {
        canonicalName: "Costa Rica",
        code: "cr",
        aliases: ["costa rica"],
        lat: 9.7489,
        lng: -83.7534,
        regions: [
            { name: "Tarrazu", aliases: ["tarrazu", "tarrazú", "los santos"], lat: 9.6597, lng: -84.0219 },
            { name: "West Valley", aliases: ["west valley", "valle occidental"], lat: 10.0333, lng: -84.4333 }
        ]
    },
    {
        canonicalName: "Democratic Republic of the Congo",
        code: "cd",
        aliases: ["democratic republic of the congo", "dr congo", "drc", "congo"],
        lat: -4.0383,
        lng: 21.7587,
        regions: [
            { name: "Kivu", aliases: ["kivu", "north kivu", "south kivu"], lat: -1.95, lng: 29.15 }
        ]
    },
    {
        canonicalName: "Ecuador",
        code: "ec",
        aliases: ["ecuador"],
        lat: -1.8312,
        lng: -78.1834,
        regions: [
            { name: "Loja", aliases: ["loja"], lat: -3.9931, lng: -79.2042 }
        ]
    },
    {
        canonicalName: "El Salvador",
        code: "sv",
        aliases: ["el salvador", "salvador"],
        lat: 13.7942,
        lng: -88.8965,
        regions: [
            { name: "Apaneca-Ilamatepec", aliases: ["apaneca", "ilamatepec", "apaneca-ilamatepec"], lat: 13.8667, lng: -89.8 }
        ]
    },
    {
        canonicalName: "Ethiopia",
        code: "et",
        aliases: ["ethiopia"],
        lat: 9.145,
        lng: 40.4897,
        regions: [
            { name: "Guji", aliases: ["guji", "uraga", "shakiso", "hambela"], lat: 5.95, lng: 39.25 },
            { name: "Jimma", aliases: ["jimma", "limu", "limmu", "kaffa", "keffa"], lat: 7.6667, lng: 36.8333 },
            { name: "Sidama", aliases: ["sidama", "sidamo", "aricha"], lat: 6.75, lng: 38.4167 },
            { name: "Yirgacheffe", aliases: ["yirgacheffe", "yirgachefe", "irgachefe", "gedeb", "kochere", "chelelektu"], lat: 6.1625, lng: 38.2056 }
        ]
    },
    {
        canonicalName: "Guatemala",
        code: "gt",
        aliases: ["guatemala"],
        lat: 15.7835,
        lng: -90.2308,
        regions: [
            { name: "Antigua", aliases: ["antigua"], lat: 14.5586, lng: -90.7339 },
            { name: "Atitlan", aliases: ["atitlan", "atitlán"], lat: 14.6907, lng: -91.2025 },
            { name: "Coban", aliases: ["coban", "cobán"], lat: 15.4708, lng: -90.3708 },
            { name: "Huehuetenango", aliases: ["huehuetenango", "huehue"], lat: 15.3192, lng: -91.4724 }
        ]
    },
    {
        canonicalName: "Honduras",
        code: "hn",
        aliases: ["honduras"],
        lat: 15.2,
        lng: -86.2419,
        regions: [
            { name: "Comayagua", aliases: ["comayagua"], lat: 14.4514, lng: -87.6374 },
            { name: "Marcala", aliases: ["marcala", "la paz"], lat: 14.1487, lng: -88.0344 }
        ]
    },
    {
        canonicalName: "India",
        code: "in",
        aliases: ["india"],
        lat: 20.5937,
        lng: 78.9629,
        regions: [
            { name: "Chikmagalur", aliases: ["chikmagalur", "chikkamagaluru"], lat: 13.3161, lng: 75.772 }
        ]
    },
    {
        canonicalName: "Indonesia",
        code: "id",
        aliases: ["indonesia"],
        lat: -0.7893,
        lng: 113.9213,
        regions: [
            { name: "Aceh", aliases: ["aceh", "gayo"], lat: 4.6951, lng: 96.7494 },
            { name: "Bali", aliases: ["bali", "kintamani"], lat: -8.3405, lng: 115.092 },
            { name: "Java", aliases: ["java"], lat: -7.6145, lng: 110.7122 },
            { name: "Sulawesi", aliases: ["sulawesi", "toraja"], lat: -2.5489, lng: 120.666 },
            { name: "Sumatra", aliases: ["sumatra", "lintong", "mandheling"], lat: 0.5897, lng: 101.3431 }
        ]
    },
    {
        canonicalName: "Jamaica",
        code: "jm",
        aliases: ["jamaica"],
        lat: 18.1096,
        lng: -77.2975,
        regions: [
            { name: "Blue Mountain", aliases: ["blue mountain", "jamaica blue mountain"], lat: 18.0776, lng: -76.5786 }
        ]
    },
    {
        canonicalName: "Kenya",
        code: "ke",
        aliases: ["kenya"],
        lat: -0.0236,
        lng: 37.9062,
        regions: [
            { name: "Embu", aliases: ["embu"], lat: -0.5399, lng: 37.4574 },
            { name: "Kirinyaga", aliases: ["kirinyaga"], lat: -0.4989, lng: 37.2803 },
            { name: "Nyeri", aliases: ["nyeri"], lat: -0.4167, lng: 36.95 }
        ]
    },
    {
        canonicalName: "Mexico",
        code: "mx",
        aliases: ["mexico", "méxico"],
        lat: 23.6345,
        lng: -102.5528,
        regions: [
            { name: "Chiapas", aliases: ["chiapas"], lat: 16.7569, lng: -93.1292 },
            { name: "Oaxaca", aliases: ["oaxaca"], lat: 17.0732, lng: -96.7266 },
            { name: "Veracruz", aliases: ["veracruz"], lat: 19.1738, lng: -96.1342 }
        ]
    },
    {
        canonicalName: "Nicaragua",
        code: "ni",
        aliases: ["nicaragua"],
        lat: 12.8654,
        lng: -85.2072,
        regions: [
            { name: "Jinotega", aliases: ["jinotega"], lat: 13.0917, lng: -86.0018 },
            { name: "Matagalpa", aliases: ["matagalpa"], lat: 12.9256, lng: -85.9175 }
        ]
    },
    {
        canonicalName: "Panama",
        code: "pa",
        aliases: ["panama", "panamá"],
        lat: 8.538,
        lng: -80.7821,
        regions: [
            { name: "Boquete", aliases: ["boquete", "chiriqui", "chiriquí"], lat: 8.7802, lng: -82.4414 }
        ]
    },
    {
        canonicalName: "Papua New Guinea",
        code: "pg",
        aliases: ["papua new guinea", "png", "papua"],
        lat: -6.315,
        lng: 143.9555,
        regions: [
            { name: "Eastern Highlands", aliases: ["eastern highlands"], lat: -6.5862, lng: 145.6689 },
            { name: "Wahgi Valley", aliases: ["wahgi", "waghi"], lat: -5.8333, lng: 144.75 }
        ]
    },
    {
        canonicalName: "Peru",
        code: "pe",
        aliases: ["peru", "perú"],
        lat: -9.19,
        lng: -75.0152,
        regions: [
            { name: "Cajamarca", aliases: ["cajamarca"], lat: -7.1617, lng: -78.5128 },
            { name: "Cusco", aliases: ["cusco", "cuzco"], lat: -13.5319, lng: -71.9675 }
        ]
    },
    {
        canonicalName: "Rwanda",
        code: "rw",
        aliases: ["rwanda"],
        lat: -1.9403,
        lng: 29.8739,
        regions: [
            { name: "Nyamasheke", aliases: ["nyamasheke"], lat: -2.3267, lng: 29.1478 }
        ]
    },
    {
        canonicalName: "Tanzania",
        code: "tz",
        aliases: ["tanzania"],
        lat: -6.369,
        lng: 34.8888,
        regions: [
            { name: "Kilimanjaro", aliases: ["kilimanjaro"], lat: -3.0674, lng: 37.3556 },
            { name: "Mbeya", aliases: ["mbeya"], lat: -8.9094, lng: 33.4608 }
        ]
    },
    {
        canonicalName: "Thailand",
        code: "th",
        aliases: ["thailand"],
        lat: 15.87,
        lng: 100.9925,
        regions: [
            { name: "Chiang Mai", aliases: ["chiang mai"], lat: 18.7883, lng: 98.9853 }
        ]
    },
    {
        canonicalName: "Uganda",
        code: "ug",
        aliases: ["uganda"],
        lat: 1.3733,
        lng: 32.2903,
        regions: [
            { name: "Mount Elgon", aliases: ["mount elgon", "elgon"], lat: 1.1325, lng: 34.55 }
        ]
    },
    {
        canonicalName: "United States",
        code: "us",
        aliases: ["united states", "usa", "us", "hawaii"],
        lat: 37.0902,
        lng: -95.7129,
        regions: [
            { name: "Kona", aliases: ["kona", "hawaii", "hawai'i", "big island"], lat: 19.6406, lng: -155.9969 }
        ]
    },
    {
        canonicalName: "Vietnam",
        code: "vn",
        aliases: ["vietnam", "viet nam"],
        lat: 14.0583,
        lng: 108.2772,
        regions: [
            { name: "Da Lat", aliases: ["da lat", "dalat", "lam dong", "lâm đồng"], lat: 11.9404, lng: 108.4583 }
        ]
    },
    {
        canonicalName: "Yemen",
        code: "ye",
        aliases: ["yemen"],
        lat: 15.5527,
        lng: 48.5164,
        regions: [
            { name: "Haraaz", aliases: ["haraaz", "haraz"], lat: 15.1167, lng: 43.7333 }
        ]
    }
];

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[()\[\]{}]/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function splitCountryValues(country: string | null | undefined): string[] {
    if (!country) {
        return [];
    }

    return country
        .split(/[;,]/)
        .map(function (item) {
            return item.trim();
        })
        .filter(function (item) {
            return item.length > 0;
        });
}

function containsAlias(value: string, alias: string): boolean {
    const normalizedValue = normalizeText(value);
    const normalizedAlias = normalizeText(alias);

    if (!normalizedValue || !normalizedAlias) {
        return false;
    }

    const pattern = new RegExp(`(^|\\s)${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");

    return pattern.test(normalizedValue);
}

function findCountry(value: string): CountryCoordinate | null {
    for (const country of originCoordinateData) {
        for (const alias of country.aliases) {
            if (containsAlias(value, alias)) {
                return country;
            }
        }
    }

    return null;
}

function findRegion(country: CountryCoordinate, region: string | null | undefined): RegionCoordinate | null {
    if (!region) {
        return null;
    }

    for (const regionCoordinate of country.regions) {
        for (const alias of regionCoordinate.aliases) {
            if (containsAlias(region, alias)) {
                return regionCoordinate;
            }
        }
    }

    return null;
}

export function resolveOriginMapPoints(country: string | null | undefined, region: string | null | undefined): OriginMapPoint[] {
    const countryParts = splitCountryValues(country);
    const valuesToMatch = countryParts.length > 0 ? countryParts : [];
    const points: OriginMapPoint[] = [];
    const seenKeys = new Set<string>();

    for (const countryPart of valuesToMatch) {
        const countryMatch = findCountry(countryPart);

        if (!countryMatch) {
            continue;
        }

        const regionMatch = findRegion(countryMatch, region);
        const point: OriginMapPoint = regionMatch ? {
            country: countryMatch.canonicalName,
            countryCode: countryMatch.code,
            region: regionMatch.name,
            lat: regionMatch.lat,
            lng: regionMatch.lng,
            matchLevel: "REGION"
        } : {
            country: countryMatch.canonicalName,
            countryCode: countryMatch.code,
            region: null,
            lat: countryMatch.lat,
            lng: countryMatch.lng,
            matchLevel: "COUNTRY"
        };

        const key = `${point.countryCode}|${point.region || "country"}`;

        if (!seenKeys.has(key)) {
            points.push(point);
            seenKeys.add(key);
        }
    }

    return points;
}
