const outerWidth = 1040;
const outerHeight = 760;
const legendSpace = 140;
const panelGap = 46;
const margin = { top: 20, right: 120, bottom: 55, left: 95 };
const yAxisLabelOffset = 28;
const width = outerWidth - margin.left - margin.right;
const plottingHeight = outerHeight - margin.top - margin.bottom - legendSpace;
const barHeight = Math.round(plottingHeight * 0.6);
const lineHeight = plottingHeight - barHeight - panelGap;

const chartSvg = d3.select("#stacked-bar-chart")
    .attr("width", outerWidth)
    .attr("height", outerHeight)
    .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

const root = chartSvg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const barG = root.append("g").attr("class", "bar-panel");
const lineG = root
    .append("g")
    .attr("class", "line-panel")
    .attr("transform", `translate(0,${barHeight + panelGap})`);

const x = d3.scaleBand().range([0, width]).padding(0.05);
const yBar = d3.scaleLinear().range([barHeight, 0]);
const yLine = d3.scaleLinear().range([lineHeight, 0]);

const line = d3.line()
    .x((d) => x(d.Year) + x.bandwidth() / 2)
    .y((d) => yLine(d.value));

// Fire/source type labels (NASA Earthdata): 0=vegetation fire, 1=volcano, 2=static land, 3=offshore
const FIRE_TYPE_LABELS = {
    "0": "Presumed vegetation fire",
    "1": "Active volcano",
    "2": "Other static land source",
    "3": "Offshore"
};
const FIRE_TYPE_KEYS = ["0", "1", "2", "3"];
const fireTypeNames = FIRE_TYPE_KEYS.map((k) => FIRE_TYPE_LABELS[k]);

const color = d3.scaleOrdinal()
    .domain(fireTypeNames)
    .range(["#264653", "#2a9d8f", "#e9c46a", "#f4a261"]);

// Scientific notation: e.g., 2.0×10⁶, 1.5×10⁻¹
function sciFormat(v) {
    if (v === 0 || !isFinite(v)) return "0";
    const absV = Math.abs(v);
    const exp = Math.floor(Math.log10(absV));
    const mantissa = ((v < 0 ? -1 : 1) * absV / Math.pow(10, exp)).toFixed(1);
    const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    const toSuper = (n) => String(n).split("").map((c) => sup[+c]).join("");
    const expStr = exp < 0 ? "⁻" + toSuper(-exp) : toSuper(exp);
    return mantissa + "×10" + expStr;
}

const integerFormat = d3.format(",");
const decimalFormat = d3.format(",.2f");

function formatMetricValue(metricKey, value) {
    if (!Number.isFinite(value)) return "N/A";
    if (metricKey === "tem") return `${decimalFormat(value)} °C`;
    if (metricKey === "precip") return `${decimalFormat(value)} mm`;
    if (metricKey === "co2") return `${integerFormat(Math.round(value))}`;
    return decimalFormat(value);
}

function drawGrid(gridG, scale, panelHeight, tickCount) {
    const ticks = scale.ticks(tickCount);
    const lines = gridG.selectAll("line").data(ticks);

    lines.enter()
        .append("line")
        .attr("class", "grid-line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", (d) => scale(d))
        .attr("y2", (d) => scale(d));

    lines
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", (d) => scale(d))
        .attr("y2", (d) => scale(d));

    lines.exit().remove();
}

