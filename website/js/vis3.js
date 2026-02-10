const SVG_W = 980;
const SVG_H = 580;
const margin = { top: 34, right: 26, bottom: 92, left: 76 };
const innerW = SVG_W - margin.left - margin.right;
const innerH = SVG_H - margin.top - margin.bottom;

const svg = d3.select("#bubble-svg")
    .attr("viewBox", `0 0 ${SVG_W} ${SVG_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

const plotG = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#bubble-tooltip");
const yearSlider = d3.select("#year-slider");
const yearValue = d3.select("#year-value");
const speedSlider = d3.select("#speed-slider");
const speedValue = d3.select("#speed-value");
const playBtn = d3.select("#play-button");
const statusLine = d3.select("#vis3-status");

const regionFilter = d3.select("#region-filter");
const countryFilter = d3.select("#country-filter");
const countrySearch = d3.select("#country-search");
const selectAllBtn = d3.select("#select-all");
const clearAllBtn = d3.select("#clear-all");

const regionPalette = [
    "#2f6978", "#cf5a33", "#2f9e44", "#7a3e9d", "#1f77b4",
    "#c47f00", "#6b7280", "#b03a5b", "#4b5d67", "#3d8361"
];
const color = d3.scaleOrdinal(regionPalette);
const BASE_YEAR_PLAYBACK_MS = 1000;
const MIN_YEAR_PLAYBACK_MS = 120;

let allRows = [];
let years = [];
let regions = [];
let countries = [];
let selectedRegions = new Set();
let selectedCountries = new Set();
let currentYear = null;
let playTimer = null;
let isPlaying = false;

const xAxisG = plotG.append("g").attr("class", "x-axis").attr("transform", `translate(0,${innerH})`);
const yAxisG = plotG.append("g").attr("class", "y-axis");
const xGridG = plotG.append("g").attr("class", "x-grid").attr("transform", `translate(0,${innerH})`);
const yGridG = plotG.append("g").attr("class", "y-grid");
const bubbleG = plotG.append("g");

plotG.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH + 44)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .style("font-weight", "700")
    .style("fill", "#2a4451")
    .text("CO2 Emissions (million tonnes)");

plotG.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -innerH / 2)
    .attr("y", -52)
    .attr("text-anchor", "middle")
    .style("font-size", "13px")
    .style("font-weight", "700")
    .style("fill", "#2a4451")
    .text("Temperature Change from CO2 (°C)");

const yearWatermark = plotG.append("text")
    .attr("x", innerW / 2)
    .attr("y", innerH / 2 + 20)
    .attr("text-anchor", "middle")
    .style("font-family", "Space Grotesk, sans-serif")
    .style("font-size", "120px")
    .style("font-weight", "700")
    .style("fill", "#9fb3bf")
    .style("opacity", 0.17);

function fmtInt(n) {
    return d3.format(",")(Math.round(n));
}

function fmtPop(n) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    return fmtInt(n);
}

function showTooltip(event, d) {
    const panel = document.querySelector(".chart-panel");
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    tooltip
        .style("opacity", 1)
        .style("left", `${event.clientX - r.left}px`)
        .style("top", `${event.clientY - r.top}px`)
        .html(
            `<strong>${d.Country}</strong><br>` +
            `Year: ${d.Year}<br>` +
            `Region: ${d.Region}<br>` +
            `CO2: ${fmtInt(d.co2)} Mt<br>` +
            `Temp change: ${d.tempChange.toFixed(3)}°C<br>` +
            `Population: ${fmtPop(d.population)}`
        );
}

function hideTooltip() {
    tooltip.style("opacity", 0);
}

function getYearPlaybackSpeedFactor() {
    const speed = +speedSlider.property("value");
    return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function getYearPlaybackIntervalMs() {
    return Math.max(
        MIN_YEAR_PLAYBACK_MS,
        Math.round(BASE_YEAR_PLAYBACK_MS / getYearPlaybackSpeedFactor())
    );
}

function getFilteredBaseRows() {
    return allRows.filter(d => selectedCountries.has(d.Country) || selectedRegions.has(d.Region));
}

function updateStatus() {
    const base = getFilteredBaseRows();
    const inYear = base.filter(d => d.Year === currentYear);
    statusLine.text(
        `Year ${currentYear}: ${inYear.length} countries shown; filters include ${selectedRegions.size} region(s) and ${selectedCountries.size} country selection(s).`
    );
}

function renderRegionFilter() {
    regionFilter.html("");
    regions.forEach(region => {
        const row = regionFilter.append("label");
        row.html(`<input type="checkbox" value="${region}" checked> ${region}`);
    });
    regionFilter.selectAll("input").on("change", function () {
        const region = this.value;
        if (this.checked) selectedRegions.add(region);
        else selectedRegions.delete(region);
        renderChart(currentYear);
    });
}

function renderCountryFilter() {
    countryFilter.html("");
    countries.forEach(country => {
        const row = countryFilter.append("label");
        row.attr("data-country", country.toLowerCase());
        row.html(`<input type="checkbox" value="${country}" checked> ${country}`);
    });
    countryFilter.selectAll("input").on("change", function () {
        const country = this.value;
        if (this.checked) selectedCountries.add(country);
        else selectedCountries.delete(country);
        renderChart(currentYear);
    });
}

function attachFilterControls() {
    countrySearch.on("input", function () {
        const q = this.value.trim().toLowerCase();
        countryFilter.selectAll("label")
            .style("display", function () {
                const key = d3.select(this).attr("data-country");
                if (!q || key.includes(q)) return "flex";
                return "none";
            });
    });

    selectAllBtn.on("click", function () {
        selectedRegions = new Set(regions);
        selectedCountries = new Set(countries);
        regionFilter.selectAll("input").property("checked", true);
        countryFilter.selectAll("input").property("checked", true);
        renderChart(currentYear);
    });

    clearAllBtn.on("click", function () {
        selectedRegions.clear();
        selectedCountries.clear();
        regionFilter.selectAll("input").property("checked", false);
        countryFilter.selectAll("input").property("checked", false);
        renderChart(currentYear);
    });
}

function renderLegend(activeRegions) {
    svg.selectAll(".region-legend").remove();
    const legendColWidth = 146;
    const legendTopY = SVG_H - 8;

    const legend = svg.append("g")
        .attr("class", "region-legend")
        .attr("transform", `translate(${margin.left}, ${legendTopY})`);

    legend.append("text")
        .attr("x", 0)
        .attr("y", -16)
        .style("font-size", "12px")
        .style("font-weight", "700")
        .style("fill", "#2f4b58")
        .text("Region Colors");

    activeRegions.forEach((region, i) => {
        const g = legend.append("g").attr("transform", `translate(${i * legendColWidth}, 0)`);
        g.append("circle")
            .attr("r", 6)
            .attr("cx", 6)
            .attr("cy", 0)
            .attr("fill", color(region));
        g.append("text")
            .attr("x", 17)
            .attr("y", 4)
            .style("font-size", "11px")
            .style("fill", "#365260")
            .text(region);
    });
}

function renderChart(year) {
    currentYear = year;
    yearSlider.property("value", year);
    yearValue.text(year);

    const filteredBase = getFilteredBaseRows();
    const yearRows = filteredBase.filter(d => d.Year === year);

    const safeMaxX = Math.max(1, d3.max(yearRows, d => d.co2) || 1);
    const x = d3.scaleSymlog().constant(50).domain([0, safeMaxX * 1.05]).range([0, innerW]);
    const y = d3.scaleLinear()
        .domain(d3.extent(allRows, d => d.tempChange))
        .nice()
        .range([innerH, 0]);
    const size = d3.scaleSqrt()
        .domain(d3.extent(allRows, d => d.population))
        .range([3, 26]);

    xAxisG.transition().duration(350).call(d3.axisBottom(x).ticks(7).tickFormat(d3.format(".2s")));
    yAxisG.transition().duration(350).call(d3.axisLeft(y).ticks(7));
    xGridG.transition().duration(350).call(d3.axisBottom(x).ticks(7).tickSize(-innerH).tickFormat(""));
    yGridG.transition().duration(350).call(d3.axisLeft(y).ticks(7).tickSize(-innerW).tickFormat(""));

    bubbleG.selectAll("circle")
        .data(yearRows, d => d.Country)
        .join(
            enter => enter.append("circle")
                .attr("cx", d => x(d.co2))
                .attr("cy", d => y(d.tempChange))
                .attr("r", 0)
                .attr("fill", d => color(d.Region))
                .attr("fill-opacity", 0.66)
                .attr("stroke", "#1f3945")
                .attr("stroke-width", 0.7)
                .call(sel => sel.transition().duration(300).attr("r", d => size(d.population))),
            update => update.call(sel => sel.transition().duration(300)
                .attr("cx", d => x(d.co2))
                .attr("cy", d => y(d.tempChange))
                .attr("r", d => size(d.population))
                .attr("fill", d => color(d.Region))),
            exit => exit.call(sel => sel.transition().duration(220).attr("r", 0).remove())
        )
        .on("mousemove", showTooltip)
        .on("mouseleave", hideTooltip);

    yearWatermark.text(year);
    renderLegend([...new Set(yearRows.map(d => d.Region))]);
    updateStatus();
}

function stopPlay() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    isPlaying = false;
    playBtn.text("Play");
}

function startPlay() {
    stopPlay();
    isPlaying = true;
    playBtn.text("Pause");
    playTimer = setInterval(() => {
        const idx = years.indexOf(currentYear);
        const nextYear = years[(idx + 1) % years.length];
        renderChart(nextYear);
    }, getYearPlaybackIntervalMs());
}

function setSpeedLabel() {
    speedValue.text(`${getYearPlaybackSpeedFactor().toFixed(1)}x`);
}

async function init() {
    const [owidRows, regionRows] = await Promise.all([
        d3.csv("../data/co2/owid-co2-data.csv"),
        d3.csv("../data/preprocessed/vis3/country_to_region.csv")
    ]);

    const countryToRegion = new Map(regionRows.map(d => [d.Country, d.Region]));

    allRows = owidRows.map(d => {
        const iso = String(d.iso_code || "");
        return {
            Country: d.country,
            Year: +d.year,
            isoCode: iso,
            co2: +d.co2,
            tempChange: +d.temperature_change_from_co2,
            population: +d.population,
            Region: countryToRegion.get(d.country) || "Other"
        };
    }).filter(d => (
        d.isoCode.length === 3 &&
        Number.isFinite(d.Year) &&
        Number.isFinite(d.co2) &&
        Number.isFinite(d.tempChange) &&
        Number.isFinite(d.population) &&
        d.population > 0
    ));

    years = [...new Set(allRows.map(d => d.Year))].sort((a, b) => a - b);
    regions = [...new Set(allRows.map(d => d.Region))].sort((a, b) => a.localeCompare(b));
    countries = [...new Set(allRows.map(d => d.Country))].sort((a, b) => a.localeCompare(b));

    color.domain(regions);
    selectedRegions = new Set(regions);
    selectedCountries = new Set(countries);

    const initialYear = years.includes(1990) ? 1990 : years[0];
    yearSlider.attr("min", years[0]).attr("max", years[years.length - 1]).property("value", initialYear);
    yearValue.text(initialYear);
    setSpeedLabel();

    renderRegionFilter();
    renderCountryFilter();
    attachFilterControls();

    yearSlider.on("input", function () {
        renderChart(+this.value);
    });

    speedSlider.on("input", function () {
        setSpeedLabel();
        if (isPlaying) startPlay();
    });

    playBtn.on("click", function () {
        if (isPlaying) stopPlay();
        else startPlay();
    });

    renderChart(initialYear);
}

init().catch(err => {
    console.error("vis3 init failed:", err);
    statusLine.text("Failed to load vis3 data. Please check CSV files and local server.");
});
