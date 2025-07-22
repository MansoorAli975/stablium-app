import { useEffect, useRef } from "react";
import * as LightweightCharts from "lightweight-charts";
import { fetchCandles } from "../utils/candleAPI";
import ResizeObserver from "resize-observer-polyfill";

const Chart = ({ selectedSymbol, forexPrice }) => {
    const chartContainerRef = useRef(null);
    const chartRef = useRef(null);
    const candleSeriesRef = useRef(null);
    const priceLineRef = useRef(null);
    const refreshInterval = useRef(null);
    const resizeObserverRef = useRef(null);

    // Mount chart once
    useEffect(() => {
        const chartElement = chartContainerRef.current;
        if (!chartElement) return;

        chartElement.innerHTML = "";

        const chart = LightweightCharts.createChart(chartElement, {
            autoSize: true,
            layout: {
                background: { color: "#10141e" },
                textColor: "white",
                fontFamily: "'Open Sans', sans-serif",
            },
            grid: {
                vertLines: { color: "#2E3548" },
                horzLines: { color: "#2E3548" },
            },
            priceScale: {
                borderColor: "#71649C",
                mode: LightweightCharts.PriceScaleMode.Normal,
            },
            timeScale: {
                borderColor: "#71649C",
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    color: "#3D3D3D",
                    width: 1,
                    style: LightweightCharts.LineStyle.Solid,
                    labelBackgroundColor: "#3D3D3D",
                },
                horzLine: {
                    color: "#3D3D3D",
                    width: 1,
                    style: LightweightCharts.LineStyle.Solid,
                    labelBackgroundColor: "#3D3D3D",
                },
            },
        });

        chartRef.current = chart;

        candleSeriesRef.current = chart.addCandlestickSeries({
            upColor: "#00FF90",
            downColor: "#FF4B4B",
            borderVisible: false,
            wickUpColor: "#00FF90",
            wickDownColor: "#FF4B4B",
        });

        resizeObserverRef.current = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            chart.applyOptions({ width, height });
            chart.timeScale().fitContent();
        });

        resizeObserverRef.current.observe(chartElement);

        return () => {
            clearInterval(refreshInterval.current);
            resizeObserverRef.current?.disconnect();
            chart.remove();
        };
    }, []);

    // Load candle data when symbol changes
    useEffect(() => {
        const loadCandles = async () => {
            const candles = await fetchCandles(selectedSymbol);
            if (candles?.length && candleSeriesRef.current) {
                candleSeriesRef.current.setData(candles);
                chartRef.current?.timeScale().fitContent();
            }
        };

        loadCandles();
        clearInterval(refreshInterval.current);
        refreshInterval.current = setInterval(loadCandles, 60000);

        return () => clearInterval(refreshInterval.current);
    }, [selectedSymbol]);

    // Draw or update live price line from on-chain price
    useEffect(() => {
        if (!forexPrice || !candleSeriesRef.current) return;
        const livePrice = forexPrice?.price ?? forexPrice?.p;
        if (!livePrice || isNaN(livePrice)) return;

        if (priceLineRef.current) {
            priceLineRef.current.applyOptions({ price: livePrice });
        } else {
            priceLineRef.current = candleSeriesRef.current.createPriceLine({
                price: livePrice,
                color: "#FFD700",
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: "Live",
            });
        }
    }, [forexPrice?.price]);

    return (
        <div className="chart-wrapper">
            <div className="chart-symbol-label">{selectedSymbol}</div>
            <div ref={chartContainerRef} className="chart-container" />
        </div>
    );
};

export default Chart;