(function loadData() {
    return Promise.all([
        d3.csv("../data/preprocessed/wildfire_count_by_year_type.csv"),
        d3.csv("../data/preprocessed/global_co2_by_year.csv"),
        d3.csv("../data/preprocessed/global_precip_by_year.csv"),
        d3.csv("../data/preprocessed/global_tem_by_year.csv")
    ]);
})().then(function([wildfireData, co2Data, precipData, temData]) {
    wildfireData = wildfireData.map((d) => ({
        year: String(d.year ?? d.YEAR ?? ""),
        type: String(d.type ?? d.TYPE ?? ""),
        count: +(d.count ?? d.COUNT ?? 0)
    })).filter((d) => d.year);

    co2Data = co2Data.map((d) => ({
        year: String(d.year ?? d.YEAR ?? ""),
        global_total_co2: +(d.global_total_co2 ?? d.GLOBAL_TOTAL_CO2 ?? 0)
    })).filter((d) => d.year);

    precipData = precipData.map((d) => ({
        YEAR: String(d.YEAR ?? d.year ?? ""),
        ANN: +(d.ANN ?? d.ann ?? 0)
    })).filter((d) => d.YEAR);

    temData = temData.map((d) => ({
        YEAR: String(d.YEAR ?? d.year ?? ""),
        ANN: +(d.ANN ?? d.ann ?? 0)
    })).filter((d) => d.YEAR);

    const years = [...new Set(wildfireData.map((d) => d.year))].sort((a, b) => +a - +b);
    const aggregatedData = years.map((year) => {
        const row = { Year: year };
        fireTypeNames.forEach((name) => {
            row[name] = 0;
        });

        wildfireData.filter((d) => d.year === year).forEach((d) => {
            const label = FIRE_TYPE_LABELS[d.type];
            if (label) row[label] += +d.count;
        });
        return row;
    });

    const stackedData = d3.stack().keys(fireTypeNames)(aggregatedData);

    x.domain(aggregatedData.map((d) => d.Year));
    const barMax = d3.max(stackedData, (layer) => d3.max(layer, (d) => d[1]));
    yBar.domain([0, barMax * 1.5]);

    const barYears = new Set(aggregatedData.map((d) => d.Year));
    const maxBarYear = d3.max([...barYears], (d) => +d);

    function buildLineData(metricKey) {
        if (metricKey === "co2") {
            const raw = co2Data.filter((d) => barYears.has(d.year)).map((d) => ({ Year: d.year, value: +d.global_total_co2 }));
            return {
                lineData: raw,
                minValue: 0,
                maxValue: d3.max(raw, (d) => d.value),
                yAxisLabel: "Global total CO2 (million tonnes C)",
                metricName: "CO2",
                maxYear: d3.max(raw, (d) => +d.Year)
            };
        }
        if (metricKey === "precip") {
            const raw = precipData.filter((d) => barYears.has(d.YEAR)).map((d) => ({ Year: d.YEAR, value: +d.ANN }));
            return {
                lineData: raw,
                minValue: 0,
                maxValue: d3.max(raw, (d) => d.value),
                yAxisLabel: "Global precipitation (annual mean, mm)",
                metricName: "Precipitation",
                maxYear: d3.max(raw, (d) => +d.Year)
            };
        }
        if (metricKey === "tem") {
            const raw = temData.filter((d) => barYears.has(d.YEAR)).map((d) => ({ Year: d.YEAR, value: +d.ANN }));
            return {
                lineData: raw,
                minValue: d3.min(raw, (d) => d.value) - 1,
                maxValue: d3.max(raw, (d) => d.value) + 1,
                yAxisLabel: "Global annual mean temperature (°C)",
                metricName: "Temperature",
                maxYear: d3.max(raw, (d) => +d.Year)
            };
        }
        return { lineData: [], minValue: 0, maxValue: 1, yAxisLabel: "", metricName: "", maxYear: null };
    }

    const co2Built = buildLineData("co2");
    let lineData = co2Built.lineData;
    yLine.domain([co2Built.minValue, co2Built.maxValue]);
    let lineDataByYear = new Map(lineData.map((d) => [d.Year, d.value]));
    let currentMetricKey = "co2";
    let currentMetricName = co2Built.metricName;
    let activeHoverYear = null;
    let lastHoverPosition = null;
    const aggregatedByYear = new Map(aggregatedData.map((d) => [d.Year, d]));

    const barGrid = barG.append("g").attr("class", "grid");
    const lineGrid = lineG.append("g").attr("class", "grid");
    drawGrid(barGrid, yBar, barHeight, 6);
    drawGrid(lineGrid, yLine, lineHeight, 5);

    barG.selectAll(".layer")
        .data(stackedData)
        .enter()
        .append("g")
        .attr("class", "layer")
        .attr("fill", (d) => color(d.key))
        .selectAll("rect")
        .data((d) => d)
        .enter()
        .append("rect")
        .attr("x", (d) => x(d.data.Year))
        .attr("y", (d) => yBar(d[1]))
        .attr("height", (d) => yBar(d[0]) - yBar(d[1]))
        .attr("width", x.bandwidth());

    const linePath = lineG.append("path")
        .datum(lineData)
        .attr("class", "line")
        .attr("fill", "none")
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .attr("d", line);

    const lineFocusDot = lineG.append("circle")
        .attr("class", "vis1-focus-dot")
        .attr("r", 4.5)
        .style("display", "none");

    const barYAxis = barG.append("g")
        .call(d3.axisLeft(yBar).ticks(6).tickFormat(sciFormat));

    const lineYAxis = lineG.append("g")
        .call(d3.axisLeft(yLine).ticks(5).tickFormat(sciFormat));

    lineG.append("g")
        .attr("transform", `translate(0,${lineHeight})`)
        .call(d3.axisBottom(x));

    root.append("line")
        .attr("x1", 0)
        .attr("x2", width)
        .attr("y1", barHeight + panelGap / 2)
        .attr("y2", barHeight + panelGap / 2)
        .attr("stroke", "#b9c6cf")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,4");

    lineG.append("text")
        .attr("transform", `translate(${width / 2}, ${lineHeight + margin.bottom - 4})`)
        .style("text-anchor", "middle")
        .text("Year");

    barG.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left + yAxisLabelOffset)
        .attr("x", 0 - barHeight / 2)
        .attr("text-anchor", "middle")
        .text("Number of detections");

    const lineYAxisLabel = lineG.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left + yAxisLabelOffset)
        .attr("x", 0 - lineHeight / 2)
        .attr("text-anchor", "middle")
        .text("Global total CO2 (million tonnes C)");

    const availabilityNote = lineG.append("text")
        .attr("x", width)
        .attr("y", -10)
        .attr("text-anchor", "end")
        .style("font-size", "12px")
        .style("fill", "#666");

    const hoverBandTop = barG.append("rect")
        .attr("class", "vis1-hover-band")
        .attr("y", 0)
        .attr("height", barHeight)
        .style("display", "none");

    const hoverBandBottom = lineG.append("rect")
        .attr("class", "vis1-hover-band")
        .attr("y", 0)
        .attr("height", lineHeight)
        .style("display", "none");

    const hoverLineTop = barG.append("line")
        .attr("class", "vis1-hover-line")
        .attr("y1", 0)
        .attr("y2", barHeight)
        .style("display", "none");

    const hoverLineBottom = lineG.append("line")
        .attr("class", "vis1-hover-line")
        .attr("y1", 0)
        .attr("y2", lineHeight)
        .style("display", "none");

    const hoverTooltip = d3.select("body").append("div")
        .attr("class", "vis1-tooltip")
        .style("opacity", 0);

    const hoverCapture = root.append("rect")
        .attr("class", "vis1-hover-capture")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", width)
        .attr("height", barHeight + panelGap + lineHeight)
        .on("mousemove", function(event) {
            const [pointerX] = d3.pointer(event, this);
            const year = getNearestYear(pointerX);
            if (!year) return;
            activeHoverYear = year;
            lastHoverPosition = { clientX: event.clientX, clientY: event.clientY };
            setYearFocus(year, lastHoverPosition);
        })
        .on("mouseleave", function() {
            activeHoverYear = null;
            lastHoverPosition = null;
            clearYearFocus();
        });

    function getNearestYear(pointerX) {
        let nearestYear = null;
        let minDistance = Infinity;
        aggregatedData.forEach((d) => {
            const center = x(d.Year) + x.bandwidth() / 2;
            const dist = Math.abs(center - pointerX);
            if (dist < minDistance) {
                minDistance = dist;
                nearestYear = d.Year;
            }
        });
        return nearestYear;
    }

    function setYearFocus(year, pointerPosition) {
        const row = aggregatedByYear.get(year);
        if (!row) return;

        const xStart = x(year);
        const xCenter = xStart + x.bandwidth() / 2;
        const lineValue = lineDataByYear.get(year);
        const totalDetections = d3.sum(fireTypeNames, (name) => row[name] || 0);

        hoverBandTop
            .style("display", null)
            .attr("x", xStart)
            .attr("width", x.bandwidth());

        hoverBandBottom
            .style("display", null)
            .attr("x", xStart)
            .attr("width", x.bandwidth());

        hoverLineTop
            .style("display", null)
            .attr("x1", xCenter)
            .attr("x2", xCenter);

        hoverLineBottom
            .style("display", null)
            .attr("x1", xCenter)
            .attr("x2", xCenter);

        barG.selectAll(".layer rect")
            .attr("opacity", (d) => d.data.Year === year ? 1 : 0.32);

        if (Number.isFinite(lineValue)) {
            lineFocusDot
                .style("display", null)
                .attr("cx", xCenter)
                .attr("cy", yLine(lineValue));
        } else {
            lineFocusDot.style("display", "none");
        }

        hoverTooltip
            .style("opacity", 1)
            .html(
                `<div class="vis1-tooltip-year">Year ${year}</div>` +
                `<div class="vis1-tooltip-row"><span>Total detections</span><strong>${integerFormat(totalDetections)}</strong></div>` +
                fireTypeNames.map((name) =>
                    `<div class="vis1-tooltip-row"><span>${name}</span><strong>${integerFormat(row[name] || 0)}</strong></div>`
                ).join("") +
                `<div class="vis1-tooltip-divider"></div>` +
                `<div class="vis1-tooltip-row"><span>${currentMetricName}</span><strong>${formatMetricValue(currentMetricKey, lineValue)}</strong></div>`
            );

        if (pointerPosition) {
            hoverTooltip
                .style("left", `${pointerPosition.clientX + 12}px`)
                .style("top", `${pointerPosition.clientY - 12}px`);
        }
    }

    function clearYearFocus() {
        hoverBandTop.style("display", "none");
        hoverBandBottom.style("display", "none");
        hoverLineTop.style("display", "none");
        hoverLineBottom.style("display", "none");
        lineFocusDot.style("display", "none");
        hoverTooltip.style("opacity", 0);
        barG.selectAll(".layer rect").attr("opacity", 1);
    }

    function updateAvailabilityNote(built) {
        if (!Number.isFinite(built.maxYear) || built.maxYear >= maxBarYear) {
            availabilityNote.text("");
            return;
        }
        availabilityNote.text(`${built.metricName} data available through ${built.maxYear}; ${maxBarYear} unavailable.`);
    }

    updateAvailabilityNote(co2Built);

    d3.select("#co2-button").on("click", function() {
        updateLine("co2");
    });

    d3.select("#precipitation-button").on("click", function() {
        updateLine("precip");
    });

    d3.select("#temperature-button").on("click", function() {
        updateLine("tem");
    });

    function updateLine(metricKey) {
        const built = buildLineData(metricKey);
        lineData = built.lineData;
        yLine.domain([built.minValue, built.maxValue]);
        lineDataByYear = new Map(lineData.map((d) => [d.Year, d.value]));
        currentMetricKey = metricKey;
        currentMetricName = built.metricName;

        linePath
            .datum(lineData)
            .transition()
            .duration(900)
            .attr("d", line);

        lineYAxis
            .transition()
            .duration(900)
            .call(d3.axisLeft(yLine).ticks(5).tickFormat(sciFormat));

        drawGrid(lineGrid, yLine, lineHeight, 5);

        lineYAxisLabel
            .transition()
            .duration(500)
            .text(built.yAxisLabel);

        updateAvailabilityNote(built);

        if (activeHoverYear && lastHoverPosition) {
            setYearFocus(activeHoverYear, lastHoverPosition);
        }
    }

    const legend = root.append("g")
        .attr("transform", `translate(0, ${plottingHeight + margin.bottom + 20})`);

    legend.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .style("font-size", "15px")
        .style("font-weight", "bold")
        .text("Fire / source type");

    const markerSize = 18;
    const markerTextGap = 8;
    const legendItemGap = 28;
    const legendRowGap = 28;
    const legendStartY = 18;

    const measuredLegendItems = fireTypeNames.map((typeName) => {
        const probe = legend.append("text")
            .style("font-size", "12px")
            .style("visibility", "hidden")
            .text(typeName);
        const textWidth = probe.node().getBBox().width;
        probe.remove();
        return { typeName, itemWidth: markerSize + markerTextGap + textWidth };
    });

    let legendX = 0;
    let legendY = legendStartY;
    measuredLegendItems.forEach(({ typeName, itemWidth }) => {
        if (legendX > 0 && legendX + itemWidth > width) {
            legendX = 0;
            legendY += legendRowGap;
        }
        const legendRow = legend.append("g")
            .attr("transform", `translate(${legendX}, ${legendY})`);

        legendRow.append("rect")
            .attr("width", markerSize)
            .attr("height", markerSize)
            .attr("fill", color(typeName));

        legendRow.append("text")
            .attr("x", markerSize + markerTextGap)
            .attr("y", 13)
            .style("font-size", "12px")
            .text(typeName);

        legendX += itemWidth + legendItemGap;
    });
}).catch(function(err) {
    console.error("Failed to load data:", err);
    alert("图表无法加载数据。请勿直接双击打开 HTML，改用本地服务器打开：\n\n在终端进入项目根目录，运行\n  python -m http.server 8080\n然后浏览器访问 http://localhost:8080/website/vis1.html");
});
