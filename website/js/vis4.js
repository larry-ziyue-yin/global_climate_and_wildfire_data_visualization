// Visualization 4: Climate-Wildfire Correlation Heatmap
// Shows relationships between climate indicators and wildfire types

const SVG_W = 940;
const SVG_H = 780;
const margin = { top: 92, right: 36, bottom: 36, left: 132 };
const innerW = SVG_W - margin.left - margin.right;
const innerH = SVG_H - margin.top - margin.bottom;

const svg = d3.select("#heatmap-svg")
    .attr("viewBox", `0 0 ${SVG_W} ${SVG_H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

const plotG = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("#heatmap-tooltip");
const yearRangeStart = d3.select("#year-range-start");
const yearRangeEnd = d3.select("#year-range-end");
const yearRangeFill = d3.select("#year-range-fill");
const yearRangeStartLabel = d3.select("#year-range-start-label");
const yearRangeEndLabel = d3.select("#year-range-end-label");
const playBtn = d3.select("#play-button");
const speedSlider = d3.select("#speed-slider");
const speedValue = d3.select("#speed-value");
const statusLine = d3.select("#vis4-status");
const insightsList = d3.select("#insights-list");

// Variable configurations
const variables = [
    { key: "co2", label: "CO2 Emissions", unit: "Mt C", color: "#264653" },
    { key: "temperature", label: "Temperature", unit: "°C", color: "#e76f51" },
    { key: "precipitation", label: "Precipitation", unit: "mm", color: "#2a9d8f" },
    { key: "vegetation", label: "Vegetation Fire", unit: "count", color: "#f4a261" },
    { key: "volcano", label: "Volcano", unit: "count", color: "#e9c46a" },
    { key: "static", label: "Static Land", unit: "count", color: "#9b5de5" },
    { key: "offshore", label: "Offshore", unit: "count", color: "#06d6a0" }
];

const climateVars = ["co2", "temperature", "precipitation"];
const fireVars = ["vegetation", "volcano", "static", "offshore"];

// Fire type mapping from data keys to variable keys
const fireTypeMap = {
    "0": "vegetation",
    "1": "volcano",
    "2": "static",
    "3": "offshore"
};

let wildfireData = [];
let climateData = {};
let years = [];
let startYear = 2012;
let endYear = 2025;
let playTimer = null;
let isPlaying = false;

const BASE_ANIMATION_MS = 1500;
const MIN_ANIMATION_MS = 200;

// Color scale for correlation (-1 to 1)
function getCorrelationColor(value) {
    if (value === null || value === undefined || isNaN(value)) return "#e5e7eb";
    
    // Diverging color scale: blue (negative) -> white (0) -> red (positive)
    if (value < 0) {
        const intensity = Math.abs(value);
        return d3.interpolateRgb("#93c5fd", "#3b82f6")(intensity);
    } else {
        const intensity = value;
        return d3.interpolateRgb("#fca5a5", "#ef4444")(intensity);
    }
}

function fmtNumber(n, decimals = 2) {
    if (n === null || n === undefined || !Number.isFinite(n)) return "N/A";
    return n.toFixed(decimals);
}

function fmtInt(n) {
    return d3.format(",")(Math.round(n));
}

function showTooltip(event, d) {
    const panel = document.querySelector(".chart-panel");
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const corrValue = d.correlation;
    const isPositive = corrValue > 0;
    
    // d.n is calculated in calculateCorrelations function
    const dataPoints = d.n;
    
    tooltip
        .style("opacity", 1)
        .style("left", `${event.clientX - r.left}px`)
        .style("top", `${event.clientY - r.top}px`)
        .html(
            `<div class="tooltip-header">${d.var1.label} ↔ ${d.var2.label}</div>
            <div class="tooltip-row">
                <span class="tooltip-label">Correlation:</span>
                <span class="tooltip-value ${isPositive ? 'positive' : 'negative'}">${fmtNumber(corrValue)}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">Data points:</span>
                <span class="tooltip-value">${dataPoints}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">Years:</span>
                <span class="tooltip-value">${startYear}-${endYear}</span>
            </div>`
        );
}

function hideTooltip() {
    tooltip.style("opacity", 0);
}

// Pearson correlation coefficient
function pearsonCorrelation(x, y) {
    const n = x.length;
    if (n < 3) return null; // Need at least 3 points for meaningful correlation
    
    const sumX = d3.sum(x);
    const sumY = d3.sum(y);
    const sumXY = d3.sum(x.map((xi, i) => xi * y[i]));
    const sumX2 = d3.sum(x.map(xi => xi * xi));
    const sumY2 = d3.sum(y.map(yi => yi * yi));
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0 || isNaN(numerator) || isNaN(denominator)) return null;
    return numerator / denominator;
}

// Build yearly aggregated climate + fire data
function buildYearlyClimateData() {
    // Initialize with all years
    const data = {};
    years.forEach(year => {
        data[year] = {
            year,
            co2: null,
            temperature: null,
            precipitation: null,
            fireTypes: {
                vegetation: 0,
                volcano: 0,
                static: 0,
                offshore: 0
            }
        };
    });
    
    // Fill wildfire data
    wildfireData.forEach(d => {
        const year = d.year;
        const typeKey = String(d.type);
        const varKey = fireTypeMap[typeKey];
        if (varKey && data[year]) {
            data[year].fireTypes[varKey] = d.count;
        }
    });
    
    // Fill climate data - CO2
    if (climateData.co2) {
        climateData.co2.forEach(d => {
            const year = d.year;
            if (data[year]) {
                data[year].co2 = d.value;
            }
        });
    }
    
    // Fill climate data - Temperature
    if (climateData.temperature) {
        climateData.temperature.forEach(d => {
            const year = d.year;
            if (data[year]) {
                data[year].temperature = d.value;
            }
        });
    }
    
    // Fill climate data - Precipitation
    if (climateData.precipitation) {
        climateData.precipitation.forEach(d => {
            const year = d.year;
            if (data[year]) {
                data[year].precipitation = d.value;
            }
        });
    }
    
    return data;
}

// Flatten yearly data to arrays for correlation calculation
function flattenDataForCorrelation(var1Key, var2Key, yearlyData, filteredYears) {
    const x = [];
    const y = [];
    
    filteredYears.forEach(year => {
        const data = yearlyData[year];
        if (!data) return;
        
        // Get value 1
        let v1;
        if (climateVars.includes(var1Key)) {
            v1 = data[var1Key];
        } else {
            v1 = data.fireTypes[var1Key];
        }
        
        // Get value 2
        let v2;
        if (climateVars.includes(var2Key)) {
            v2 = data[var2Key];
        } else {
            v2 = data.fireTypes[var2Key];
        }
        
        if (v1 !== null && v1 !== undefined && Number.isFinite(v1) &&
            v2 !== null && v2 !== undefined && Number.isFinite(v2)) {
            x.push(v1);
            y.push(v2);
        }
    });
    
    return { x, y };
}

// Calculate correlation matrix for a year range
function calculateCorrelations() {
    const yearlyData = buildYearlyClimateData();
    const filteredYears = years.filter(y => y >= startYear && y <= endYear);
    
    const results = [];
    
    variables.forEach((var1) => {
        variables.forEach((var2) => {
            const { x, y } = flattenDataForCorrelation(
                var1.key, var2.key, yearlyData, filteredYears
            );
            
            const correlation = pearsonCorrelation(x, y);
            results.push({
                var1,
                var2,
                correlation,
                n: x.length
            });
        });
    });
    
    return results;
}

// Generate insights from correlations
function generateInsights(correlations) {
    const insights = [];
    
    // Find strongest positive correlations (excluding self-correlations)
    const positiveCorrs = correlations
        .filter(c => c.var1.key !== c.var2.key && c.correlation > 0.5)
        .sort((a, b) => b.correlation - a.correlation)
        .slice(0, 5);
    
    // Find strongest negative correlations
    const negativeCorrs = correlations
        .filter(c => c.var1.key !== c.var2.key && c.correlation < -0.3)
        .sort((a, b) => a.correlation - b.correlation)
        .slice(0, 4);
    
    positiveCorrs.forEach(c => {
        insights.push({
            type: "positive",
            title: `${c.var1.label} ↔ ${c.var2.label}`,
            value: c.correlation,
            desc: c.correlation > 0.7 ? "Strong positive" : "Moderate positive",
            n: c.n
        });
    });
    
    negativeCorrs.forEach(c => {
        insights.push({
            type: "negative",
            title: `${c.var1.label} ↔ ${c.var2.label}`,
            value: c.correlation,
            desc: c.correlation < -0.7 ? "Strong negative" : "Moderate negative",
            n: c.n
        });
    });
    
    return insights;
}

// Render the heatmap
function renderHeatmap(correlations) {
    plotG.selectAll("*").remove();
    
    const matrixSize = Math.min(innerW, innerH);
    const gridSize = matrixSize / variables.length;
    const xScale = d3.scaleBand()
        .domain(variables.map(v => v.key))
        .range([0, matrixSize])
        .padding(0.02);
    
    const yScale = d3.scaleBand()
        .domain(variables.map(v => v.key))
        .range([0, matrixSize])
        .padding(0.02);
    
    // Correlation cells
    const cells = plotG.selectAll(".heatmap-cell")
        .data(correlations)
        .enter()
        .append("g")
        .attr("class", "heatmap-cell")
        .attr("transform", d => {
            const tx = xScale(d.var2.key);
            const ty = yScale(d.var1.key);
            return `translate(${tx}, ${ty})`;
        });
    
    cells.append("rect")
        .attr("width", xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("fill", d => d.correlation !== null ? getCorrelationColor(d.correlation) : "#ffffff")
        .attr("rx", 4)
        .on("mousemove", showTooltip)
        .on("mouseleave", hideTooltip);
    
    // Correlation values
    cells.append("text")
        .attr("x", xScale.bandwidth() / 2)
        .attr("y", yScale.bandwidth() / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "11px")
        .attr("font-weight", "700")
        .attr("fill", d => {
            if (d.correlation === null) return "#9ca3af";
            return Math.abs(d.correlation) > 0.5 ? "#fff" : "#2f4b58";
        })
        .text(d => d.correlation !== null ? fmtNumber(d.correlation, 2) : "N/A");
    
    // Row labels (left)
    plotG.selectAll(".row-label")
        .data(variables)
        .enter()
        .append("text")
        .attr("class", "heatmap-label")
        .attr("x", -12)
        .attr("y", d => yScale(d.key) + yScale.bandwidth() / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .text(d => d.label);
    
    // Column labels (top)
    plotG.selectAll(".col-label")
        .data(variables)
        .enter()
        .append("text")
        .attr("class", "heatmap-label")
        .attr("x", d => xScale(d.key) + xScale.bandwidth() / 2)
        .attr("y", -14)
        .attr("text-anchor", "middle")
        .text(d => d.label);
    
    // Divider lines between climate and fire variables
    const climateLast = climateVars[climateVars.length - 1];
    const fireFirst = fireVars[0];
    const climateEndX = xScale(climateLast) + xScale.bandwidth();
    const fireStartX = xScale(fireFirst);
    const climateEndY = yScale(climateLast) + yScale.bandwidth();
    const fireStartY = yScale(fireFirst);
    const dividerX = (climateEndX + fireStartX) / 2;
    const dividerY = (climateEndY + fireStartY) / 2;
    
    // Vertical divider
    plotG.append("line")
        .attr("class", "axis-line")
        .attr("x1", dividerX)
        .attr("y1", 0)
        .attr("x2", dividerX)
        .attr("y2", matrixSize);
    
    // Horizontal divider
    plotG.append("line")
        .attr("class", "axis-line")
        .attr("x1", 0)
        .attr("y1", dividerY)
        .attr("x2", matrixSize)
        .attr("y2", dividerY);
    
    // Section labels
    const sectionLabelOffset = -48;
    const climateCenterX = d3.mean(climateVars, key => xScale(key) + xScale.bandwidth() / 2);
    const fireCenterX = d3.mean(fireVars, key => xScale(key) + xScale.bandwidth() / 2);
    
    plotG.append("text")
        .attr("x", climateCenterX)
        .attr("y", sectionLabelOffset)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "700")
        .style("fill", "#4d6571")
        .text("CLIMATE FACTORS");
    
    plotG.append("text")
        .attr("x", fireCenterX)
        .attr("y", sectionLabelOffset)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "700")
        .style("fill", "#4d6571")
        .text("WILDFIRE TYPES");
    
    // Year range label
    plotG.append("text")
        .attr("x", innerW)
        .attr("y", sectionLabelOffset)
        .attr("text-anchor", "end")
        .style("font-size", "14px")
        .style("font-weight", "700")
        .style("font-family", "Space Grotesk, sans-serif")
        .style("fill", "#64748b")
        .text(`${startYear} - ${endYear}`);
}

// Render insights
function renderInsights(insights) {
    insightsList.html("");
    
    if (insights.length === 0) {
        insightsList.append("p")
            .attr("class", "insight-placeholder")
            .text("No strong correlations found. Try expanding the year range.");
        return;
    }
    
    insights.forEach(insight => {
        const item = insightsList.append("div")
            .attr("class", `insight-item ${insight.type}`);
        
        item.append("div")
            .attr("class", "insight-title")
            .text(insight.title);
        
        item.append("div")
            .attr("class", "insight-value")
            .text(fmtNumber(insight.value, 2));
        
        item.append("div")
            .attr("class", "insight-desc")
            .text(`${insight.desc} (${insight.n} years)`);
    });
}

// Update visualization
function update() {
    const correlations = calculateCorrelations();
    const insights = generateInsights(correlations);
    
    renderHeatmap(correlations);
    renderInsights(insights);
    
    const filteredYears = years.filter(y => y >= startYear && y <= endYear);
    statusLine.text(`Showing ${filteredYears.length} years (${startYear}-${endYear}) with ${filteredYears.length} data points per correlation.`);
}

// Year range controls
function getYearIndex(year) {
    const idx = years.indexOf(year);
    return idx >= 0 ? idx : 0;
}

function updateYearRangeFill(startIdx, endIdx) {
    const maxIdx = Math.max(1, years.length - 1);
    const left = (startIdx / maxIdx) * 100;
    const right = (endIdx / maxIdx) * 100;
    yearRangeFill
        .style("left", `${left}%`)
        .style("width", `${Math.max(0, right - left)}%`);
}

function syncYearRangeWidget() {
    const startIdx = getYearIndex(startYear);
    const endIdx = getYearIndex(endYear);

    yearRangeStart.property("value", startIdx);
    yearRangeEnd.property("value", endIdx);
    yearRangeStartLabel.text(startYear);
    yearRangeEndLabel.text(endYear);
    updateYearRangeFill(startIdx, endIdx);
}

function applyRangeFromSliders(changedHandle) {
    let startIdx = +yearRangeStart.property("value");
    let endIdx = +yearRangeEnd.property("value");

    if (startIdx > endIdx) {
        if (changedHandle === "start") endIdx = startIdx;
        else startIdx = endIdx;
    }

    startYear = years[startIdx];
    endYear = years[endIdx];
    syncYearRangeWidget();

    stopAnimation();
    update();
}

function initYearRangeWidget() {
    const maxIdx = years.length - 1;
    yearRangeStart
        .attr("min", 0)
        .attr("max", maxIdx)
        .attr("step", 1);
    yearRangeEnd
        .attr("min", 0)
        .attr("max", maxIdx)
        .attr("step", 1);

    syncYearRangeWidget();

    yearRangeStart.on("input", () => applyRangeFromSliders("start"));
    yearRangeEnd.on("input", () => applyRangeFromSliders("end"));
}

// Animation controls
function getAnimationSpeed() {
    const speed = +speedSlider.property("value");
    return Math.max(MIN_ANIMATION_MS, Math.round(BASE_ANIMATION_MS / (speed || 1)));
}

function setSpeedLabel() {
    const speed = +(speedSlider.property("value") || 1);
    speedValue.text(`${speed.toFixed(1)}x`);
}

function stopAnimation() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    isPlaying = false;
    playBtn.text("Play").classed("playing", false);
}

function startAnimation() {
    stopAnimation();
    isPlaying = true;
    playBtn.text("Pause").classed("playing", true);
    
    const minSpan = 2;  // Minimum 2-year span for correlation
    const maxSpan = years.length - 1;  // Maximum span (e.g., 13 for 14 years)
    
    let currentSpan = minSpan;  // Start from smallest range
    let currentStartIdx = 0;
    let expanding = true;
    
    playTimer = setInterval(() => {
        // Update range using indices (supports non-contiguous year arrays)
        const maxStartIdx = years.length - currentSpan - 1;
        currentStartIdx = Math.max(0, Math.min(maxStartIdx, currentStartIdx));
        startYear = years[currentStartIdx];
        endYear = years[currentStartIdx + currentSpan];

        // Update UI
        syncYearRangeWidget();
        update();
        
        // Calculate next span
        if (expanding) {
            if (currentSpan >= maxSpan) {
                expanding = false;  // Start contracting
            } else {
                currentSpan++;
            }
        } else {
            if (currentSpan <= minSpan) {
                expanding = true;  // Start expanding again
                currentStartIdx = 0;  // Reset to beginning
            } else {
                currentSpan--;
                // Move start forward when contracting
                if (currentStartIdx < years.length - currentSpan - 1) {
                    currentStartIdx++;
                }
            }
        }
    }, getAnimationSpeed());
}

playBtn.on("click", function() {
    if (isPlaying) stopAnimation();
    else startAnimation();
});

speedSlider.on("input", function() {
    setSpeedLabel();
    if (isPlaying) {
        stopAnimation();
        startAnimation();
    }
});

// Load all data
async function loadData() {
    try {
        const [wildfire, co2, temp, precip] = await Promise.all([
            d3.csv("../data/preprocessed/wildfire_count_by_year_type.csv"),
            d3.csv("../data/preprocessed/global_co2_by_year.csv"),
            d3.csv("../data/preprocessed/global_tem_by_year.csv"),
            d3.csv("../data/preprocessed/global_precip_by_year.csv")
        ]);
        
        // Process wildfire data - year as NUMBER
        wildfireData = wildfire.map(d => ({
            year: +(d.year ?? d.YEAR ?? 0),
            type: String(d.type ?? d.TYPE ?? ""),
            count: +(d.count ?? d.COUNT ?? 0)
        })).filter(d => d.year >= 2012 && d.year <= 2025 && d.type);
        
        // Process CO2 data - year as NUMBER
        climateData.co2 = co2.map(d => ({
            year: +(d.year ?? d.YEAR ?? 0),
            value: +(d.global_total_co2 ?? d.GLOBAL_TOTAL_CO2 ?? 0)
        })).filter(d => d.year >= 2012 && d.year <= 2025 && Number.isFinite(d.value));
        
        // Process Temperature data - year as NUMBER (column is YEAR, value is ANN)
        climateData.temperature = temp.map(d => ({
            year: +(d.YEAR ?? d.year ?? 0),
            value: +(d.ANN ?? d.ann ?? 0)
        })).filter(d => d.year >= 2012 && d.year <= 2025 && Number.isFinite(d.value));
        
        // Process Precipitation data - year as NUMBER (column is YEAR, value is ANN)
        climateData.precipitation = precip.map(d => ({
            year: +(d.YEAR ?? d.year ?? 0),
            value: +(d.ANN ?? d.ann ?? 0)
        })).filter(d => d.year >= 2012 && d.year <= 2025 && Number.isFinite(d.value));
        
        // Get available years from wildfire data (years with complete fire type data)
        years = [...new Set(wildfireData.map(d => d.year))].sort((a, b) => a - b);
        
        if (years.length === 0) {
            throw new Error("No wildfire data found");
        }
        
        // Filter to years with both wildfire AND climate data
        const fireYears = new Set(years);
        const co2Years = new Set(climateData.co2.map(d => d.year));
        const tempYears = new Set(climateData.temperature.map(d => d.year));
        const precipYears = new Set(climateData.precipitation.map(d => d.year));
        
        years = years.filter(year => 
            co2Years.has(year) && 
            tempYears.has(year) && 
            precipYears.has(year)
        ).sort((a, b) => a - b);
        
        if (years.length < 3) {
            throw new Error("Not enough overlapping years between wildfire and climate data");
        }
        
        // Adjust year range based on available data
        startYear = years[0];
        endYear = years[years.length - 1];
        
        console.log("Data loaded:", {
            years: years.length,
            yearRange: `${years[0]}-${years[years.length - 1]}`,
            co2Records: climateData.co2.length,
            tempRecords: climateData.temperature.length,
            precipRecords: climateData.precipitation.length,
            fireRecords: wildfireData.length
        });
        
        initYearRangeWidget();
        update();
        
    } catch (err) {
        console.error("Failed to load vis4 data:", err);
        statusLine.text("Failed to load data: " + err.message);
    }
}

// Initialize
loadData();
