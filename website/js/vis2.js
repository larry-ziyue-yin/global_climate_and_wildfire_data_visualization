const YEARS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const FIRE_TYPE_META = [
    { key: "0", label: "Vegetation fire", color: "#f05d23" },
    { key: "1", label: "Active volcano", color: "#7a3e9d" },
    { key: "2", label: "Static land source", color: "#2f9e44" },
    { key: "3", label: "Offshore", color: "#1f77b4" }
];
const FIRE_TYPE_LOOKUP = new Map(FIRE_TYPE_META.map(d => [d.key, d]));

const MAP_W = 640;
const MAP_H = 400;
const GLOBE_W = 640;
const GLOBE_H = 400;
const INITIAL_GLOBE_ROTATE = [15, -20, 0];
const BASE_YEAR_PLAYBACK_MS = 1000;
const MIN_YEAR_PLAYBACK_MS = 120;
const MONTH_LABELS = [
    "All months",
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const yearCache = new Map();
const sampleSummaryByYear = new Map();
const fullCountsByYear = new Map();

let worldFeatures = [];
let currentYear = YEARS[0];
let currentPoints = [];
let currentYearSamplePoints = [];
let isYearPlaying = false;
let yearPlaybackTimer = null;
let yearTickBusy = false;
let playbackFrames = [];
let playbackFrameIndex = -1;
let allYearsPreloaded = false;
let globeAutoRotate = true;
let globeRotationTimer = null;

const stage = d3.select("#vis2-stage");
const statusLine = d3.select("#status-line");
const tooltip = d3.select("#vis2-tooltip");
const timeScaleSelect = d3.select("#time-scale-select");
const yearSelect = d3.select("#year-select");
const monthSelect = d3.select("#month-select");
const daySelect = d3.select("#day-select");
const playYearsBtn = d3.select("#play-years");
const speedSlider = d3.select("#speed-slider");
const speedValue = d3.select("#speed-value");
const globeLonSlider = d3.select("#globe-lon-slider");
const globeLatSlider = d3.select("#globe-lat-slider");
const globeLonValue = d3.select("#globe-lon-value");
const globeLatValue = d3.select("#globe-lat-value");
const toggleRotationBtn = d3.select("#toggle-rotation");
const resetGlobeBtn = d3.select("#reset-globe");

const mapSvg = d3.select("#map-svg")
    .attr("viewBox", `0 0 ${MAP_W} ${MAP_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
const globeSvg = d3.select("#globe-svg")
    .attr("viewBox", `0 0 ${GLOBE_W} ${GLOBE_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

const mapProjection = d3.geoNaturalEarth1()
    .fitExtent([[14, 14], [MAP_W - 14, MAP_H - 14]], { type: "Sphere" });
const mapPath = d3.geoPath(mapProjection);

const globeProjection = d3.geoOrthographic()
    .scale(Math.min(GLOBE_W, GLOBE_H) * 0.43)
    .translate([GLOBE_W / 2, GLOBE_H / 2])
    .clipAngle(90)
    .rotate(INITIAL_GLOBE_ROTATE);
const globePath = d3.geoPath(globeProjection);
const graticule = d3.geoGraticule10();

const mapBase = mapSvg.append("g");
const mapPointsLayer = mapSvg.append("g");
const globeBase = globeSvg.append("g");
const globePointsLayer = globeSvg.append("g");

function formatInt(num) {
    return d3.format(",")(num);
}

function typeLabel(type) {
    return FIRE_TYPE_LOOKUP.get(String(type))?.label ?? `Type ${type}`;
}

function typeColor(type) {
    return FIRE_TYPE_LOOKUP.get(String(type))?.color ?? "#666";
}

function parseAcqDateParts(acqDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(acqDate || "").trim());
    if (!match) return { month: null, day: null };
    const month = +match[2];
    const day = +match[3];
    if (!Number.isFinite(month) || !Number.isFinite(day)) return { month: null, day: null };
    if (month < 1 || month > 12 || day < 1 || day > 31) return { month: null, day: null };
    return { month, day };
}

function getSelectedMonth() {
    return +monthSelect.property("value") || 0;
}

function getSelectedDay() {
    return +daySelect.property("value") || 0;
}

function getSelectedPlaybackScale() {
    const scale = String(timeScaleSelect.property("value") || "year");
    if (scale === "month" || scale === "day") return scale;
    return "year";
}

function isYearOnlyScope() {
    return getSelectedMonth() === 0 && getSelectedDay() === 0;
}

function formatPeriod(year) {
    const month = getSelectedMonth();
    const day = getSelectedDay();
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    if (!month) return `${year}`;
    if (!day) return `${year}-${mm}`;
    return `${year}-${mm}-${dd}`;
}

function filterPointsByDate(points) {
    const month = getSelectedMonth();
    const day = getSelectedDay();
    return points.filter(p => {
        if (month && p.month !== month) return false;
        if (day && p.day !== day) return false;
        return true;
    });
}

function buildSampleTypeCounts(points) {
    const byType = new Map();
    points.forEach(p => {
        byType.set(p.type, (byType.get(p.type) || 0) + 1);
    });
    return byType;
}

async function preloadAllYearPoints() {
    if (allYearsPreloaded) return;
    await Promise.all(YEARS.map(loadYearPoints));
    allYearsPreloaded = true;
}

function makeFrameKey(frame) {
    return `${frame.year}-${frame.month || 0}-${frame.day || 0}`;
}

function buildYearFrames() {
    const month = getSelectedMonth();
    const day = month ? getSelectedDay() : 0;
    return YEARS.map(year => ({ year, month, day }));
}

function buildMonthFrames() {
    const frameMap = new Map();
    YEARS.forEach(year => {
        const points = yearCache.get(year) || [];
        points.forEach(p => {
            if (!Number.isFinite(p.month)) return;
            const frame = { year, month: p.month, day: 0 };
            frameMap.set(makeFrameKey(frame), frame);
        });
    });
    return Array.from(frameMap.values()).sort((a, b) => (
        a.year - b.year || a.month - b.month
    ));
}

function buildDayFrames() {
    const frameMap = new Map();
    YEARS.forEach(year => {
        const points = yearCache.get(year) || [];
        points.forEach(p => {
            if (!Number.isFinite(p.month) || !Number.isFinite(p.day)) return;
            const frame = { year, month: p.month, day: p.day };
            frameMap.set(makeFrameKey(frame), frame);
        });
    });
    return Array.from(frameMap.values()).sort((a, b) => (
        a.year - b.year || a.month - b.month || a.day - b.day
    ));
}

function getCurrentFrameKey() {
    return makeFrameKey({
        year: currentYear,
        month: getSelectedMonth(),
        day: getSelectedDay()
    });
}

function buildPlaybackFramesByScale(scale) {
    if (scale === "year") return buildYearFrames();
    if (scale === "month") return buildMonthFrames();
    return buildDayFrames();
}

function populateMonthOptions() {
    monthSelect.selectAll("option")
        .data(MONTH_LABELS.map((label, idx) => ({ value: idx, label })))
        .enter()
        .append("option")
        .attr("value", d => d.value)
        .text(d => d.label);
    monthSelect.property("value", "0");
}

function populateDayOptions(month, year) {
    const selectedDay = getSelectedDay();
    const yearForMonth = Number.isFinite(year) ? year : currentYear;
    const maxDay = month ? new Date(yearForMonth, month, 0).getDate() : 31;
    const dayOptions = [{ value: 0, label: "All days" }];
    for (let d = 1; d <= maxDay; d += 1) {
        dayOptions.push({ value: d, label: String(d).padStart(2, "0") });
    }

    daySelect.selectAll("option").remove();
    daySelect.selectAll("option")
        .data(dayOptions)
        .enter()
        .append("option")
        .attr("value", d => d.value)
        .text(d => d.label);

    const clampedDay = Math.min(selectedDay, maxDay);
    daySelect.property("value", String(clampedDay));
}

function syncDayControlState() {
    const month = getSelectedMonth();
    if (month === 0) {
        daySelect.property("value", "0");
        daySelect.property("disabled", true);
    } else {
        daySelect.property("disabled", false);
    }
}

function clampLat(lat) {
    return Math.max(-85, Math.min(85, lat));
}

function normalizeLon(lon) {
    let v = lon;
    while (v > 180) v -= 360;
    while (v < -180) v += 360;
    return v;
}

function syncRotationControls() {
    const [lon, lat] = globeProjection.rotate();
    globeLonSlider.property("value", Math.round(normalizeLon(lon)));
    globeLatSlider.property("value", Math.round(clampLat(lat)));
    globeLonValue.text(`${Math.round(normalizeLon(lon))}°`);
    globeLatValue.text(`${Math.round(clampLat(lat))}°`);
}

function setGlobeRotation(lon, lat) {
    globeProjection.rotate([normalizeLon(lon), clampLat(lat), 0]);
    syncRotationControls();
    renderGlobe(currentPoints);
}

function disableAutoRotate() {
    globeAutoRotate = false;
    toggleRotationBtn.text("Resume Globe");
}

async function loadWorldFeatures() {
    try {
        const topo = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        worldFeatures = topojson.feature(topo, topo.objects.countries).features;
    } catch (err) {
        console.warn("World basemap unavailable:", err);
        worldFeatures = [];
        statusLine.text("Basemap failed to load from CDN. Showing points without country boundaries.");
    }
}

async function loadSampleSummary() {
    try {
        const rows = await d3.csv("../data/preprocessed/vis2/sample_summary.csv", d => ({
            year: +d.year,
            validRows: +d.valid_rows,
            sampleRows: +d.sample_rows
        }));
        rows.forEach(d => sampleSummaryByYear.set(d.year, d));
    } catch (err) {
        console.warn("sample_summary.csv missing:", err);
    }
}

async function loadFullCounts() {
    const rows = await d3.csv("../data/preprocessed/wildfire_count_by_year_type.csv", d => ({
        year: +(d.year ?? d.YEAR ?? ""),
        type: String(d.type ?? d.TYPE ?? ""),
        count: +(d.count ?? d.COUNT ?? 0)
    }));

    rows.forEach(d => {
        if (!Number.isFinite(d.year) || !d.type) return;
        if (!fullCountsByYear.has(d.year)) {
            fullCountsByYear.set(d.year, new Map());
        }
        fullCountsByYear.get(d.year).set(d.type, d.count);
    });
}

async function loadYearPoints(year) {
    if (yearCache.has(year)) return yearCache.get(year);
    const points = await d3.csv(`../data/preprocessed/vis2/fire_points_${year}.csv`, d => {
        const acqDate = d.acq_date || "";
        const dateParts = parseAcqDateParts(acqDate);
        return {
            year: +d.year,
            latitude: +d.latitude,
            longitude: +d.longitude,
            type: String(d.type),
            acqDate,
            month: dateParts.month,
            day: dateParts.day,
            frp: +d.frp,
            brightness: +d.brightness
        };
    });
    yearCache.set(year, points);
    return points;
}

function initLegend() {
    const legendRoot = d3.select("#fire-legend");
    legendRoot.html("");
    legendRoot.append("p").attr("class", "legend-title").text("Fire / Source Type");

    const items = legendRoot.append("div").attr("class", "legend-items")
        .selectAll(".legend-item")
        .data(FIRE_TYPE_META)
        .enter()
        .append("div")
        .attr("class", "legend-item");

    items.append("span")
        .attr("class", "legend-dot")
        .style("background", d => d.color);
    items.append("span").text(d => d.label);
}

function updateStats(year, points) {
    const statsRoot = d3.select("#type-stats");
    statsRoot.html("");
    if (isYearOnlyScope()) {
        statsRoot.append("p").attr("class", "stats-title").text(`Year ${year} detections by type`);
    } else {
        statsRoot.append("p").attr("class", "stats-title").text(`Sampled detections in ${formatPeriod(year)} by type`);
    }

    const byType = isYearOnlyScope() && fullCountsByYear.has(year)
        ? (fullCountsByYear.get(year) ?? new Map())
        : buildSampleTypeCounts(points);
    const grid = statsRoot.append("div").attr("class", "type-stat-grid");

    FIRE_TYPE_META.forEach(type => {
        const count = byType.get(type.key) ?? 0;
        const item = grid.append("div").attr("class", "type-stat");
        item.append("span").attr("class", "type-name").text(type.label);
        item.append("span").attr("class", "type-value").text(formatInt(count));
    });
}

function updateStatus(year, points, yearPoints) {
    const summary = sampleSummaryByYear.get(year);
    if (isYearOnlyScope()) {
        if (!summary) {
            statusLine.text(`Year ${year}: showing ${formatInt(points.length)} sampled points.`);
            return;
        }
        statusLine.text(
            `Year ${year}: showing ${formatInt(summary.sampleRows)} sampled points out of ${formatInt(summary.validRows)} detections.`
        );
        return;
    }

    if (!summary) {
        statusLine.text(
            `${formatPeriod(year)}: showing ${formatInt(points.length)} sampled points ` +
            `out of ${formatInt(yearPoints.length)} yearly sampled points.`
        );
        return;
    }

    statusLine.text(
        `${formatPeriod(year)}: showing ${formatInt(points.length)} sampled points ` +
        `(year sample: ${formatInt(yearPoints.length)} of ${formatInt(summary.validRows)} detections).`
    );
}

function buildMapBase() {
    mapBase.selectAll("*").remove();
    mapBase.append("path")
        .attr("class", "sphere-shape")
        .attr("d", mapPath({ type: "Sphere" }));

    mapBase.append("path")
        .attr("class", "graticule-shape")
        .attr("d", mapPath(graticule));

    mapBase.selectAll(".country-shape")
        .data(worldFeatures)
        .enter()
        .append("path")
        .attr("class", "country-shape")
        .attr("d", mapPath);
}

function buildGlobeBase() {
    globeBase.selectAll("*").remove();
    globeBase.append("path")
        .attr("class", "sphere-shape")
        .attr("d", globePath({ type: "Sphere" }));

    globeBase.append("path")
        .attr("class", "graticule-shape")
        .attr("d", globePath(graticule));

    globeBase.selectAll(".country-shape")
        .data(worldFeatures)
        .enter()
        .append("path")
        .attr("class", "country-shape")
        .attr("d", globePath);
}

function showTooltip(event, d) {
    const [x, y] = d3.pointer(event, stage.node());
    tooltip
        .style("opacity", 1)
        .style("left", `${x}px`)
        .style("top", `${y}px`)
        .html(
            `${d.acqDate || "Unknown date"}<br>` +
            `Type: ${typeLabel(d.type)}<br>` +
            `Lat/Lon: ${d.latitude.toFixed(2)}, ${d.longitude.toFixed(2)}`
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

function renderMap(points) {
    mapPointsLayer.selectAll("circle")
        .data(points)
        .join("circle")
        .attr("class", "point")
        .attr("r", 1.8)
        .attr("fill", d => typeColor(d.type))
        .attr("cx", d => mapProjection([d.longitude, d.latitude])?.[0] ?? -999)
        .attr("cy", d => mapProjection([d.longitude, d.latitude])?.[1] ?? -999)
        .on("mousemove", showTooltip)
        .on("mouseleave", hideTooltip);
}

function isVisibleOnGlobe(point) {
    const rotate = globeProjection.rotate();
    const center = [-rotate[0], -rotate[1]];
    return d3.geoDistance([point.longitude, point.latitude], center) <= Math.PI / 2;
}

function renderGlobe(points) {
    globeBase.selectAll(".country-shape").attr("d", globePath);
    globeBase.selectAll(".sphere-shape").attr("d", globePath({ type: "Sphere" }));
    globeBase.selectAll(".graticule-shape").attr("d", globePath(graticule));

    const visible = points.filter(isVisibleOnGlobe);
    globePointsLayer.selectAll("circle")
        .data(visible)
        .join("circle")
        .attr("class", "point")
        .attr("r", 1.8)
        .attr("fill", d => typeColor(d.type))
        .attr("cx", d => globeProjection([d.longitude, d.latitude])?.[0] ?? -999)
        .attr("cy", d => globeProjection([d.longitude, d.latitude])?.[1] ?? -999)
        .on("mousemove", showTooltip)
        .on("mouseleave", hideTooltip);
}

async function setTemporalSelection(target) {
    const targetYear = Number.isFinite(target?.year) ? +target.year : currentYear;
    let targetMonth = Number.isFinite(target?.month) ? +target.month : getSelectedMonth();
    let targetDay = Number.isFinite(target?.day) ? +target.day : getSelectedDay();

    targetMonth = Math.max(0, Math.min(12, targetMonth));
    if (targetMonth === 0) targetDay = 0;
    const maxDay = targetMonth ? new Date(targetYear, targetMonth, 0).getDate() : 31;
    targetDay = Math.max(0, Math.min(maxDay, targetDay));

    yearSelect.property("value", String(targetYear));
    monthSelect.property("value", String(targetMonth));
    populateDayOptions(targetMonth, targetYear);
    syncDayControlState();
    daySelect.property("value", String(targetDay));

    if (targetYear !== currentYear || !currentYearSamplePoints.length) {
        currentYearSamplePoints = await loadYearPoints(targetYear);
    }
    currentYear = targetYear;
    applyTemporalFilterAndRender();
}

async function updateYear(year) {
    await setTemporalSelection({
        year,
        month: getSelectedMonth(),
        day: getSelectedDay()
    });
}

function applyTemporalFilterAndRender() {
    currentPoints = filterPointsByDate(currentYearSamplePoints);
    updateStatus(currentYear, currentPoints, currentYearSamplePoints);
    updateStats(currentYear, currentPoints);
    renderMap(currentPoints);
    renderGlobe(currentPoints);
}

function stopYearPlayback() {
    if (yearPlaybackTimer) clearInterval(yearPlaybackTimer);
    yearPlaybackTimer = null;
    isYearPlaying = false;
    playYearsBtn.text("Play Timeline");
}

async function advancePlaybackFrame() {
    if (!playbackFrames.length || yearTickBusy) return;
    yearTickBusy = true;
    try {
        playbackFrameIndex = (playbackFrameIndex + 1) % playbackFrames.length;
        await setTemporalSelection(playbackFrames[playbackFrameIndex]);
    } finally {
        yearTickBusy = false;
    }
}

async function startYearPlayback() {
    stopYearPlayback();
    isYearPlaying = true;
    playYearsBtn.text("Pause Timeline");

    const scale = getSelectedPlaybackScale();
    if (scale !== "year") {
        await preloadAllYearPoints();
    }
    playbackFrames = buildPlaybackFramesByScale(scale);
    if (!playbackFrames.length) {
        stopYearPlayback();
        statusLine.text(`No sampled frames available for ${scale}-level playback.`);
        return;
    }

    const currentKey = getCurrentFrameKey();
    playbackFrameIndex = playbackFrames.findIndex(frame => makeFrameKey(frame) === currentKey);
    if (playbackFrameIndex < 0) playbackFrameIndex = -1;

    yearPlaybackTimer = setInterval(() => {
        void advancePlaybackFrame();
    }, getYearPlaybackIntervalMs());
}

function setSpeedLabel() {
    speedValue.text(`${getYearPlaybackSpeedFactor().toFixed(1)}x`);
}

function initControls() {
    yearSelect.selectAll("option")
        .data(YEARS)
        .enter()
        .append("option")
        .attr("value", d => d)
        .text(d => d);

    populateMonthOptions();
    populateDayOptions(0, currentYear);
    syncDayControlState();

    timeScaleSelect.on("change", function () {
        if (isYearPlaying) {
            void startYearPlayback();
        }
    });

    yearSelect.on("change", async function () {
        const year = +d3.select(this).property("value");
        await updateYear(year);
        if (isYearPlaying) {
            void startYearPlayback();
        }
    });

    monthSelect.on("change", async function () {
        const month = +d3.select(this).property("value");
        await setTemporalSelection({
            year: currentYear,
            month,
            day: getSelectedDay()
        });
        if (isYearPlaying) {
            void startYearPlayback();
        }
    });

    daySelect.on("change", async function () {
        await setTemporalSelection({
            year: currentYear,
            month: getSelectedMonth(),
            day: getSelectedDay()
        });
        if (isYearPlaying) {
            void startYearPlayback();
        }
    });

    playYearsBtn.on("click", function () {
        if (isYearPlaying) {
            stopYearPlayback();
        } else {
            void startYearPlayback();
        }
    });

    speedSlider.on("input", function () {
        setSpeedLabel();
        if (isYearPlaying) void startYearPlayback();
    });
    setSpeedLabel();

    globeLonSlider.on("input", function () {
        disableAutoRotate();
        setGlobeRotation(+globeLonSlider.property("value"), +globeLatSlider.property("value"));
    });
    globeLatSlider.on("input", function () {
        disableAutoRotate();
        setGlobeRotation(+globeLonSlider.property("value"), +globeLatSlider.property("value"));
    });
    syncRotationControls();

    toggleRotationBtn.on("click", function () {
        globeAutoRotate = !globeAutoRotate;
        toggleRotationBtn.text(globeAutoRotate ? "Pause Globe" : "Resume Globe");
    });

    resetGlobeBtn.on("click", function () {
        disableAutoRotate();
        setGlobeRotation(INITIAL_GLOBE_ROTATE[0], INITIAL_GLOBE_ROTATE[1]);
    });
}

function enableGlobeDrag() {
    let dragStartPointer = null;
    let dragStartRotate = null;

    globeSvg.call(
        d3.drag()
            .on("start", function (event) {
                disableAutoRotate();
                dragStartPointer = [event.x, event.y];
                dragStartRotate = globeProjection.rotate().slice();
            })
            .on("drag", function (event) {
                if (!dragStartPointer || !dragStartRotate) return;
                const dx = event.x - dragStartPointer[0];
                const dy = event.y - dragStartPointer[1];
                const sensitivity = 0.28;
                const newLon = dragStartRotate[0] + dx * sensitivity;
                const newLat = dragStartRotate[1] - dy * sensitivity;
                setGlobeRotation(newLon, newLat);
            })
    );
}

function startGlobeRotation() {
    if (globeRotationTimer) clearInterval(globeRotationTimer);
    globeRotationTimer = setInterval(() => {
        if (!globeAutoRotate) return;
        const r = globeProjection.rotate();
        setGlobeRotation(r[0] + 0.08, r[1]);
    }, 90);
}

async function init() {
    initLegend();
    initControls();

    await Promise.all([
        loadWorldFeatures(),
        loadSampleSummary(),
        loadFullCounts()
    ]);

    buildMapBase();
    buildGlobeBase();
    enableGlobeDrag();
    await updateYear(YEARS[0]);
    syncRotationControls();
    startGlobeRotation();
}

init().catch(err => {
    console.error("vis2 failed to initialize:", err);
    statusLine.text("Failed to initialize vis2. Please check data files and local server.");
});
