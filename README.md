# Albedo & Water Lab

An open, browser-based lab for exploring surface reflectivity and solar energy, inspired by María Gloria Romero Bevilacqua's work on canopy–soil albedo and evapotranspiration.

## Use the lab

- **Explore:** select a location and UTC date, compare constant albedo with an adjustable exponential curve, inspect hourly absorbed shortwave radiation and daily energy, and export the experiment as CSV.
- **NASA sunlight:** load historical hourly surface shortwave radiation from the public NASA POWER API. No key or server is required. Requests send only coordinates and date to NASA. If the service is unavailable, the illustrative mode stays usable.
- **Measure & fit:** upload or paste a CSV, fit a model to the earliest 75% of usable observations, and evaluate the final 25% against a constant fitted on the training data. Export coefficients, observations, and validation metrics as JSON, or apply the curve in Explore.
- **Research:** inspect methods, limitations, and links to original sources.

CSVs are processed locally in the browser; the application does not upload or persist measurements. The sample is deterministic synthetic data, explicitly identified in the UI and exported fit metadata. Google Fonts are requested for typography; system fonts provide a fallback.

## Run locally

Requires Node.js 22.12+ (or a newer supported Node release).

```sh
npm ci
npm test
npm run dev
```

`npm run build` generates a static site in `dist/`. `npm run preview` serves that build. Vercel detects Vite and uses the included `vercel.json`; there are no environment variables, accounts, backend services, or database migrations to configure.

## Measurement format

```csv
timestamp_utc,incoming_w_m2,reflected_w_m2
2025-01-15T16:00:00Z,800,160
```

Provide at least 12 usable, simultaneous incoming/reflected measurements. Timestamps must use ISO UTC with `Z`. Use the measurement site's coordinates in Explore. Invalid timestamps, nonnumeric values, duplicate times, and malformed rows are rejected. Rows with incoming radiation below 50 W/m², solar elevation outside 5–85°, or albedo outside the open interval (0, 1) are excluded. A fit requires at least 2° standard deviation in training solar elevations. Uploaded files are limited to 2 MB and analysis to 20,000 rows.

Use a consistent canopy stage. Chronological holdout reduces temporal leakage but does not establish transferability to different crops, sites, seasons, or instruments. Validation errors are reported in original albedo units and reflected flux W/m². The constant comparator is the mean training albedo. No coefficients are trained on validation observations. The fitted curve must remain within (0, 1) throughout solar elevations 0–90°; this is a physical check, not validation outside the measurement domain.

## Scientific scope

The implemented candidate is **independently chosen**:

```
alpha(theta) = a * exp(b * theta)
```

Here `theta` is solar elevation in degrees, `a` is the horizon intercept, and `b` has units degree⁻¹. We fit `log(alpha)` using ordinary least squares. This minimizes log-space squared error; reported holdout errors are on the original scale. Default coefficients `a = 0.34` and `b = -0.009` are illustrative, not Romero's published values. They are not crop-specific parameters.

Absorbed shortwave flux is `(1 - alpha) * incoming`. One-hour mean W/m² is integrated using `3600 / 1e6` to MJ/m². Effective daily albedo is incoming-energy weighted. Day bins are explicitly UTC, not civil or local solar time. Solar elevation follows NOAA's fractional-year declination and equation-of-time approximation (not a precision ephemeris).

Illustrative incoming sunlight uses an extraterrestrial solar constant of 1361 W/m², seasonal correction, and a simple transmission factor `0.65 + 0.15 sin(elevation)`. Twelve five-minute samples are averaged in each hour. This atmosphere is an educational approximation, not a calibrated radiation model. The within-hour illustrative sunlight weights also approximate hourly model albedo when using NASA radiation. NASA `Wh/m²` over an hour is numerically equivalent to mean `W/m²`; response units and all 24 bins are checked, with missing data rejected.

**Absorbed shortwave is not net radiation or evapotranspiration.** Longwave fluxes are not included. The lab does not compute actual ET or prescribe irrigation. FAO's fixed 0.23 reference-grass albedo remains part of that reference definition; this app does not replace it with a crop-surface value or claim a modified reference ET.

Romero's 2009 abstract describes an exponential albedo model with two empirical coefficients and solar elevation but does not supply its equation, coefficients, calibration domain, or numerical errors. The Spanish and English abstracts describe different crop details. Her full 2004 dissertation was requested for digitization from USU. Until inspected, neither the exact model nor a connection between specific thesis chapters and the abstract can be claimed as reproduced.

## Sources and attribution

1. Romero Bevilacqua, M. G. (2009). *Cálculo de las necesidades de agua de los cultivos en línea por medio de la estimación de la radiación neta*. Revista Facultad Nacional de Agronomía, 62, Supplement 2, p. 95. [Abstract PDF, page 4](https://distantreader.org/stacks/journals/refame/refame-38057.pdf#page=4).
2. Romero, M. G. (2004). *Daily Evapotranspiration Estimation by Means of Evaporative Fraction and Reference Evapotranspiration Fraction*. PhD dissertation, Utah State University. Title also cited with “Reference ET Fraction.”
3. Allen, R. G., Tasumi, M., & Trezza, R. (2007). *Satellite-Based Energy Balance for Mapping Evapotranspiration with Internalized Calibration (METRIC)—Model*. Journal of Irrigation and Drainage Engineering, 133(4), 380–394. [Paper](https://www.dnrc.mt.gov/Water-Resources/Compacts/Satellite-Based_Energy_Balance_for_Mapping_Evapotr.pdf). Credits Romero's work on relative constancy of reference-ET fractions; that is not evidence validating this application's independent albedo curve.
4. [FAO-56: radiation and meteorological data](https://www.fao.org/4/X0490E/x0490e07.htm).
5. [NOAA solar calculation equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF).
6. [NASA POWER hourly API](https://power.larc.nasa.gov/docs/services/api/temporal/hourly/).

## Next scientific milestone

Inspect the digitized dissertation; identify the original equation and validation domain; reproduce a published example; compare on independent observations before presenting any model as a reproduction or operational agricultural tool.

## License

Application code is [MIT licensed](LICENSE). Linked scientific publications retain their authors' and publishers' rights. No thesis or article full text is bundled or relicensed.
