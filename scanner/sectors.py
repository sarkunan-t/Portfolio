"""Broad sector from the SEC SIC code (free, on every EDGAR filer)."""

RANGES = [
    ((3674, 3674), "Semiconductors"),
    ((7370, 7370), "Internet & Software"),
    ((7371, 7379), "Software & IT"),
    ((3570, 3579), "Hardware"),
    ((3600, 3699), "Hardware"),
    ((3576, 3576), "Hardware"),
    ((4800, 4899), "Communications"),
    ((2833, 2836), "Biotech & Pharma"),
    ((8731, 8731), "Biotech & Pharma"),
    ((3826, 3826), "Medical devices"),
    ((3840, 3851), "Medical devices"),
    ((8000, 8099), "Healthcare services"),
    ((5122, 5122), "Healthcare services"),
    ((6000, 6099), "Banks"),
    ((6100, 6299), "Financials"),
    ((6300, 6499), "Insurance"),
    ((6500, 6599), "Real estate"),
    ((6798, 6798), "Real estate"),
    ((6700, 6799), "Financials"),
    ((1300, 1399), "Energy"),
    ((2900, 2999), "Energy"),
    ((4900, 4999), "Utilities & Energy"),
    ((1000, 1499), "Materials"),
    ((2600, 2699), "Materials"),
    ((2800, 2829), "Materials"),
    ((2840, 2899), "Materials"),
    ((3300, 3399), "Materials"),
    ((3710, 3716), "Autos & EV"),
    ((3720, 3729), "Aerospace & Defence"),
    ((3760, 3769), "Aerospace & Defence"),
    ((3400, 3569), "Industrials"),
    ((3580, 3599), "Industrials"),
    ((3700, 3799), "Industrials"),
    ((3800, 3899), "Industrials"),
    ((1500, 1799), "Industrials"),
    ((4000, 4799), "Transport"),
    ((8700, 8799), "Business services"),
    ((7380, 7399), "Business services"),
    ((5000, 5199), "Consumer"),
    ((5200, 5999), "Consumer"),
    ((2000, 2399), "Consumer"),
    ((2500, 2599), "Consumer"),
    ((3000, 3299), "Consumer"),
    ((7000, 7369), "Consumer"),
    ((7800, 7999), "Consumer"),
    ((8200, 8299), "Consumer"),
    ((100, 999), "Consumer"),
]


def sector(sic) -> str:
    try:
        n = int(str(sic).strip())
    except (TypeError, ValueError):
        return "Other"
    for (a, b), name in RANGES:
        if a <= n <= b:
            return name
    return "Other"
